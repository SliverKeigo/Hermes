import { Elysia, t } from "elysia";
import { AuthService } from "../services/auth.service";
import { DispatcherService } from "../services/dispatcher.service";
import { ProxyService } from "../services/proxy.service";
import { ProviderManagerService } from "../services/provider.manager"; // [新增] 引入提供商管理服務
import { ChatCompletionRequest } from "../models/openai.types";
import { logger } from "../utils/logger";

// 聊天控制器 (Chat Controller)
// 處理與 OpenAI 兼容的接口：/v1/chat/completions 和 /v1/models
export const ChatController = new Elysia({ prefix: "/v1" })

  // 1. 獲取模型列表接口 (Get Models)
  // 聚合所有活躍提供商支持的模型，返回給客戶端
  .get("/models", ({ request, set }) => {
    const authHeader = request.headers.get("authorization");

    // 驗證 Hermes Key
    if (!AuthService.validateKey(authHeader || undefined)) {
      set.status = 401;
      return {
        error: {
          message: "提供的 Hermes Key 無效 (Invalid Hermes Key provided).",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      };
    }

    // 從所有提供商中聚合模型 (去重)
    const providers = ProviderManagerService.getAll();
    const uniqueModels = new Set<string>();

    providers.forEach(p => {
      p.models.forEach(model => uniqueModels.add(model));
    });

    // 返回 OpenAI 標準格式的模型列表
    return {
      object: "list",
      data: Array.from(uniqueModels).map(id => ({
        id: id,
        object: "model",
        created: Math.floor(Date.now() / 1000), // 使用當前時間戳
        owned_by: "hermes-gateway"
      }))
    };
  })

  // 2. 聊天對話接口 (Chat Completions)
  .post("/chat/completions", async ({ request, body, set }) => {
    const authHeader = request.headers.get("authorization");

    // 認證 (Authentication)
    if (!AuthService.validateKey(authHeader || undefined)) {
      set.status = 401;
      return {
        error: {
          message: "提供的 Hermes Key 無效 (Invalid Hermes Key provided).",
          type: "invalid_request_error",
          code: "invalid_api_key"
        }
      };
    }

    const payload = body as ChatCompletionRequest;

    // 分發 (Dispatcher)
    // 根據請求的模型查找合適的提供商
    const provider = DispatcherService.getProviderForModel(payload.model);

    if (!provider) {
      set.status = 404;
      return {
        error: {
          message: `沒有上游服務站支持模型 '${payload.model}' (Model not supported).`,
          type: "invalid_request_error",
          code: "model_not_found"
        }
      };
    }

    // 代理 (Proxy)
    // 將請求轉發給選定的提供商
    try {
      return await ProxyService.forwardRequest(provider, payload);
    } catch (error) {
      logger.error("[ChatController] 上游轉發失敗", error);
      set.status = 502; // Bad Gateway
      return {
        error: {
          message: "無法與上游提供商通信 (Failed to communicate with upstream provider).",
          type: "api_error",
          code: "upstream_error"
        }
      };
    }
  }, {
    // 請求體驗證 (Request Body Validation)
    body: t.Object({
      model: t.String(),
      messages: t.Array(t.Object({
        role: t.String(),
        content: t.String()
      })),
      stream: t.Optional(t.Boolean()),
      temperature: t.Optional(t.Number()),
      max_tokens: t.Optional(t.Number())
    })
  });
