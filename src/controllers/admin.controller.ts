import { Elysia, t } from "elysia";
import { ProviderManagerService } from "../services/provider.manager";
import { LogService } from "../services/log.service"; // [NEW]
import { logger } from "../utils/logger";

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
    const limit = query.limit ? parseInt(query.limit) : 50;
    return {
      data: LogService.getRecentRequests(limit)
    };
  })
  // [NEW] 獲取同步日誌
  .get("/sync-logs", ({ query }) => {
    const limit = query.limit ? parseInt(query.limit) : 50;
    return {
      data: LogService.getRecentSyncLogs(limit)
    };
  })
  // 添加新的提供商
  .post("/providers", async ({ body, set }) => {
    try {
      const { name, baseUrl, apiKey } = body;
      const provider = await ProviderManagerService.addProvider(name, baseUrl, apiKey);
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
