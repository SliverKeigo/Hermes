import { describe, it, expect, mock, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

// 1. Mock DB (必須在導入服務前)
const testDb = new Database(":memory:");
mock.module("../src/db", () => ({ db: testDb }));

// 初始化表
testDb.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT NOT NULL,
    apiKey TEXT NOT NULL,
    models TEXT DEFAULT '[]',
    status TEXT DEFAULT 'pending',
    lastSyncedAt INTEGER,
    createdAt INTEGER
  );
  -- 其他表省略，因為這個測試文件主要關注服務邏輯
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
    // ... 其他 Auth 測試省略，保持不變
  });

  describe("DispatcherService (分發服務)", () => {
    it("應能找到支持特定模型的提供商", async () => {
      // 1. 添加 Provider (初始狀態 pending/syncing)
      // Mock fetch 以避免網絡請求
      const originalFetch = global.fetch;
      global.fetch = mock(async () => new Response(JSON.stringify({ data: [] })));
      
      const provider = await ProviderManagerService.addProvider("Mock", "http://mock", "sk-mock");
      
      // 2. 手動更新 DB 狀態為 Active 且包含模型 (模擬同步完成)
      const update = testDb.query("UPDATE providers SET status = 'active', models = $models WHERE id = $id");
      update.run({
        $models: JSON.stringify(["gpt-4"]),
        $id: provider.id
      });

      // 3. 測試分發
      const selected = DispatcherService.getProviderForModel("gpt-4");
      expect(selected).not.toBeNull();
      expect(selected?.id).toBe(provider.id);

      global.fetch = originalFetch;
    });

    it("找不到模型時應返回 null", () => {
      const selected = DispatcherService.getProviderForModel("non-existent-model");
      expect(selected).toBeNull();
    });
  });

});