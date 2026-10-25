import type { SqlDriver } from '../driver';
import { IS_BIGFIVE } from './bigfive';

export interface Overview {
  profiles: number;
  completedTests: number;
  inProgressTests: number;
  lastTestAt: string | null;
  /** The most recent result of any kind, so the home page can open it. */
  lastResult: { id: string; kind: 'personality' | 'bigfive' | 'wellbeing' } | null;
}

export class StatsRepository {
  constructor(private readonly db: SqlDriver) {}

  async overview(): Promise<Overview> {
    const [row] = await this.db.query<{
      profiles: number;
      completed: number;
      in_progress: number;
      last_at: string | null;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM profiles) AS profiles,
         (SELECT COUNT(*) FROM results) AS completed,
         (SELECT COUNT(*) FROM test_sessions WHERE status = 'in_progress') AS in_progress,
         (SELECT MAX(created_at) FROM results) AS last_at`,
    );
    const [last] = await this.db.query<{ id: string; kind: 'personality' | 'bigfive' | 'wellbeing' }>(
      `SELECT r.id, CASE WHEN i.kind = 'wellbeing' THEN 'wellbeing' WHEN ${IS_BIGFIVE} THEN 'bigfive' ELSE 'personality' END AS kind FROM results r
         JOIN instrument_versions v ON v.id = r.version_id
         JOIN instruments i ON i.id = v.instrument_id
       ORDER BY r.created_at DESC, r.id DESC LIMIT 1`,
    );
    return {
      lastResult: last ? { id: last.id, kind: last.kind } : null,
      profiles: row?.profiles ?? 0,
      completedTests: row?.completed ?? 0,
      inProgressTests: row?.in_progress ?? 0,
      lastTestAt: row?.last_at ?? null,
    };
  }
}
