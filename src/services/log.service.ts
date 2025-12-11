import { db } from "../db";

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
    const query = db.query(`
      INSERT INTO request_logs (id, method, path, model, status, duration, ip, createdAt)
      VALUES ($id, $method, $path, $model, $status, $duration, $ip, $createdAt)
    `);

    query.run({
      $id: crypto.randomUUID(),
      $method: data.method,
      $path: data.path,
      $model: data.model || null,
      $status: data.status,
      $duration: data.duration,
      $ip: data.ip || null,
      $createdAt: Date.now()
    });
  }

  // 記錄同步日誌 (Sync Logs)
  static logSync(data: {
    providerId: string;
    providerName: string;
    model: string;
    result: 'success' | 'failure';
    message?: string;
  }) {
    const query = db.query(`
      INSERT INTO sync_logs (id, providerId, providerName, model, result, message, createdAt)
      VALUES ($id, $providerId, $providerName, $model, $result, $message, $createdAt)
    `);

    query.run({
      $id: crypto.randomUUID(),
      $providerId: data.providerId,
      $providerName: data.providerName,
      $model: data.model,
      $result: data.result,
      $message: data.message || '',
      $createdAt: Date.now()
    });
  }

  // 獲取最近的請求日誌 (用於 Admin Dashboard)
  static getRecentRequests(limit = 50) {
    return db.query("SELECT * FROM request_logs ORDER BY createdAt DESC LIMIT $limit").all({ $limit: limit });
  }

  // 獲取最近的同步日誌
  static getRecentSyncLogs(limit = 50) {
    return db.query("SELECT * FROM sync_logs ORDER BY createdAt DESC LIMIT $limit").all({ $limit: limit });
  }
}
