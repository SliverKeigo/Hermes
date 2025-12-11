import { AIProvider } from "../config/providers";
import { ChatCompletionRequest } from "../models/openai.types";
import { logger } from "../utils/logger";

// 代理服務 (Proxy Service)
// 負責將請求轉發給上游提供商並處理響應
export class ProxyService {
  // 轉發請求 (Forward Request)
  static async forwardRequest(provider: AIProvider, payload: ChatCompletionRequest) {
    const url = `${provider.baseUrl}/chat/completions`;
    
    logger.info(`正在轉發請求到: ${url}`);

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
        const errorText = await response.text();
        logger.error(`來自 ${provider.name} 的上游錯誤: ${response.status} - ${errorText}`);
        throw new Error(`上游錯誤 (Upstream Error): ${response.statusText}`);
      }

      // 如果請求是流式 (Streaming)，直接返回響應體，讓 Elysia 處理 SSE
      if (payload.stream) {
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
      return data;

    } catch (error: any) {
      logger.error("代理轉發失敗 (Proxy forwarding failed)", error);
      throw error;
    }
  }
}