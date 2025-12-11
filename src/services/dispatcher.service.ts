import { AIProvider } from "../config/providers";
import { ProviderManagerService } from "./provider.manager"; // [NEW] 引入管理器
import { logger } from "../utils/logger";

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
    logger.warn(`[Dispatcher] 暫停上游: provider=${providerId} model=${modelName} 直到 ${new Date(until).toISOString()} (backoff=${backoffMs}ms)`);
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

  // 根據模型名稱獲取提供商 (帶冷卻與自愈)
  static async getProviderForModel(modelName: string): Promise<AIProvider | null> {
    const allProviders = ProviderManagerService.getAll();
    const candidates = allProviders.filter(p =>
      p.status === 'active' &&
      p.models.includes(modelName)
    );

    if (candidates.length === 0) {
      logger.warn(`未找到支持該模型的活躍提供商: ${modelName}`);
      return null;
    }

    const shuffled = this.shuffle(candidates);
    for (const provider of shuffled) {
      if (await this.isAvailable(provider, modelName)) {
        logger.info(`將模型 ${modelName} 分發給提供商: ${provider.name} (${provider.id})`);
        return provider;
      }
    }

    logger.warn(`所有支持模型 ${modelName} 的上游均在冷卻中`);
    return null;
  }
}
