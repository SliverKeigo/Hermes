import { AIProvider, providerStore } from "../config/providers";
import { logger } from "../utils/logger";

// 提供商管理服務 (Provider Manager Service)
export class ProviderManagerService {

  static getAll(): AIProvider[] {
    return providerStore;
  }

  // 1. 同步添加接口 (立即返回)
  static async addProvider(name: string, baseUrl: string, apiKey: string): Promise<AIProvider> {
    const id = crypto.randomUUID();

    const newProvider: AIProvider = {
      id,
      name,
      baseUrl: baseUrl.replace(/\/$/, ""),
      apiKey,
      models: [], // 初始為空
      status: 'pending', // 初始狀態
      createdAt: Date.now(),
    };

    providerStore.push(newProvider);

    // 2. 觸發後台異步同步任務 (Fire-and-Forget)
    // 不等待這個 Promise 完成，直接返回 Provider 對象
    this.backgroundSyncTask(newProvider);

    return newProvider;
  }

  static removeProvider(id: string): boolean {
    const index = providerStore.findIndex(p => p.id === id);
    if (index !== -1) {
      providerStore.splice(index, 1);
      return true;
    }
    return false;
  }

  // 3. 後台異步任務 (Background Task)
  // 包含低 RPM 檢測邏輯
  private static async backgroundSyncTask(provider: AIProvider) {
    logger.info(`[後台任務] 開始為 ${provider.name} 同步模型...`);

    // 更新狀態為同步中
    provider.status = 'syncing';

    try {
      // 1. 獲取原始列表
      const rawModels = await this.fetchModelsFromUpstream(provider.baseUrl, provider.apiKey);

      // 2. 名稱初步篩選 (Name Filter)
      const candidateModels = rawModels.filter(modelId => {
        const id = modelId.toLowerCase();
        return id.includes('gpt') || id.includes('claude') || id.includes('gemini') || id.includes('deepseek');
      });

      logger.info(`[後台任務] ${provider.name} 名稱篩選後候選數: ${candidateModels.length}，準備進行可用性檢測...`);

      // 3. 逐個進行實彈檢測 (Active Verification)
      // 清空舊模型列表，準備重新填充
      provider.models = [];

      for (const model of candidateModels) {
        // 低 RPM 保護：每次檢測前等待 5 秒 (12 RPM)
        await new Promise(resolve => setTimeout(resolve, 5000));

        const isWorking = await this.verifyModel(provider.baseUrl, provider.apiKey, model);

        if (isWorking) {
          // [實時更新] 檢測通過一個，就立即加入存儲，以便前端輪詢時能看到
          provider.models.push(model);
          logger.info(`[檢測通過] ${model}`);
        } else {
          logger.warn(`[檢測失敗] ${model} - 無法調用或無權限`);
        }
      }

      logger.info(`[後台任務] ${provider.name} 同步完成。最終可用模型: ${provider.models.length}`);

      // 更新狀態
      provider.status = 'active';
      provider.lastSyncedAt = Date.now();
    } catch (error: any) {
      logger.error(`[後台任務] ${provider.name} 同步失敗`, error);
      provider.status = 'error';
    }
  }

  // 驗證模型是否真實可用 (Probe)
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
          messages: [{ role: "user", content: "Hi" }], // 極簡 Prompt
          max_tokens: 1 // 節省 Token
        })
      });

      return response.ok; // 只有 200-299 視為可用
    } catch (error) {
      return false;
    }
  }

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
