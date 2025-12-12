// 安全地獲取環境變量
const getEnv = (key: string, defaultValue: string): string => {
  let value: string | undefined;

  if (typeof process !== "undefined" && process.env && process.env[key] !== undefined) {
    value = process.env[key]!;
  } else {
    const globalEnvValue = (globalThis as any)[key];
    if (globalEnvValue !== undefined) {
      value = String(globalEnvValue);
    }
  }

  const finalValue = value !== undefined ? value : defaultValue;
  return finalValue;
};

export const config = {
  port: parseInt(getEnv("PORT", "3000")),
  hermesSecret: getEnv("HERMES_SECRET", "hermes-secret-key-123"),
  // 新增：Provider 定時同步間隔，默認 24 小時 (以小時為單位存儲)
  periodicSyncIntervalHours: parseInt(getEnv("PERIODIC_SYNC_INTERVAL_HOURS", "24"), 10),
  // 聊天重試次數，默認 3
  chatMaxRetries: parseInt(getEnv("CHAT_MAX_RETRIES", "3"), 10)
};
