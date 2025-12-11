import { Database } from "bun:sqlite";
import { logger } from "./utils/logger";

// 初始化 SQLite 數據庫
// 數據將持久化存儲在項目根目錄的 hermes.db 文件中
// 如果是測試環境，使用內存數據庫以避免汙染
const dbFile = process.env.NODE_ENV === 'test' ? ':memory:' : 'hermes.db';
const db = new Database(dbFile, { create: true });

// 啟用 WAL 模式以提高並發性能
db.exec("PRAGMA journal_mode = WAL;");

// 確保 providers 表包含最新欄位（兼容已有數據庫）
const ensureProviderColumns = () => {
  const columns = db.query(`PRAGMA table_info(providers)`).all() as { name: string }[];
  const columnNames = columns.map(c => c.name);

  // 新增 lastUsedAt 欄位以紀錄最近同步/使用時間
  if (!columnNames.includes("lastUsedAt")) {
    db.exec(`ALTER TABLE providers ADD COLUMN lastUsedAt INTEGER;`);
  }
};

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
    lastUsedAt INTEGER,
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

  CREATE TABLE IF NOT EXISTS hermes_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL, -- 存储 key 的哈希值，而不是明文
    description TEXT,
    createdAt INTEGER,
    lastUsedAt INTEGER
  );
`);

ensureProviderColumns();

logger.info("SQLite 數據庫已連接並初始化 (hermes.db)");

export { db };
