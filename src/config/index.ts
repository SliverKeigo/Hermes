// 全局配置對象 (Global Configuration)
export const config = {
  // 服務端口 (默認 3000)
  port: parseInt(process.env.PORT || "3000"),
  
  // Hermes 統一密鑰 (用於用戶驗證)
  // 在生產環境中應使用更安全的管理方式
  hermesSecret: process.env.HERMES_SECRET || "hermes-secret-key-123", 
};