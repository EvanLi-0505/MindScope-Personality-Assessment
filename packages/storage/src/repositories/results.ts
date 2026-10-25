import type { MbtiResult, ModeId } from '@mindscope/core';
import type { SqlDriver } from '../driver';
import { IS_BIGFIVE } from './bigfive';
import type { ResultMeta } from './sessions';

export interface StoredResult {
  id: string;
  sessionId: string;
  profileId: string;
  versionId: string;
  mode: ModeId;
  typeCode: string | null;
  engineVersion: string;
  result: MbtiResult;
  meta: ResultMeta;
  createdAt: string;
}

export interface LatestResult {
  resultId: string;
  typeCode: string | null;
  createdAt: string;
  mode: ModeId;
}

interface ResultRow {
  id: string;
  session_id: string;
  profile_id: string;
  version_id: string;
  mode: string;
  type_code: string | null;
  engine_version: string;
  summary_json: string;
  created_at: string;
}

function toResult(r: ResultRow): StoredResult {
  const summary = JSON.parse(r.summary_json) as { result: MbtiResult; meta: ResultMeta };
  return {
    id: r.id,
    sessionId: r.session_id,
    profileId: r.profile_id,
    versionId: r.version_id,
    mode: r.mode as ModeId,
    typeCode: r.type_code,
    engineVersion: r.engine_version,
    result: summary.result,
    meta: summary.meta,
    createdAt: r.created_at,
  };
}

export interface ResultFilter {
  profileIds?: string[];
  modes?: ModeId[];
  /** Inclusive ISO lower bound. */
  from?: string;
  /** Exclusive ISO upper bound. */
  to?: string;
}

export interface ResultWithProfile extends StoredResult {
  profileName: string;
}

/** Restricts queries on `results r` to personality instruments. */
/** 16-type results only: personality instruments except the Big Five (which has its own repository). */
const PERSONALITY = `r.version_id IN (SELECT v.id FROM instrument_versions v JOIN instruments i ON i.id = v.instrument_id WHERE i.kind = 'personality' AND NOT (${IS_BIGFIVE}))`;

/** 16-type results only; wellbeing results are read through ScalesRepository. */
export class ResultsRepository {
  constructor(private readonly db: SqlDriver) {}

  /** Results with their person's name, newest first. */
  async list(filter: ResultFilter = {}): Promise<ResultWithProfile[]> {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.profileIds?.length) {
      where.push(`r.profile_id IN (${filter.profileIds.map(() => '?').join(',')})`);
      params.push(...filter.profileIds);
    }
    if (filter.modes?.length) {
      where.push(`r.mode IN (${filter.modes.map(() => '?').join(',')})`);
      params.push(...filter.modes);
    }
    if (filter.from) {
      where.push('r.created_at >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      where.push('r.created_at < ?');
      params.push(filter.to);
    }
    where.push(PERSONALITY);
    const rows = await this.db.query<ResultRow & { profile_name: string }>(
      `SELECT r.*, p.name AS profile_name FROM results r JOIN profiles p ON p.id = r.profile_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.created_at DESC, r.id DESC`,
      params,
    );
    return rows.map((r) => ({ ...toResult(r), profileName: r.profile_name }));
  }

  /** Several results in the order of `ids`; unknown ids are skipped. */
  async getMany(ids: string[]): Promise<ResultWithProfile[]> {
    if (!ids.length) return [];
    const rows = await this.db.query<ResultRow & { profile_name: string }>(
      `SELECT r.*, p.name AS profile_name FROM results r JOIN profiles p ON p.id = r.profile_id
       WHERE r.id IN (${ids.map(() => '?').join(',')}) AND ${PERSONALITY}`,
      ids,
    );
    const byId = new Map(rows.map((r) => [r.id, { ...toResult(r), profileName: r.profile_name }]));
    return ids.map((id) => byId.get(id)).filter((r): r is ResultWithProfile => !!r);
  }

  /** Deletes one result together with its session and answers. */
  async remove(id: string): Promise<boolean> {
    const r = await this.db.execute('DELETE FROM test_sessions WHERE id = (SELECT session_id FROM results WHERE id = ?)', [id]);
    return r.changes > 0;
  }

  async get(id: string): Promise<StoredResult | null> {
    const rows = await this.db.query<ResultRow>(`SELECT * FROM results r WHERE r.id = ? AND ${PERSONALITY}`, [id]);
    return rows[0] ? toResult(rows[0]) : null;
  }

  async bySession(sessionId: string): Promise<StoredResult | null> {
    const rows = await this.db.query<ResultRow>(`SELECT * FROM results r WHERE r.session_id = ? AND ${PERSONALITY}`, [sessionId]);
    return rows[0] ? toResult(rows[0]) : null;
  }

  async listByProfile(profileId: string): Promise<StoredResult[]> {
    const rows = await this.db.query<ResultRow>(`SELECT * FROM results r WHERE r.profile_id = ? AND ${PERSONALITY} ORDER BY r.created_at DESC`, [profileId]);
    return rows.map(toResult);
  }

  /** Most recent result of every person card, for list views. */
  async latestByProfile(): Promise<Map<string, LatestResult & { count: number }>> {
    const rows = await this.db.query<{ profile_id: string; id: string; type_code: string | null; created_at: string; mode: string; n: number }>(
      `SELECT r.profile_id, r.id, r.type_code, r.created_at, r.mode,
              (SELECT COUNT(*) FROM results c WHERE c.profile_id = r.profile_id AND ${PERSONALITY.replaceAll('r.version_id', 'c.version_id')}) AS n
       FROM results r
       WHERE ${PERSONALITY} AND r.id = (
         SELECT r2.id FROM results r2 WHERE r2.profile_id = r.profile_id AND ${PERSONALITY.replaceAll('r.version_id', 'r2.version_id')}
         ORDER BY r2.created_at DESC, r2.id DESC LIMIT 1)`,
    );
    return new Map(
      rows.map((r) => [r.profile_id, { resultId: r.id, typeCode: r.type_code, createdAt: r.created_at, mode: r.mode as ModeId, count: r.n }]),
    );
  }
}
