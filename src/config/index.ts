// 安全地獲取環境變量
// Cloudflare Workers 中沒有 process 對象，變量通常作為全局變量存在 (通過 [vars])
// Bun/Node 中通過 process.env 獲取
const getEnv = (key: string, defaultValue: string): string => {
  // 1. 嘗試從 process.env 獲取 (Bun/Node)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || defaultValue;
  }
  
  // 2. 嘗試從全局變量獲取 (Cloudflare Workers)
  // 在 Workers 中，如果在 wrangler.toml 的 [vars] 中定義了變量，它們會成為全局變量
  // 為了 TypeScript 不報錯，我們使用 (globalThis as any)
  const globalEnv = (globalThis as any)[key];
  if (globalEnv) {
    return globalEnv;
  }

  return defaultValue;
};

export const config = {
  port: parseInt(getEnv("PORT", "3000")),
  hermesSecret: getEnv("HERMES_SECRET", "hermes-secret-key-123"),
  // 新增：Provider 定時同步間隔，默認 24 小時 (毫秒)
  periodicSyncInterval: parseInt(getEnv("PERIODIC_SYNC_INTERVAL", (24 * 60 * 60 * 1000).toString()))
};