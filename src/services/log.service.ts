import { db } from "../db";
import { RequestLog, SyncLog } from "../types";

export class LogService {
  // 記錄 API 請求日誌
  static logRequest(data: {
    method: string;
    path: string;
    model?: string;
    status: number;
    duration: number;
    ip?: string;
  }) {
    // 使用 ? 占位符以兼容 D1 -- No longer needed as we are back to bun:sqlite with $
    db.exec(`
      INSERT INTO request_logs (id, method, path, model, status, duration, ip, createdAt)
      VALUES ('${crypto.randomUUID()}', '${data.method}', '${data.path}', ${data.model ? "'" + data.model + "'" : "NULL"}, ${data.status}, ${data.duration}, ${data.ip ? "'" + data.ip + "'" : "NULL"}, ${Date.now()})
    `);
  }

  // 記錄同步日誌 (Sync Logs)
  static logSync(data: {
    providerId: string;
    providerName: string;
    model: string;
    result: 'success' | 'failure';
    message?: string;
  }) {
    db.exec(`
      INSERT INTO sync_logs (id, providerId, providerName, model, result, message, createdAt)
      VALUES ('${crypto.randomUUID()}', '${data.providerId}', '${data.providerName}', '${data.model}', '${data.result}', '${data.message || ''}', ${Date.now()})
    `);
  }

  // 獲取最近的請求日誌 (用於 Admin Dashboard)
  static getRecentRequests(limit = 50): RequestLog[] {
    return db.query(`SELECT * FROM request_logs ORDER BY createdAt DESC LIMIT ${limit}`).all() as RequestLog[];
  }

  // 獲取最近的同步日誌
  static getRecentSyncLogs(limit = 50): SyncLog[] {
    return db.query(`SELECT * FROM sync_logs ORDER BY createdAt DESC LIMIT ${limit}`).all() as SyncLog[];
  }
}
