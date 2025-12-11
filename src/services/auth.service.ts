import { config } from "../config";
import { logger } from "../utils/logger";

// 認證服務 (Auth Service)
// 負責驗證用戶提供的 API Key 是否有效
export class AuthService {
  // 驗證密鑰 (Validate Key)
  static validateKey(key: string | undefined): boolean {
    if (!key) return false;
    
    // 如果存在 "Bearer " 前綴，則將其移除
    const token = key.startsWith("Bearer ") ? key.slice(7) : key;
    
    // 檢查 Token 是否與配置中的 Hermes Secret 匹配
    const isValid = token === config.hermesSecret;
    
    if (!isValid) {
      logger.warn("無效的訪問嘗試 (Invalid access attempt)", { token });
    }
    
    return isValid;
  }
}