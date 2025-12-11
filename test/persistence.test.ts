import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { Database } from "bun:sqlite";

// 1. Mock 數據庫模塊
// 我們創建一個內存數據庫實例，並讓 src/db.ts 導出它
const testDb = new Database(":memory:"); 

// 必須在導入服務之前 Mock
mock.module("../src/db", () => {
  return {
    db: testDb
  };
});

// 初始化表結構 (複製 src/db.ts 的邏輯，確保測試環境一致)
testDb.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT NOT NULL,
    apiKey TEXT NOT NULL,
    models TEXT DEFAULT '[]', -- 存儲為 JSON 字符串
    status TEXT DEFAULT 'pending',
    lastSyncedAt INTEGER,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    method TEXT,
    path TEXT,
    model TEXT,
    status INTEGER,
    duration INTEGER, -- 耗時 (ms)
    ip TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    providerId TEXT,
    providerName TEXT,
    model TEXT,
    result TEXT, -- 'success' | 'failure'
    message TEXT, -- 錯誤信息或備註
    createdAt INTEGER
  );
`);

// 導入被測試的服務
import { ProviderManagerService } from "../src/services/provider.manager";
import { LogService } from "../src/services/log.service";

describe("持久化與日誌測試 (Persistence & Logging)", () => {

  describe("ProviderManager (SQLite)", () => {
    it("應能將 Provider 保存到數據庫", async () => {
      // 模擬 fetch 避免真實網絡請求
      const originalFetch = global.fetch;
      global.fetch = mock(async () => new Response(JSON.stringify({ data: [] })));

      const provider = await ProviderManagerService.addProvider("DB Test", "http://test", "sk-db");
      
      const inMemory = ProviderManagerService.getAll();
      const saved = inMemory.find(p => p.id === provider.id);
      
      expect(saved).toBeDefined();
      expect(saved?.name).toBe("DB Test");
      // 注意：addProvider 會觸發異步任務，立即查詢可能還是 pending 或已經變成了 syncing/active
      // 這裡主要測試數據庫寫入是否成功
      expect(saved?.apiKey).toBe("sk-db");

      global.fetch = originalFetch;
    });

    it("應能刪除 Provider", async () => {
      // 模擬 fetch
      const originalFetch = global.fetch;
      global.fetch = mock(async () => new Response(JSON.stringify({ data: [] })));

      const provider = await ProviderManagerService.addProvider("To Delete", "http://del", "sk-del");
      const success = ProviderManagerService.removeProvider(provider.id);
      
      expect(success).toBe(true);
      const all = ProviderManagerService.getAll();
      expect(all.find(p => p.id === provider.id)).toBeUndefined();

      global.fetch = originalFetch;
    });
  });

  describe("LogService", () => {
    it("應能寫入並查詢 Request Log", () => {
      LogService.logRequest({
        method: "GET",
        path: "/test-log",
        status: 200,
        duration: 123,
        ip: "127.0.0.1"
      });

      const logs = LogService.getRecentRequests(50);
      const myLog = logs.find(l => l.path === "/test-log");
      
      expect(myLog).toBeDefined();
      expect(myLog?.duration).toBe(123);
      expect(myLog?.status).toBe(200);
    });

    it("應能寫入並查詢 Sync Log", () => {
      LogService.logSync({
        providerId: "test-id-sync",
        providerName: "Test Sync",
        model: "gpt-4-test",
        result: "success",
        message: "OK"
      });

      const logs = LogService.getRecentSyncLogs(50);
      const myLog = logs.find(l => l.model === "gpt-4-test");

      expect(myLog).toBeDefined();
      expect(myLog?.providerName).toBe("Test Sync");
      expect(myLog?.result).toBe("success");
    });
  });

});
