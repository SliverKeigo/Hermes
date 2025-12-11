import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { ChatController } from "./controllers/chat.controller";
import { AdminController } from "./controllers/admin.controller"; // [NEW]
import { logger } from "./utils/logger";

// 初始化 Elysia 應用實例
const app = new Elysia()
  // 加載 CORS 中間件 (允許跨域請求)
  .use(cors())
  // 全局請求日誌中間件 (Global Request Logger)
  .onRequest(({ request }) => {
    // 忽略頻繁的輪詢請求
    if (request.url.includes("/admin/providers") && request.method === "GET") return;
    logger.info(`收到請求: ${request.method} ${request.url}`);
  })
  // 註冊控制器
  .use(ChatController)
  .use(AdminController) // [NEW] 註冊管理後台 API

  // 根路徑健康檢查
  .get("/", () => "Hermes AI Gateway is running 🚀 (赫爾墨斯 AI 網關正在運行)")

  // [NEW] 提供前端儀表板頁面
  .get("/dashboard", () => Bun.file("public/index.html"))
  .get("/chat", () => Bun.file("public/chat.html"))

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

console.log(
  `🦊 Hermes is running at ${app.server?.hostname}:${app.server?.port}`
);
console.log(
  `📊 Dashboard available at http://localhost:${config.port}/dashboard`
);

logger.info("Hermes AI Gateway initialized. (赫爾墨斯網關已初始化)");
