import { Elysia, t } from "elysia";
import { AuthService } from "../services/auth.service";
import { DispatcherService } from "../services/dispatcher.service";
import { ProxyService } from "../services/proxy.service";
import { ProviderManagerService } from "../services/provider.manager";
import { LogService } from "../services/log.service";
import { ChatCompletionRequest } from "../models/openai.types";
import { logger } from "../utils/logger";

// 聊天控制器 (Chat Controller)
// 處理與 OpenAI 兼容的接口：/v1/chat/completions 和 /v1/models
export const ChatController = new Elysia({ prefix: "/v1" })
  
  // 1. 獲取模型列表接口 (Get Models)
  .get("/models", async ({ request, set }) => {
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

    // [Async] 從所有提供商中聚合模型
    const providers = await ProviderManagerService.getAll();
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
        created: Math.floor(Date.now() / 1000),
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
    
    // 智能重試邏輯
    const maxRetries = 3;
    const triedProviderIds = new Set<string>();
    
    let lastErrorResponse: Response | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 1. 獲取 Provider，並排除已嘗試過的
      const provider = await DispatcherService.getProviderForModel(payload.model, Array.from(triedProviderIds));
      
      if (!provider) {
        // 如果第一次嘗試就沒找到，或者所有可用節點都試過了
        if (attempt === 1) {
            set.status = 404;
            return {
                error: {
                    message: `沒有上游服務站支持模型 '${payload.model}' (Model not supported).`,
                    type: "invalid_request_error",
                    code: "model_not_found"
                }
            };
        }
        // 如果是重試過程中耗盡了所有節點
        logger.warn(`模型 ${payload.model} 重試耗盡，無更多可用節點`);
        break; 
      }

      // 記錄此節點已嘗試
      triedProviderIds.add(provider.id);

      try {
        // 2. 轉發請求
        const response = await ProxyService.forwardRequest(provider, payload);
        
        // 3. 檢查響應
        if (response instanceof Response) {
            if (response.ok) {
                // 成功：直接返回
                return response;
            }
            
            // 失敗：檢查狀態碼
            // 400-499 通常是客戶端錯誤 (如參數錯誤)，不應該重試，除非是 429 (Rate Limit)
            // 500-599 是服務端錯誤，應該重試
            if (response.status !== 429 && response.status >= 400 && response.status < 500) {
                return response; // 直接返回客戶端錯誤，不重試
            }

            // 記錄錯誤響應，準備重試
            logger.warn(`Provider ${provider.name} 返回錯誤 ${response.status}，準備重試...`);
            lastErrorResponse = response;
            continue;
        }

        // 如果是 JSON 對象 (非 Response)，視為成功
        return response;

      } catch (error) {
        // 4. 網絡層面錯誤 (DNS, Timeout 等)，記錄並重試
        logger.error(`Provider ${provider.name} 連接失敗: ${error}`, error);
        lastError = error;
        continue;
      }
    }

    // 重試耗盡後的處理
    if (lastErrorResponse) {
        return lastErrorResponse;
    }

    set.status = 502; // Bad Gateway
    return {
      error: {
        message: "所有上游提供商均無法響應 (All upstream providers failed).",
        type: "api_error",
        code: "upstream_error",
        last_error: lastError ? String(lastError) : undefined
      }
    };

  }, {
    // 請求體驗證 (Request Body Validation)
    body: t.Object({
      model: t.String(),
      messages: t.Array(t.Object({
        role: t.String(),
        content: t.Union([
          t.String(),
          t.Array(t.Object({
            type: t.String(),
            text: t.Optional(t.String()),
            image_url: t.Optional(t.Object({
              url: t.String(),
              detail: t.Optional(t.String())
            }))
          }))
        ])
      })),
      stream: t.Optional(t.Boolean()),
      temperature: t.Optional(t.Number()),
      max_tokens: t.Optional(t.Number())
    })
  });