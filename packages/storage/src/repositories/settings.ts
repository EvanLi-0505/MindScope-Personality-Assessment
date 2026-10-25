import { nowIso } from '@mindscope/core';
import type { SqlDriver } from '../driver';

export class SettingsRepository {
  constructor(private readonly db: SqlDriver) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.db.query<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', [key]);
    if (!rows.length) return fallback;
    try {
      return JSON.parse(rows[0]!.value_json) as T;
    } catch {
      return fallback;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.execute(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), nowIso()],
    );
  }

  async remove(key: string): Promise<void> {
    await this.db.execute('DELETE FROM app_settings WHERE key = ?', [key]);
  }
}
