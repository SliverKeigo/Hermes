import { Elysia, t } from "elysia";
import { ProviderManagerService } from "../services/provider.manager";
import { LogService } from "../services/log.service";
import { logger } from "../utils/logger";
import { RequestLogFilters, SyncLogFilters } from "../types"; // [NEW]

// 管理員控制器 (Admin Controller)
// 提供前端頁面所需的 API 接口
export const AdminController = new Elysia({ prefix: "/admin" })
  // 獲取所有提供商列表
  .get("/providers", () => {
    return {
      data: ProviderManagerService.getAll()
    };
  })
  // [NEW] 獲取 API 請求日誌
  .get("/request-logs", ({ query }) => {
    // TypeBox 驗證後，query.limit 和 query.page 應為 number | undefined
    const limit = (query.limit as number) ?? 10;
    const page = (query.page as number) ?? 1;
    const offset = (page - 1) * limit;

    const filters: RequestLogFilters = {};
    if (query.method) filters.method = query.method as string;
    if (query.path) filters.path = query.path as string;
    if (query.model) filters.model = query.model as string;
    if (query.status) filters.status = query.status as number; // TypeBox ensures it's number

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
    if (query.providerName) filters.providerName = query.providerName as string;
    if (query.model) filters.model = query.model as string;
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
  // 添加新的提供商
  .post("/providers", async ({ body, set }) => {
    try {
      const { name, baseUrl, apiKey } = body;
      const provider = ProviderManagerService.addProvider(name, baseUrl, apiKey);
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
      apiKey: t.String()
    })
  })
  // 刪除提供商
  .delete("/providers/:id", ({ params }) => {
    const success = ProviderManagerService.removeProvider(params.id);
    return { success };
  });