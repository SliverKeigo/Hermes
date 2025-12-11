import { AIProvider } from "../config/providers";
import { ProviderManagerService } from "./provider.manager"; // [NEW] 引入管理器
import { logger } from "../utils/logger";

// 分發服務 (Dispatcher Service)
// "信使邏輯"：根據請求的模型選擇合適的上游提供商
export class DispatcherService {
  // 根據模型名稱獲取提供商 (Get Provider for Model)
  static getProviderForModel(modelName: string): AIProvider | null {
    // 1. 從數據庫中獲取所有活躍的提供商
    const allProviders = ProviderManagerService.getAll();
    
    // 2. 查找支持該模型且狀態為 active 的提供商
    const candidates = allProviders.filter(p => 
      p.status === 'active' && p.models.includes(modelName)
    );
    
    if (candidates.length === 0) {
      logger.warn(`未找到支持該模型的活躍提供商: ${modelName}`);
      return null;
    }

    // 3. 負載均衡策略 (Load Balancing Strategy)
    // 目前使用簡單的隨機選擇 (Simple Round Robin or Random)
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    
    logger.info(`將模型 ${modelName} 分發給提供商: ${selected.name} (${selected.id})`);
    return selected;
  }
}
