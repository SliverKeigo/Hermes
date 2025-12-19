import { db } from "../db";

export class ConfigService {
  static get(key: string, defaultValue?: string): string | undefined {
    const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
    return row?.value ?? defaultValue;
  }

  static getNumber(key: string, defaultValue?: number): number | undefined {
    const val = this.get(key);
    return val ? Number(val) : defaultValue;
  }

  static set(key: string, value: string) {
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }

  static getAll(): Record<string, string> {
    const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
