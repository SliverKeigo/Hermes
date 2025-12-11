import { providerStore, AIProvider } from "../config/providers";
import { logger } from "../utils/logger";

// 分發服務 (Dispatcher Service)
// "信使邏輯"：根據請求的模型選擇合適的上游提供商
export class DispatcherService {
  // 根據模型名稱獲取提供商 (Get Provider for Model)
  static getProviderForModel(modelName: string): AIProvider | null {
    // 1. 從動態存儲中查找所有支持該模型的提供商
    const candidates = providerStore.filter(p => p.models.includes(modelName));
    
    if (candidates.length === 0) {
      logger.warn(`未找到支持該模型的提供商: ${modelName}`);
      return null;
    }

    // 2. 負載均衡策略 (Load Balancing Strategy)
    // 目前使用簡單的隨機選擇 (Simple Round Robin or Random)
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    
    logger.info(`將模型 ${modelName} 分發給提供商: ${selected.name} (${selected.id})`);
    return selected;
  }
}
