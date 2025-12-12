import { db } from "../db";
import { RequestLog, SyncLog, RequestLogFilters, SyncLogFilters } from "../types";

export class LogService {
  private static counters = {
    upstreamErrors: 0,
    cooldowns: 0,
    retryExhausted: 0,
  };

  private static usage = {
    models: new Map<string, number>(),
    providers: new Map<string, { count: number; name: string }>(),
    providerErrors: new Map<string, number>(),
  };

  private static incModel(model: string | undefined) {
    if (!model) return;
    const next = (this.usage.models.get(model) ?? 0) + 1;
    this.usage.models.set(model, next);
  }

  private static incProvider(providerId: string, providerName: string) {
    const current = this.usage.providers.get(providerId) ?? { count: 0, name: providerName };
    current.count += 1;
    current.name = providerName; // keep latest name
    this.usage.providers.set(providerId, current);
  }

  static trackUsage(providerId: string, providerName: string, model: string) {
    this.incModel(model);
    this.incProvider(providerId, providerName);
  }

  static trackUpstreamError(providerId: string, providerName: string, model: string) {
    this.counters.upstreamErrors += 1;
    this.incModel(model);
    this.incProvider(providerId, providerName);
    this.usage.providerErrors.set(providerId, (this.usage.providerErrors.get(providerId) ?? 0) + 1);
  }

  static trackCooldown(providerId: string, providerName: string, model: string) {
    this.counters.cooldowns += 1;
    this.incModel(model);
    this.incProvider(providerId, providerName);
  }

  static trackRetryExhausted(model: string) {
    this.counters.retryExhausted += 1;
    this.incModel(model);
  }

  static getMetrics() {
    const topModel = [...this.usage.models.entries()].sort((a, b) => b[1] - a[1])[0];
    const topProvider = [...this.usage.providers.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    return {
      counters: { ...this.counters },
      usage: {
        models: Object.fromEntries(this.usage.models),
        providers: Object.fromEntries(
          [...this.usage.providers.entries()].map(([id, v]) => [id, { name: v.name, count: v.count }])
        ),
        topModel: topModel ? { model: topModel[0], count: topModel[1] } : null,
        topProvider: topProvider ? { id: topProvider[0], name: topProvider[1].name, count: topProvider[1].count } : null,
        providerErrors: Object.fromEntries(this.usage.providerErrors),
      },
    };
  }

  // 記錄 API 請求日誌
  static logRequest(data: {
    method: string;
    path: string;
    model?: string;
    status: number;
    duration: number;
    ip?: string;
  }) {
    const stmt = db.query(`
      INSERT INTO request_logs (id, method, path, model, status, duration, ip, createdAt)
      VALUES ($id, $method, $path, $model, $status, $duration, $ip, $createdAt)
    `);
    stmt.run({
      $id: crypto.randomUUID(),
      $method: data.method,
      $path: data.path,
      $model: data.model ?? null,
      $status: data.status,
      $duration: data.duration,
      $ip: data.ip ?? null,
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
    const stmt = db.query(`
      INSERT INTO sync_logs (id, providerId, providerName, model, result, message, createdAt)
      VALUES ($id, $providerId, $providerName, $model, $result, $message, $createdAt)
    `);
    stmt.run({
      $id: crypto.randomUUID(),
      $providerId: data.providerId,
      $providerName: data.providerName,
      $model: data.model,
      $result: data.result,
      $message: data.message ?? "",
      $createdAt: Date.now()
    });
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
