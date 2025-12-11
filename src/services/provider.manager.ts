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
      // 模擬排隊/低 RPM 延遲 (例如等待 1 秒，避免併發添加時觸發限流)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const rawModels = await this.fetchModelsFromUpstream(provider.baseUrl, provider.apiKey);
      
      // 4. 過濾篩選邏輯 (Filter Logic)
      // 例如：只保留 gpt 或 claude 開頭的模型，過濾掉 whisper/dall-e 等非對話模型
      // 這也是 "檢測" 的一部分，確保我們只存儲能用的 Chat 模型
      const validModels = rawModels.filter(modelId => {
        const id = modelId.toLowerCase();
        return id.includes('gpt') || id.includes('claude') || id.includes('gemini') || id.includes('deepseek');
      });

      logger.info(`[後台任務] ${provider.name} 原始模型數: ${rawModels.length}, 篩選後: ${validModels.length}`);

      // 更新存儲
      provider.models = validModels;
      provider.status = 'active';
      provider.lastSyncedAt = Date.now();

    } catch (error: any) {
      logger.error(`[後台任務] ${provider.name} 同步失敗`, error);
      provider.status = 'error';
      // 可以在這裡添加重試邏輯 (TODO)
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