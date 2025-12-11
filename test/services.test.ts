import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import { AuthService } from "../src/services/auth.service";
import { ProviderManagerService } from "../src/services/provider.manager";
import { DispatcherService } from "../src/services/dispatcher.service";
import { config } from "../src/config";

// 設置測試環境
config.hermesSecret = "test-secret";

describe("服務層測試 (Services Tests)", () => {

  describe("AuthService (認證服務)", () => {
    it("應驗證正確的 Bearer Token", () => {
      expect(AuthService.validateKey("Bearer test-secret")).toBe(true);
    });

    it("應驗證正確的 Raw Token (無 Bearer 前綴)", () => {
      expect(AuthService.validateKey("test-secret")).toBe(true);
    });

    it("應拒絕錯誤的 Token", () => {
      expect(AuthService.validateKey("Bearer wrong-key")).toBe(false);
    });

    it("應拒絕空的 Token", () => {
      expect(AuthService.validateKey(undefined)).toBe(false);
    });
  });

  describe("ProviderManagerService (提供商管理)", () => {
    // Mock 全局 fetch
    const originalFetch = global.fetch;
    
    beforeAll(() => {
      global.fetch = mock(async (url: string) => {
        if (url.includes("/models")) {
          return new Response(JSON.stringify({
            data: [
              { id: "gpt-4" },
              { id: "gpt-3.5-turbo" },
              { id: "dall-e-3" } // 應該被過濾掉
            ]
          }));
        }
        return new Response("OK");
      });
    });

    it("應能添加提供商並觸發異步同步", async () => {
      const provider = await ProviderManagerService.addProvider(
        "Test Provider",
        "https://api.test.com/v1",
        "sk-test"
      );

      expect(provider.name).toBe("Test Provider");
      expect(provider.status).toBe("syncing"); // Async function starts immediately until first await
      expect(ProviderManagerService.getAll()).toContain(provider);
      
      // 注意：由於同步是異步的，我們無法立即斷言 status 變為 active
      // 但我們可以驗證它被添加到了存儲中
    });

    // 恢復 fetch
    afterAll(() => {
        global.fetch = originalFetch;
    });
  });

  describe("DispatcherService (分發服務)", () => {
    it("應能找到支持特定模型的提供商", async () => {
      // 1. 先手動注入一個 Active 的提供商到存儲中 (模擬異步同步完成)
      const mockProvider = await ProviderManagerService.addProvider("Mock", "http://mock", "sk-mock");
      mockProvider.models = ["gpt-4"];
      mockProvider.status = "active";

      // 2. 測試分發
      const selected = DispatcherService.getProviderForModel("gpt-4");
      expect(selected).not.toBeNull();
      expect(selected?.id).toBe(mockProvider.id);
    });

    it("找不到模型時應返回 null", () => {
      const selected = DispatcherService.getProviderForModel("non-existent-model");
      expect(selected).toBeNull();
    });
  });

});
