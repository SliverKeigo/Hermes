import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit"; // [NEW] 引入限流插件
import { config } from "./config";
import { ChatController } from "./controllers/chat.controller";
import { AdminController } from "./controllers/admin.controller";
import { LogService } from "./services/log.service"; // [NEW]
import { ProviderManagerService } from "./services/provider.manager"; // [NEW] 引入 ProviderManagerService
import { logger } from "./utils/logger";

// 初始化 SQLite 數據庫
// (這部分是在 src/db.ts 中執行的，這裡無需重複)

// 初始化表結構 (由 src/db.ts 處理，這裡無需重複)
// async function initializeSchema() { ... }

// 初始化 Elysia 應用實例
const app = new Elysia()
  // 加載 CORS 中間件 (允許跨域請求)
  .use(cors())
  // [NEW] 全局限流中間件 (Rate Limiter)
  // 默認基於客戶端 IP 進行限制
  .use(rateLimit({
    duration: 60000, // 窗口時間：1 分鐘
    max: 60,         // 最大請求數：60 次 (即 1 QPS)
    errorResponse: new Response('Rate limit exceeded (請求過於頻繁，請稍後再試)', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    }),
    countFailedRequest: true // 失敗的請求也計入限制
  }))
  // 注入請求開始時間
  .state('startTime', 0)
  .onRequest(({ store }) => {
    store.startTime = performance.now();
  })
  // 全局請求日誌中間件 (Global Request Logger)
  .onAfterResponse(({ request, set, store, body }) => {
    // 忽略頻繁的輪詢請求
    if (request.url.includes("/admin/providers") && request.method === "GET") return;

    const duration = Math.floor(performance.now() - (store.startTime || performance.now()));
    const ip = app.server?.requestIP(request)?.address;

    // 嘗試解析 model 名稱 (如果有的話)
    let model: string | undefined;
    try {
        if (typeof body === 'object' && body && 'model' in body) {
            model = (body as any).model;
        }
    } catch (e) { /* ignore */ }

    logger.info(`[${set.status}] ${request.method} ${request.url} - ${duration}ms`);

    // 持久化日誌
    LogService.logRequest({
        method: request.method,
        path: new URL(request.url).pathname,
        model,
        status: typeof set.status === 'number' ? set.status : 200,
        duration,
        ip
    });
  })
  // 註冊控制器
  .use(ChatController)
  .use(AdminController) // [NEW] 註冊管理後台 API

  // 根路徑健康檢查
  .get("/", () => "Hermes AI Gateway is running 🚀 (赫爾墨斯 AI 網關正在運行)")

  // [NEW] 提供前端儀表板頁面
  .get("/dashboard", () => Bun.file("public/index.html"))
  .get("/logs", () => Bun.file("public/logs.html"))
  .get("/settings", () => Bun.file("public/settings.html"))
  .get("/chat", () => Bun.file("public/chat.html"))
  .get("/logo.png", () => Bun.file("public/Hermes.png"))

  // [NEW] i18n 資源
  .get("/js/i18n.js", () => Bun.file("public/js/i18n.js"))
  .get("/locales/zh-CN.json", () => Bun.file("public/locales/zh-CN.json"))
  .get("/locales/zh-TW.json", () => Bun.file("public/locales/zh-TW.json"))
  .get("/locales/en-US.json", () => Bun.file("public/locales/en-US.json"))

  // 全局錯誤處理 (Global Error Handler)
  .onError(({ code, error }) => {
    logger.error(`全局錯誤捕獲: ${code}`, error);
    return {
      error: {
        message: "Internal Server Error (服務器內部錯誤)",
        code: code
      }
    };
  })
  // 啟動服務器監聽端口
  .listen(config.port);

// 確保在數據庫初始化後啟動 Elysia App 和定時任務
// db.ts 已經在模塊加載時自動執行初始化，所以這裡直接調用
logger.info(
  `🦊 Hermes is running at ${app.server?.hostname}:${app.server?.port}`
);
logger.info(
  `📊 Dashboard available at http://localhost:${config.port}/dashboard`
);

logger.info("Hermes AI Gateway initialized. (赫爾墨斯網關已初始化)");

// [NEW] 啟動 Provider 週期性同步任務
ProviderManagerService.startPeriodicSync(config.periodicSyncInterval); // 使用配置的時間間隔
