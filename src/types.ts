// 全局類型定義 (Global Types)

export type Nullable<T> = T | null | undefined;

export interface RequestLog {
  id: string;
  method: string;
  path: string;
  model: string | null;
  status: number;
  duration: number;
  ip: string | null;
  createdAt: number;
}

export interface SyncLog {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  result: 'success' | 'failure';
  message: string;
  createdAt: number;
}
