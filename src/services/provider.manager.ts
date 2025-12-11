import { db } from "../db";
import { AIProvider } from "../config/providers";
import { logger } from "../utils/logger";
import { LogService } from "./log.service"; // [NEW] 引入日誌服務

// 提供商管理服務 (Provider Manager Service) - SQLite 版
export class ProviderManagerService {

  // 獲取所有提供商
  static getAll(): AIProvider[] {
    const query = db.query("SELECT * FROM providers ORDER BY createdAt DESC");
    const results = query.all() as any[];

    // 反序列化 models 字段
    return results.map(row => ({
      ...row,
      models: JSON.parse(row.models)
    }));
  }

  // 添加提供商
  static async addProvider(name: string, baseUrl: string, apiKey: string): Promise<AIProvider> {
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
    const insert = db.query(`
      INSERT INTO providers (id, name, baseUrl, apiKey, models, status, createdAt)
      VALUES ($id, $name, $baseUrl, $apiKey, $models, $status, $createdAt)
    `);

    insert.run({
      $id: newProvider.id,
      $name: newProvider.name,
      $baseUrl: newProvider.baseUrl,
      $apiKey: newProvider.apiKey,
      $models: JSON.stringify(newProvider.models),
      $status: newProvider.status,
      $createdAt: newProvider.createdAt
    });

    // 觸發後台同步
    this.backgroundSyncTask(newProvider);

    return newProvider;
  }

  // 刪除提供商
  static removeProvider(id: string): boolean {
    const query = db.query("DELETE FROM providers WHERE id = $id");
    const result = query.run({ $id: id });
    return result.changes > 0;
  }

  // 更新提供商狀態和模型 (用於後台任務)
  private static updateProviderStatus(id: string, status: string, models?: string[]) {
    if (models) {
      const query = db.query("UPDATE providers SET status = $status, models = $models, lastSyncedAt = $now WHERE id = $id");
      query.run({
        $status: status,
        $models: JSON.stringify(models),
        $now: Date.now(),
        $id: id
      });
    } else {
      const query = db.query("UPDATE providers SET status = $status WHERE id = $id");
      query.run({
        $status: status,
        $id: id
      });
    }
  }

  // 後台異步任務
  private static async backgroundSyncTask(provider: AIProvider) {
    logger.info(`[後台任務] 開始為 ${provider.name} 同步模型...`);

    this.updateProviderStatus(provider.id, 'syncing');

    try {
      const rawModels = await this.fetchModelsFromUpstream(provider.baseUrl, provider.apiKey);

      const candidateModels = rawModels.filter(modelId => {
        const id = modelId.toLowerCase();
        return id.includes('gpt') || id.includes('claude') || id.includes('gemini') || id.includes('deepseek');
      });

      logger.info(`[後台任務] ${provider.name} 名稱篩選後候選數: ${candidateModels.length}`);

      const validModels: string[] = [];
      // 先清空模型列表
      this.updateProviderStatus(provider.id, 'syncing', []);

      for (const model of candidateModels) {
        // 低 RPM 保護：5秒
        await new Promise(resolve => setTimeout(resolve, 5000));

        const isWorking = await this.verifyModel(provider.baseUrl, provider.apiKey, model);

        if (isWorking) {
          validModels.push(model);
          logger.info(`[檢測通過] ${model}`);
          // [實時更新] 每次發現一個，就更新數據庫
          this.updateProviderStatus(provider.id, 'syncing', validModels);

          // [日誌] 記錄成功
          LogService.logSync({
            providerId: provider.id,
            providerName: provider.name,
            model: model,
            result: 'success',
            message: 'Model is active and responding'
          });
        } else {
          logger.warn(`[檢測失敗] ${model}`);

          // [日誌] 記錄失敗
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

      // [日誌] 記錄整體失敗
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
    } catch (error) {
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
}
