import { AIProvider } from "../config/providers";
import { ProviderManagerService } from "./provider.manager"; // [NEW] 引入管理器
import { logger } from "../utils/logger";
import { LogService } from "./log.service";
import { buildModelAliasMaps, normalizeModelName } from "../utils/model-normalizer";
import { RoutingScoreService } from "./routing.score.service";

// 分發服務 (Dispatcher Service)
// "信使邏輯"：根據請求的模型選擇合適的上游提供商
export class DispatcherService {
  private static readonly INITIAL_PENALTY_MS = 30 * 60_000; // 30 分鐘
  private static readonly MAX_PENALTY_MS = 4 * 60 * 60_000; // 最長 4 小時
  private static cooldowns = new Map<string, { until: number; backoffMs: number }>(); // key: providerId:model

  private static key(providerId: string, modelName: string) {
    return `${providerId}:${modelName}`;
  }

  private static setCooldown(providerId: string, modelName: string, backoffMs: number) {
    const until = Date.now() + backoffMs;
    this.cooldowns.set(this.key(providerId, modelName), { until, backoffMs });
    LogService.trackCooldown(providerId, ProviderManagerService.getAll().find(p => p.id === providerId)?.name || providerId, modelName);
    logger.warn(`[Dispatcher] 暫停上游: provider=${providerId} model=${modelName} 直到 ${new Date(until).toISOString()} (backoff=${backoffMs}ms)`);
  }

  // [NEW] 清除冷卻 (用於同步成功後的大赦)
  static clearCooldown(providerId: string, modelName: string) {
    const key = this.key(providerId, modelName);
    if (this.cooldowns.has(key)) {
      this.cooldowns.delete(key);
      logger.info(`[Dispatcher] 解除冷卻 (同步成功): provider=${providerId} model=${modelName}`);
    }
  }

  static penalize(providerId: string, modelName: string, durationMs = this.INITIAL_PENALTY_MS) {
    const key = this.key(providerId, modelName);
    const existing = this.cooldowns.get(key);
    const backoff = existing
      ? Math.min(existing.backoffMs * 2, this.MAX_PENALTY_MS)
      : Math.max(durationMs, this.INITIAL_PENALTY_MS);
    this.setCooldown(providerId, modelName, backoff);
  }

  private static async probeModel(provider: AIProvider, modelName: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1
        }),
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private static async isAvailable(provider: AIProvider, modelName: string): Promise<boolean> {
    const key = this.key(provider.id, modelName);
    const entry = this.cooldowns.get(key);

    // [NEW] 信任機制：如果後台剛剛同步成功 (例如 5 分鐘內)，則無條件信任
    const RECENT_SYNC_THRESHOLD = 5 * 60 * 1000;
    if (provider.lastSyncedAt && (Date.now() - provider.lastSyncedAt < RECENT_SYNC_THRESHOLD)) {
      if (entry) {
        this.cooldowns.delete(key);
        logger.info(`[Dispatcher] 信任後台同步結果，強制解除冷卻: provider=${provider.id}`);
      }
      return true;
    }

    if (!entry) return true;

    const now = Date.now();
    if (entry.until > now) return false;

    // 冷卻到期，嘗試自愈
    const ok = await this.probeModel(provider, modelName);
    if (ok) {
      this.cooldowns.delete(key);
      logger.info(`[Dispatcher] 上游恢復: provider=${provider.id} model=${modelName}`);
      return true;
    }

    // 自愈失敗，延長冷卻（指數回退，封頂）
    const nextBackoff = Math.min(entry.backoffMs * 2, this.MAX_PENALTY_MS);
    this.setCooldown(provider.id, modelName, nextBackoff);
    return false;
  }

  private static shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // 根據模型名稱獲取提供商 (Get Provider for Model)
  static async getProviderForModel(modelName: string, excludedIds: string[] = []): Promise<{ provider: AIProvider; resolvedModel: string } | null> {
    // 1. 從數據庫中獲取所有活躍的提供商
    const allProviders = ProviderManagerService.getAll();

    const aliasMaps = buildModelAliasMaps(allProviders);
    const normalizedInput = normalizeModelName(modelName).canonical || modelName;
    const canonical = aliasMaps.variantToCanonical.get(normalizedInput) || normalizedInput;
    const variants = aliasMaps.canonicalToVariants.get(canonical) ?? new Set([modelName]);
    const variantList = Array.from(variants);

    // 2. 過濾出支持該模型且狀態為 active 或 syncing 的提供商
    const candidates = allProviders.filter(p =>
      (p.status === 'active' || p.status === 'syncing') &&
      variantList.some(v => p.models.includes(v)) &&
      !excludedIds.includes(p.id)
    );

    if (candidates.length === 0) {
      const reason = excludedIds.length > 0
        ? "所有支持該模型的活躍提供商都已嘗試失敗"
        : "未找到支持該模型的活躍提供商";
      logger.warn(`${reason}: ${modelName}`);
      return null;
    }

    const scored: { provider: AIProvider; resolvedModel: string; score: number }[] = [];

    for (const provider of candidates) {
      const availableModels = variantList.filter(v => provider.models.includes(v));
      const resolvedModel = availableModels.length > 0
        ? availableModels[Math.floor(Math.random() * availableModels.length)]
        : modelName;

      const available = await this.isAvailable(provider, resolvedModel);
      if (!available) {
        logger.info(`[Dispatcher] provider=${provider.id} (${provider.name}) 冷卻中，跳過`);
        continue;
      }

      const score = RoutingScoreService.scoreFor(provider.id, resolvedModel);
      scored.push({ provider, resolvedModel, score });
    }

    if (scored.length === 0) {
      logger.warn(`所有支持模型 ${modelName} 的上游均在冷卻中`);
      return null;
    }

    scored.sort((a, b) => b.score - a.score);
    const picked = scored[0];
    logger.info(`[Dispatcher] 選擇上游: provider=${picked.provider.id} (${picked.provider.name}) model=${picked.resolvedModel} (requested=${modelName}) score=${picked.score.toFixed(3)}`);
    return { provider: picked.provider, resolvedModel: picked.resolvedModel };
  }
}
