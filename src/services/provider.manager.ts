import { db } from "../db";
import { AIProvider } from "../config/providers";
import { logger } from "../utils/logger";
import { LogService } from "./log.service";
import { config } from "../config"; // 導入 config
import { DispatcherService } from "./dispatcher.service"; // [NEW] 導入 DispatcherService

// 提供商管理服務 (Provider Manager Service) - SQLite 版 (同步版)
export class ProviderManagerService {
  private static periodicSyncIntervalId: Timer | undefined; // 使用 Timer 類型

  // 獲取所有提供商
  static getAll(): AIProvider[] {
    const results = db.query(`SELECT * FROM providers ORDER BY createdAt DESC`).all() as any[];

    // 反序列化 models 字段
    return results.map(row => ({
      ...row,
      models: JSON.parse(row.models)
    }));
  }

  // 添加提供商
  static addProvider(name: string, baseUrl: string, apiKey: string): AIProvider {
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    const newProvider: AIProvider = {
      id,
      name,
      baseUrl: baseUrl.replace(/\/$/, ""),
      apiKey,
      models: [],
      status: 'pending',
      createdAt,
    };

    // 插入數據庫
    db.exec(`
      INSERT INTO providers (id, name, baseUrl, apiKey, models, status, createdAt)
      VALUES ('${newProvider.id}', '${newProvider.name}', '${newProvider.baseUrl}', '${newProvider.apiKey}', '${JSON.stringify(newProvider.models)}', '${newProvider.status}', ${newProvider.createdAt})
    `);

    // 觸發後台同步 (這部分仍然是異步的，因為它確實是一個後台任務)
    this.backgroundSyncTask(newProvider);

    return newProvider;
  }

  // 刪除提供商
  static removeProvider(id: string): boolean {
    // 使用 db.query() 和 .run()
    const query = db.query(`DELETE FROM providers WHERE id = $id`);
    const result = query.run({ $id: id }); // Changed to run with named parameter
    return result.changes > 0;
  }

  // 更新提供商信息並重新同步
  static updateProvider(id: string, updates: { name?: string; baseUrl?: string; apiKey?: string }): AIProvider {
    const existingRow = db.query(`SELECT * FROM providers WHERE id = $id`).get({ $id: id }) as any;
    if (!existingRow) {
      throw new Error("Provider not found");
    }

    const sanitizedBaseUrl = updates.baseUrl ? updates.baseUrl.replace(/\/$/, "") : existingRow.baseUrl;
    const nextProvider: AIProvider = {
      ...existingRow,
      name: updates.name ?? existingRow.name,
      baseUrl: sanitizedBaseUrl,
      apiKey: updates.apiKey ?? existingRow.apiKey,
      models: JSON.parse(existingRow.models || "[]"),
      status: "pending",
    };

    db.exec(`
      UPDATE providers
      SET name = '${nextProvider.name}',
          baseUrl = '${nextProvider.baseUrl}',
          apiKey = '${nextProvider.apiKey}',
          status = 'pending',
          models = '[]',
          lastSyncedAt = NULL,
          lastUsedAt = ${Date.now()}
      WHERE id = '${id}'
    `);

    // 觸發重新同步
    this.backgroundSyncTask(nextProvider);
    return nextProvider;
  }

  // 手動觸發同步/探活
  static triggerResync(id: string): void {
    const row = db.query(`SELECT * FROM providers WHERE id = $id`).get({ $id: id }) as any;
    if (!row) {
      throw new Error("Provider not found");
    }
    const provider: AIProvider = {
      ...row,
      models: JSON.parse(row.models || "[]"),
    };
    this.backgroundSyncTask(provider);
  }

  // 更新提供商狀態和模型 (用於後台任務)
  private static updateProviderStatus(id: string, status: string, models?: string[]) {
    const now = Date.now();
    if (models) {
      db.exec(`UPDATE providers SET status = '${status}', models = '${JSON.stringify(models)}', lastUsedAt = ${now}, lastSyncedAt = ${now} WHERE id = '${id}'`);
    } else {
      db.exec(`UPDATE providers SET status = '${status}' WHERE id = '${id}'`);
    }
  }

  // 啟動所有 Provider 的週期性同步任務
  static startPeriodicSync(): void { // 移除 intervalHours 參數
    if (this.periodicSyncIntervalId) {
        clearInterval(this.periodicSyncIntervalId); // 如果已存在，先清除
    }

    // 每次都讀取 config 的最新值
    const intervalHours = config.periodicSyncIntervalHours;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    logger.info(`[定時任務] Provider 週期性同步已啟動，間隔 ${intervalHours} 小時 (${intervalMs / 1000} 秒)`);
    this.periodicSyncIntervalId = setInterval(() => {
      // 在回調內部再次讀取配置，確保是最新的
      const currentIntervalHours = config.periodicSyncIntervalHours;
      const currentIntervalMs = currentIntervalHours * 60 * 60 * 1000;

      // 如果間隔時間改變了，重啟定時器
      if (this.periodicSyncIntervalId && currentIntervalMs !== intervalMs) { // 比較新的和舊的間隔
          logger.info(`[定時任務] 間隔時間已變更，重啟定時器為 ${currentIntervalHours} 小時`);
          this.startPeriodicSync(); // 重新調用自己，將會清理舊的並啟動新的
          return; // 避免本次重複執行
      }

      logger.info(`[定時任務] 開始執行所有 Provider 的同步`);
      const allProviders = ProviderManagerService.getAll();
      allProviders.forEach(provider => {
        // 為每個 Provider 啟動獨立的同步任務，不阻塞主循環
        this.backgroundSyncTask(provider);
      });
    }, intervalMs);
  }

  // 獲取當前定時任務間隔 (小時)
  static getPeriodicSyncIntervalHours(): number {
      return config.periodicSyncIntervalHours;
  }

  // 設置定時任務間隔 (小時，並重啟定時器)
  static setPeriodicSyncIntervalHours(newIntervalHours: number): void {
      config.periodicSyncIntervalHours = newIntervalHours; // 更新配置
      // 這裡需要持久化 config.periodicSyncIntervalHours，但目前 config 是靜態內存對象
      // 在 MVP 階段先不處理持久化，但未來應該保存到 DB
      this.startPeriodicSync(); // 重啟定時器
  }

  // 後台異步任務 (仍然是異步的)
  private static async backgroundSyncTask(provider: AIProvider) {
    logger.info(`[後台任務] 開始為 ${provider.name} 同步模型...`);

    this.updateProviderStatus(provider.id, 'syncing');

    try {
      const rawModels = await this.fetchModelsFromUpstream(provider.baseUrl, provider.apiKey);


      logger.info(`[後台任務] ${provider.name} 名稱篩選後候選數: ${rawModels.length}`);

      const validModels: string[] = [];
      // 先清空模型列表
      this.updateProviderStatus(provider.id, 'syncing', []);

      for (const model of rawModels) {
        // 低 RPM 保護：5秒
        await new Promise(resolve => setTimeout(resolve, 5000));

        const isWorking = await this.verifyModel(provider.baseUrl, provider.apiKey, model);

                if (isWorking) {
                  validModels.push(model);
                  logger.info(`[檢測通過] ${model}`);
                  // [實時更新]
                  this.updateProviderStatus(provider.id, 'syncing', validModels);
                  
                  // [NEW] 解除冷卻 (如果之前被標記為故障)
                  DispatcherService.clearCooldown(provider.id, model);
        
                  LogService.logSync({
                    providerId: provider.id,
                    providerName: provider.name,
                    model: model,
                    result: 'success',
                    message: 'Model is active and responding'
                  });
                } else {          logger.warn(`[檢測失敗] ${model}`);

          LogService.logSync({
            providerId: provider.id,
            providerName: provider.name,
            model: model,
            result: 'failure',
            message: 'Verification failed (401/404/500)'
          });
        }
      }

      logger.info(`[後台任務] ${provider.name} 同步完成。最終可用: ${validModels.length}`);
      this.updateProviderStatus(provider.id, 'active', validModels);

    } catch (error: any) {
      logger.error(`[後台任務] ${provider.name} 同步失敗`, error);
      this.updateProviderStatus(provider.id, 'error');

      LogService.logSync({
        providerId: provider.id,
        providerName: provider.name,
        model: 'ALL',
        result: 'failure',
        message: `Sync process failed: ${error.message}`
      });
    }
  }

  // 驗證模型 (Probe)
  private static async verifyModel(baseUrl: string, apiKey: string, model: string): Promise<boolean> {
    const url = `${baseUrl}/chat/completions`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // 獲取上游列表
  private static async fetchModelsFromUpstream(baseUrl: string, apiKey: string): Promise<string[]> {
    const url = `${baseUrl}/models`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Upstream responded with ${response.status}`);
    }

    const data = await response.json();
    if (data && Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id);
    }
    return [];
  }

  // 當上游返回 model_not_found 時，臨時剔除模型並觸發重同步
  static handleModelNotFound(providerId: string, model: string): boolean {
    const row = db.query(`SELECT * FROM providers WHERE id = $id`).get({ $id: providerId }) as any;
    if (!row) {
      logger.warn(`[ProviderManager] 無法處理 model_not_found，Provider 不存在: ${providerId}`);
      return false;
    }

    const models: string[] = JSON.parse(row.models || "[]");
    if (!models.includes(model)) {
      logger.info(`[ProviderManager] model_not_found: Provider ${providerId} 未列出模型 ${model}，略過剔除`);
      return false;
    }

    const nextModels = models.filter(m => m !== model);
    db.exec(`UPDATE providers SET models = '${JSON.stringify(nextModels)}', status = 'syncing', lastUsedAt = ${Date.now()} WHERE id = '${providerId}'`);
    logger.warn(`[ProviderManager] 上游回報 model_not_found，暫時移除模型並重同步: provider=${providerId} model=${model}`);

    // 立即觸發一次重同步，刷新模型列表
    try {
      this.triggerResync(providerId);
    } catch (error) {
      logger.error(`[ProviderManager] 重同步失敗 (model_not_found): provider=${providerId}`, error);
    }

    return true;
  }
}
