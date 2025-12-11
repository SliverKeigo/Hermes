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
      expect(selected?.id).toBe(provider.id);

      global.fetch = originalFetch;
    });

    it("找不到模型時應返回 null", async () => {
      const selected = await DispatcherService.getProviderForModel("non-existent-model");
      expect(selected).toBeNull();
    });
  });

});
