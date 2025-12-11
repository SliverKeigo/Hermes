import { Database } from "bun:sqlite";
import { logger } from "./utils/logger";

// 初始化 SQLite 數據庫
// 數據將持久化存儲在項目根目錄的 hermes.db 文件中
const db = new Database("hermes.db", { create: true });

// 啟用 WAL 模式以提高並發性能
db.exec("PRAGMA journal_mode = WAL;");

// 初始化表結構
db.exec(`
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
    model TEXT, -- 請求的模型 (如果有)
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

logger.info("SQLite 數據庫已連接並初始化 (hermes.db)");

export { db };
