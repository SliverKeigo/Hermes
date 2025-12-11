// AI 提供商接口定義 (AI Provider Interface)
export interface AIProvider {
  id: string;       // 提供商唯一標識 (UUID)
  name: string;     // 提供商名稱
  baseUrl: string;  // 上游 API 的基礎 URL
  apiKey: string;   // 用於該上游的 API Key
  models: string[]; // 經過篩選和驗證後的模型列表
  status: 'pending' | 'syncing' | 'active' | 'error'; // 同步狀態
  lastSyncedAt?: number; // 上次同步時間
  createdAt: number; // 創建時間
}
