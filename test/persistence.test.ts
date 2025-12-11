import { describe, it, expect, mock } from "bun:test";
import { db } from "../src/db"; // Import the real db (which uses in-memory for test env)

// Initialize schema for the in-memory test DB
db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT NOT NULL,
    apiKey TEXT NOT NULL,
    models TEXT DEFAULT '[]', -- Stored as JSON string
    status TEXT DEFAULT 'pending',
    lastSyncedAt INTEGER,
    lastUsedAt INTEGER,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    method TEXT,
    path TEXT,
    model TEXT,
    status INTEGER,
    duration INTEGER, -- ms
    ip TEXT,
    createdAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS sync_logs (
    id TEXT PRIMARY KEY,
    providerId TEXT,
    providerName TEXT,
    model TEXT,
    result TEXT, -- 'success' | 'failure'
    message TEXT, -- Error message or note
    createdAt INTEGER
  );
`);

// Import the services to be tested
import { ProviderManagerService } from "../src/services/provider.manager";
import { LogService } from "../src/services/log.service";

describe("持久化與日誌測試 (Persistence & Logging)", () => {

  describe("ProviderManager (SQLite)", () => {
    it("應能將 Provider 保存到數據庫", () => { // No longer async
      // Mock fetch to avoid real network requests
      const originalFetch = global.fetch;
      global.fetch = mock(() => new Response(JSON.stringify({ data: [] }))) as any;

      const provider = ProviderManagerService.addProvider("DB Test", "http://test", "sk-db");
      
      const inMemory = ProviderManagerService.getAll();
      const saved = inMemory.find(p => p.id === provider.id);
      
      expect(saved).toBeDefined();
      expect(saved?.name).toBe("DB Test");
      expect(saved?.apiKey).toBe("sk-db");

      global.fetch = originalFetch;
    });

    it("應能刪除 Provider", () => { // No longer async
      // Mock fetch
      const originalFetch = global.fetch;
      global.fetch = mock(() => new Response(JSON.stringify({ data: [] }))) as any;

      const provider = ProviderManagerService.addProvider("To Delete", "http://del", "sk-del");
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
