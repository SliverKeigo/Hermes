import { Elysia, t } from "elysia";
import { ProviderManagerService } from "../services/provider.manager";
import { LogService } from "../services/log.service";
import { AuthService } from "../services/auth.service"; // [NEW] 導入 AuthService
import { DispatcherService } from "../services/dispatcher.service";
import { ConfigService } from "../services/config.service";
import { logger } from "../utils/logger";
import { RequestLogFilters, SyncLogFilters } from "../types";
import { config } from "../config";

// 管理員控制器 (Admin Controller)
// 提供前端頁面所需的 API 接口
export const AdminController = new Elysia({ prefix: "/admin" })
  // 獲取所有提供商列表
  .get("/providers", () => {
    return {
      data: ProviderManagerService.getAll()
    };
  })
  // 導出提供商配置
  .get("/providers/export", () => {
    const exportedAt = Date.now();
    const providers = ProviderManagerService.getAll().map(p => ({
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
      modelBlacklist: p.modelBlacklist ?? []
    }));

    return {
      exportedAt,
      providers
    };
  })
  // [NEW] 獲取 API 請求日誌
  .get("/request-logs", ({ query }) => {
    // TypeBox 驗證後，query.limit 和 query.page 應為 number | undefined
    const limit = (query.limit as number) ?? 10;
    const page = (query.page as number) ?? 1;
    const offset = (page - 1) * limit;

    const filters: RequestLogFilters = {};
    if (query.method) filters.method = query.method;
    if (query.path) filters.path = query.path;
    if (query.model) filters.model = query.model;
    if (query.status) filters.status = query.status; // TypeBox ensures it's number

    return {
      data: LogService.getRecentRequests(limit, offset, filters)
    };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      limit: t.Optional(t.Numeric()),
      method: t.Optional(t.String()),
      path: t.Optional(t.String()),
      model: t.Optional(t.String()),
      status: t.Optional(t.Numeric()),
    })
  })
  // [NEW] 獲取同步日誌
  .get("/sync-logs", ({ query }) => {
    // TypeBox 驗證後，query.limit 和 query.page 應為 number | undefined
    const limit = (query.limit as number) ?? 10;
    const page = (query.page as number) ?? 1;
    const offset = (page - 1) * limit;

    const filters: SyncLogFilters = {};
    if (query.providerName) filters.providerName = query.providerName;
    if (query.model) filters.model = query.model;
    // TypeBox 已驗證 result 為 'success' | 'failure' | undefined
    if (query.result && (query.result === 'success' || query.result === 'failure')) filters.result = query.result;

    return {
      data: LogService.getRecentSyncLogs(limit, offset, filters)
    };
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric()),
      limit: t.Optional(t.Numeric()),
      providerName: t.Optional(t.String()),
      model: t.Optional(t.String()),
      result: t.Optional(t.Union([t.Literal('success'), t.Literal('failure')])),
    })
  })
  // Metrics snapshot
  .get("/metrics", () => {
    return {
      data: LogService.getMetrics()
    };
  })
  // [NEW] 獲取生成的密鑰列表
  .get("/keys", ({ query }) => {
    const filters: { description?: string, id?: string } = {};
    if (query.description) filters.description = query.description;
    if (query.id) filters.id = query.id;

    return {
      data: AuthService.getGeneratedKeys(filters)
    };
  }, {
    query: t.Object({
      description: t.Optional(t.String()),
      id: t.Optional(t.String()),
    })
  })
  // [NEW] 獲取週期性同步間隔 (小時)
  .get("/settings/periodic-sync-interval-hours", () => {
    return {
      intervalHours: ProviderManagerService.getPeriodicSyncIntervalHours()
    };
  })
  // [NEW] 設置週期性同步間隔 (小時)
  .post("/settings/periodic-sync-interval-hours", ({ body }) => {
    const { intervalHours } = body as { intervalHours: number };
    if (intervalHours <= 0) {
      throw new Error("間隔時間必須大於 0 小時");
    }
    ProviderManagerService.setPeriodicSyncIntervalHours(intervalHours);
    return { success: true, newIntervalHours: intervalHours };
  }, {
    body: t.Object({
      intervalHours: t.Numeric()
    })
  })
  // [NEW] 獲取聊天重試次數
  .get("/settings/chat-max-retries", () => {
    return {
      maxRetries: config.chatMaxRetries ?? 3
    };
  })
  // [NEW] 設置聊天重試次數
  .post("/settings/chat-max-retries", ({ body }) => {
    const { maxRetries } = body as { maxRetries: number };
    if (!Number.isFinite(maxRetries) || maxRetries <= 0) {
      throw new Error("重試次數必須大於 0");
    }
    config.chatMaxRetries = Math.max(1, Math.floor(maxRetries));
    return { success: true, maxRetries: config.chatMaxRetries };
  }, {
    body: t.Object({
      maxRetries: t.Numeric()
    })
  })
  // [NEW] 生成新的密鑰
  .post("/keys/generate", ({ body }) => {
    const { description, key } = body as { description?: string; key?: string };

    let finalKey: string;

    if (key) {
      // 如果提供了密鑰，則直接使用並存儲它
      finalKey = key;
    } else {
      // 否則生成一個新的密鑰字符串
      finalKey = AuthService.generateKey();
    }

    // 將密鑰存儲到數據庫 (確保只調用一次)
    const generatedId = AuthService.storeKey(finalKey, description || 'Generated by Admin');

    return {
      success: true,
      id: generatedId, // 返回密鑰的 ID
      key: finalKey,
      description: description || 'Generated by Admin'
    };
  }, {
    body: t.Object({
      description: t.Optional(t.String()),
      key: t.Optional(t.String()) // 允許手動提供密鑰
    })
  })
  // [NEW] 獲取分發器配置
  .get("/settings/dispatcher", () => {
    return {
      initialPenaltyMs: DispatcherService.INITIAL_PENALTY_MS,
      maxPenaltyMs: DispatcherService.MAX_PENALTY_MS,
      resyncThreshold: DispatcherService.RESYNC_THRESHOLD,
      resyncCooldownMs: DispatcherService.RESYNC_COOLDOWN_MS
    };
  })
  // [NEW] 設置分發器配置
  .post("/settings/dispatcher", ({ body }) => {
    const { initialPenaltyMs, maxPenaltyMs, resyncThreshold, resyncCooldownMs } = body as any;
    if (initialPenaltyMs) ConfigService.set("dispatcher_initial_penalty_ms", String(initialPenaltyMs));
    if (maxPenaltyMs) ConfigService.set("dispatcher_max_penalty_ms", String(maxPenaltyMs));
    if (resyncThreshold) ConfigService.set("dispatcher_resync_threshold", String(resyncThreshold));
    if (resyncCooldownMs) ConfigService.set("dispatcher_resync_cooldown_ms", String(resyncCooldownMs));
    return { success: true };
  }, {
    body: t.Object({
      initialPenaltyMs: t.Optional(t.Numeric()),
      maxPenaltyMs: t.Optional(t.Numeric()),
      resyncThreshold: t.Optional(t.Numeric()),
      resyncCooldownMs: t.Optional(t.Numeric())
    })
  })
  // [NEW] 獲取當前冷卻中的模型
  .get("/dispatcher/cooldowns", () => {
    return {
      data: DispatcherService.getCooldowns()
    };
  })
  // [NEW] 清除模型冷卻
  .post("/dispatcher/cooldowns/clear", ({ body }) => {
    const { providerId, modelName } = body as { providerId: string, modelName: string };
    DispatcherService.clearCooldown(providerId, modelName);
    return { success: true };
  }, {
    body: t.Object({
      providerId: t.String(),
      modelName: t.String()
    })
  })
  // 添加新的提供商
  .post("/providers", async ({ body, set }) => {
    try {
      const { name, baseUrl, apiKey, modelBlacklist } = body;
      const provider = ProviderManagerService.addProvider(name, baseUrl, apiKey, modelBlacklist || []);
      return {
        success: true,
        data: provider
      };
    } catch (error: any) {
      logger.error("添加提供商失敗", error);
      set.status = 500;
      return {
        success: false,
        error: error.message
      };
    }
  }, {
    body: t.Object({
      name: t.String(),
      baseUrl: t.String(),
      apiKey: t.String(),
      modelBlacklist: t.Optional(t.Array(t.String()))
    })
  })
  // 批量導入提供商配置
  .post("/providers/import", ({ body, set }) => {
    try {
      const { providers } = body as { providers: { name: string; baseUrl: string; apiKey: string; modelBlacklist?: string[] }[] };
      const result = ProviderManagerService.importProviders(providers);
      return { success: true, ...result };
    } catch (error: any) {
      logger.error("導入提供商配置失敗", error);
      set.status = 500;
      return { success: false, error: error.message };
    }
  }, {
    body: t.Object({
      providers: t.Array(t.Object({
        name: t.String(),
        baseUrl: t.String(),
        apiKey: t.String(),
        modelBlacklist: t.Optional(t.Array(t.String()))
      }))
    })
  })
  // 更新提供商
  .patch("/providers/:id", ({ params, body, set }) => {
    try {
      const { name, baseUrl, apiKey, modelBlacklist } = body as { name?: string; baseUrl?: string; apiKey?: string; modelBlacklist?: string[] };
      const updated = ProviderManagerService.updateProvider(params.id, { name, baseUrl, apiKey, modelBlacklist });
      return { success: true, data: updated };
    } catch (error: any) {
      logger.error("更新提供商失敗", error);
      set.status = 500;
      return { success: false, error: error.message };
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      baseUrl: t.Optional(t.String()),
      apiKey: t.Optional(t.String()),
      modelBlacklist: t.Optional(t.Array(t.String()))
    })
  })
  // 手動觸發重新同步/探活
  .post("/providers/:id/resync", ({ params, set }) => {
    try {
      ProviderManagerService.triggerResync(params.id);
      return { success: true };
    } catch (error: any) {
      logger.error("手動重新同步失敗", error);
      set.status = 500;
      return { success: false, error: error.message };
    }
  })
  // 刪除提供商
  .delete("/providers/:id", ({ params }) => {
    const success = ProviderManagerService.removeProvider(params.id);
    return { success };
  });
