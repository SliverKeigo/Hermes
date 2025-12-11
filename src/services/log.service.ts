import { db } from "../db";
import { RequestLog, SyncLog, RequestLogFilters, SyncLogFilters } from "../types";

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

  // 獲取最近的請求日誌 (支持分頁和過濾)
  static getRecentRequests(limit = 10, offset = 0, filters?: RequestLogFilters): RequestLog[] {
    let whereClause = "";
    // Note: Use named parameters ($param) for bun:sqlite
    const namedParams: Record<string, string | number | undefined> = {};

    if (filters) {
      if (filters.method) {
        whereClause += ` AND method = $method`;
        namedParams.$method = filters.method;
      }
      if (filters.path) {
        whereClause += ` AND path LIKE $path`;
        namedParams.$path = `%${filters.path}%`;
      }
      if (filters.model) {
        whereClause += ` AND model LIKE $model`;
        namedParams.$model = `%${filters.model}%`;
      }
      if (filters.status) {
        whereClause += ` AND status = $status`;
        namedParams.$status = filters.status;
      }
    }

    const fullSql = `SELECT * FROM request_logs WHERE 1=1 ${whereClause} ORDER BY createdAt DESC LIMIT ${limit} OFFSET ${offset}`;
    const statement = db.query(fullSql);

    // Filter out undefined parameters before passing to all()
    const finalParams = Object.fromEntries(Object.entries(namedParams).filter(([, v]) => v !== undefined));

    return statement.all(finalParams as any) as RequestLog[]; // Cast to any to bypass strict bun-types
  }

  // 獲取最近的同步日誌 (支持分頁和過濾)
  static getRecentSyncLogs(limit = 10, offset = 0, filters?: SyncLogFilters): SyncLog[] {
    let whereClause = "";
    const namedParams: Record<string, string | number | undefined> = {};

    if (filters) {
      if (filters.providerName) {
        whereClause += ` AND providerName LIKE $providerName`;
        namedParams.$providerName = `%${filters.providerName}%`;
      }
      if (filters.model) {
        whereClause += ` AND model LIKE $model`;
        namedParams.$model = `%${filters.model}%`;
      }
      if (filters.result) {
        whereClause += ` AND result = $result`;
        namedParams.$result = filters.result;
      }
    }

    const fullSql = `SELECT * FROM sync_logs WHERE 1=1 ${whereClause} ORDER BY createdAt DESC LIMIT ${limit} OFFSET ${offset}`;
    const statement = db.query(fullSql);

    const finalParams = Object.fromEntries(Object.entries(namedParams).filter(([, v]) => v !== undefined));

    return statement.all(finalParams as any) as SyncLog[]; // Cast to any to bypass strict bun-types
  }
}
