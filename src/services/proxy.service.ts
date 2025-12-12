import { AIProvider } from "../config/providers";
import { ChatCompletionRequest } from "../models/openai.types";
import { logger } from "../utils/logger";
import { DispatcherService } from "./dispatcher.service";
import { LogService } from "./log.service";
import { ProviderManagerService } from "./provider.manager";
import { RoutingScoreService } from "./routing.score.service";

// 代理服務 (Proxy Service)
// 負責將請求轉發給上游提供商並處理響應
export class ProxyService {
  // 轉發請求 (Forward Request)
  static async forwardRequest(provider: AIProvider, payload: ChatCompletionRequest) {
    const url = `${provider.baseUrl}/chat/completions`;
    const startTime = Date.now();

    logger.info(`正在轉發請求到: ${url}`);
    // 記錄模型/供應商使用
    LogService.trackUsage(provider.id, provider.name, payload.model);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 使用上游提供商的 API Key 替換用戶的 Hermes Key
          "Authorization": `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const duration = Date.now() - startTime;
        RoutingScoreService.update(provider.id, payload.model, false, duration);
        const errorText = await response.text();
        const contentType = response.headers.get("content-type") || "text/plain";
        logger.error(`來自 ${provider.name} 的上游錯誤: ${response.status} - ${errorText}`);

        // 針對 model_not_found，臨時移除並觸發重同步，避免持續命中失效模型
        const parsedError = (() => {
          try { return JSON.parse(errorText); } catch { return null; }
        })();
        const errorCode = parsedError?.error?.code || parsedError?.code;
        const errorType = parsedError?.error?.type || parsedError?.type;
        const errorMessage = parsedError?.error?.message || parsedError?.message || "";
        const isModelMissing =
          errorCode === "model_not_found" ||
          errorType === "model_not_found" ||
          (typeof parsedError?.error?.message === "string" && parsedError.error.message.includes("model_not_found"));
        const isQuotaExhausted =
          errorCode === "out_of_credits" ||
          errorType === "out_of_credits" ||
          (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("out of words")) ||
          (typeof errorMessage === "string" && errorMessage.toLowerCase().includes("out of credits")) ||
          response.status === 402 ||
          response.status === 422 && typeof errorMessage === "string" && errorMessage.toLowerCase().includes("out of");

        if (isModelMissing || response.status === 404) {
          ProviderManagerService.handleModelNotFound(provider.id, payload.model);
        }

        // 將該 provider+model 置入冷卻期，避免短時間內繼續命中
        DispatcherService.penalize(provider.id, payload.model, undefined, isQuotaExhausted);
        LogService.trackUpstreamError(provider.id, provider.name, payload.model);
        return new Response(errorText, {
          status: response.status,
          headers: { "content-type": contentType }
        });
      }

      // 如果請求是流式 (Streaming)，直接返回響應體，讓 Elysia 處理 SSE
      if (payload.stream) {
        const duration = Date.now() - startTime;
        RoutingScoreService.update(provider.id, payload.model, true, duration);
        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          }
        });
      }

      // 否則返回 JSON 數據
      const data = await response.json();
      const duration = Date.now() - startTime;
      RoutingScoreService.update(provider.id, payload.model, true, duration);
      return data;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      RoutingScoreService.update(provider.id, payload.model, false, duration);
      logger.error("代理轉發失敗 (Proxy forwarding failed)", error);
      // 網絡級/其他異常也進行冷卻
      DispatcherService.penalize(provider.id, payload.model);
      LogService.trackUpstreamError(provider.id, provider.name, payload.model);
      throw error;
    }
  }
}
