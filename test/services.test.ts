import { describe, it, expect, mock } from "bun:test";
import { db } from "../src/db"; // Import the real db (which uses in-memory for test env)

// Initialize schema for the in-memory test DB
db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT NOT NULL,
    apiKey TEXT NOT NULL,
    models TEXT DEFAULT '[]',
    status TEXT DEFAULT 'pending',
    lastSyncedAt INTEGER,
    lastUsedAt INTEGER,
    createdAt INTEGER
  );
`);

import { AuthService } from "../src/services/auth.service";
import { ProviderManagerService } from "../src/services/provider.manager";
import { DispatcherService } from "../src/services/dispatcher.service";
import { config } from "../src/config";

config.hermesSecret = "test-secret";

describe("服務層測試 (Services Tests)", () => {

  describe("AuthService (認證服務)", () => {
    it("應驗證正確的 Bearer Token", () => {
      expect(AuthService.validateKey("Bearer test-secret")).toBe(true);
    });
  });

  describe("DispatcherService (分發服務)", () => {
    it("應能找到支持特定模型的提供商", async () => {
      // Mock fetch to avoid real network requests
      const originalFetch = global.fetch;
      global.fetch = mock(() => new Response(JSON.stringify({ data: [] }))) as any;
      
      const provider = ProviderManagerService.addProvider("Mock", "http://mock", "sk-mock");
      
      // Manually update DB status to Active and include models (simulate sync completion)
      db.exec(`UPDATE providers SET status = 'active', models = '${JSON.stringify(["gpt-4"])}' WHERE id = '${provider.id}'`);

      // Test dispatch
      const selected = await DispatcherService.getProviderForModel("gpt-4");
      expect(selected).not.toBeNull();
      expect(selected?.provider.id).toBe(provider.id);
      expect(selected?.resolvedModel).toBe("gpt-4");

      global.fetch = originalFetch;
    });

    it("找不到模型時應返回 null", async () => {
      const selected = await DispatcherService.getProviderForModel("non-existent-model");
      expect(selected).toBeNull();
    });

    it("應將模型別名/變體聚合並仍可分發", async () => {
      // Mock fetch to avoid real network requests
      const originalFetch = global.fetch;
      global.fetch = mock(() => new Response(JSON.stringify({ data: [] }))) as any;
      // 禁用背景同步以避免覆蓋測試模型列表
      (ProviderManagerService as any).backgroundSyncTask = async () => {};
      
      const provider = ProviderManagerService.addProvider("AliasMock", "http://alias-mock", "sk-mock");
      db.exec(`UPDATE providers SET status = 'active', models = '${JSON.stringify([
        "models/gemini-flash-latest",
        "gemini-2.5-flash",
        "meta/llama-4-scout",
        "meta/llama-4-scout-17b-16e-instruct",
        "openai/gpt-4o",
        "openai/gpt-5",
        "qwen/qwen3-235b-a22b",
        "qwen/qwen3-235b-a22b-instruct-2507",
        "qwen/qwen3-235b-a22b-thinking-2507"
      ])}' WHERE id = '${provider.id}'`);

      const selected = await DispatcherService.getProviderForModel("gemini-flash");
      expect(selected).not.toBeNull();
      if (!selected) throw new Error("expected selection");
      expect(selected.provider.id).toBe(provider.id);
      expect(["models/gemini-flash-latest", "gemini-2.5-flash"]).toContain(selected.resolvedModel);

      // meta/llama-4-scout family
      const llama = await DispatcherService.getProviderForModel("meta/llama-4-scout");
      expect(llama).not.toBeNull();
      if (!llama) throw new Error("expected selection");
      expect(llama.provider.id).toBe(provider.id);
      expect(["meta/llama-4-scout", "meta/llama-4-scout-17b-16e-instruct"]).toContain(llama.resolvedModel);

      // openai/gpt-5 family
      const gpt5 = await DispatcherService.getProviderForModel("openai/gpt-5");
      expect(gpt5).not.toBeNull();
      if (!gpt5) throw new Error("expected selection");
      expect(gpt5.provider.id).toBe(provider.id);
      expect(["openai/gpt-4o", "openai/gpt-5"]).toContain(gpt5.resolvedModel);

      // qwen 變體帶日期/後綴
      const qwen = await DispatcherService.getProviderForModel("qwen/qwen3-235b-a22b");
      expect(qwen).not.toBeNull();
      if (!qwen) throw new Error("expected selection");
      expect(qwen.provider.id).toBe(provider.id);
      expect([
        "qwen/qwen3-235b-a22b",
        "qwen/qwen3-235b-a22b-instruct-2507",
        "qwen/qwen3-235b-a22b-thinking-2507"
      ]).toContain(qwen.resolvedModel);

      global.fetch = originalFetch;
    });
  });

});
