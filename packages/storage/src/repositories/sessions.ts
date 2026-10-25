import { nowIso, uuidv7, type MbtiResult, type ModeId, type SequenceEntry } from '@mindscope/core';
import type { SqlDriver } from '../driver';
import { IS_BIGFIVE } from './bigfive';

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface TestSession {
  id: string;
  profileId: string;
  versionId: string;
  mode: ModeId;
  status: SessionStatus;
  seed: number;
  plannedCount: number;
  /** Questions drawn so far, in order (see the adaptive planner). */
  sequence: SequenceEntry[];
  /** Index of the question on screen. */
  cursor: number;
  /** Item ids the user marked for review. */
  flags: string[];
  elapsedMs: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface StoredAnswer {
  value: number | null;
  timeMs: number;
  revisions: number;
}

export interface UnfinishedSession extends TestSession {
  profileName: string;
  answered: number;
  instrument: string;
  /** personality = 16-type test; bigfive = Big Five (preview); wellbeing = self-checks. */
  kind: 'personality' | 'bigfive' | 'wellbeing';
}

interface SessionRow {
  id: string;
  profile_id: string;
  version_id: string;
  mode: string;
  status: string;
  seed: number;
  planned_count: number;
  sequence_json: string;
  cursor: number;
  flags_json: string;
  elapsed_ms: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function toSession(r: SessionRow): TestSession {
  return {
    id: r.id,
    profileId: r.profile_id,
    versionId: r.version_id,
    mode: r.mode as ModeId,
    status: r.status as SessionStatus,
    seed: r.seed,
    plannedCount: r.planned_count,
    sequence: JSON.parse(r.sequence_json) as SequenceEntry[],
    cursor: r.cursor,
    flags: JSON.parse(r.flags_json) as string[],
    elapsedMs: r.elapsed_ms,
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

/** What is stored with every result besides the engine output. */
export interface ResultMeta {
  mode: ModeId;
  plannedCount: number;
  bankVersionId: string;
  bankMaturity: 'experimental' | 'published';
  seed: number;
  elapsedMs: number;
}

export class SessionError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'not_in_progress' | 'sequence_conflict') {
    super(message);
    this.name = 'SessionError';
  }
}

export class SessionsRepository {
  constructor(private readonly db: SqlDriver) {}

  async create(input: {
    profileId: string;
    versionId: string;
    mode: ModeId;
    seed: number;
    plannedCount: number;
    /** Adaptive tests start with one question; fixed questionnaires pass them all via `sequence`. */
    first: SequenceEntry;
    sequence?: SequenceEntry[];
  }): Promise<TestSession> {
    const id = uuidv7();
    const at = nowIso();
    await this.db.execute(
      `INSERT INTO test_sessions (id, profile_id, version_id, mode, status, seed, planned_count, sequence_json, cursor, flags_json, elapsed_ms, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?, 0, '[]', 0, ?, ?)`,
      [id, input.profileId, input.versionId, input.mode, input.seed, input.plannedCount, JSON.stringify(input.sequence ?? [input.first]), at, at],
    );
    return (await this.get(id))!;
  }

  async get(id: string): Promise<TestSession | null> {
    const rows = await this.db.query<SessionRow>('SELECT * FROM test_sessions WHERE id = ?', [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }

  async require(id: string): Promise<TestSession> {
    const s = await this.get(id);
    if (!s) throw new SessionError(`Session ${id} not found`, 'not_found');
    return s;
  }

  /** Unfinished tests, newest first, optionally for one person. */
  async listUnfinished(profileId?: string): Promise<UnfinishedSession[]> {
    const rows = await this.db.query<SessionRow & { profile_name: string; answered: number; instrument_id: string; kind: string }>(
      `SELECT s.*, p.name AS profile_name, v.instrument_id,
              CASE WHEN i.kind = 'wellbeing' THEN 'wellbeing' WHEN ${IS_BIGFIVE} THEN 'bigfive' ELSE 'personality' END AS kind,
              (SELECT COUNT(*) FROM answers a WHERE a.session_id = s.id AND a.value IS NOT NULL) AS answered
       FROM test_sessions s
       JOIN profiles p ON p.id = s.profile_id
       JOIN instrument_versions v ON v.id = s.version_id
       JOIN instruments i ON i.id = v.instrument_id
       WHERE s.status = 'in_progress' ${profileId ? 'AND s.profile_id = ?' : ''}
       ORDER BY s.updated_at DESC`,
      profileId ? [profileId] : [],
    );
    return rows.map((r) => ({
      ...toSession(r),
      profileName: r.profile_name,
      answered: r.answered,
      instrument: r.instrument_id,
      kind: r.kind as UnfinishedSession['kind'],
    }));
  }

  async answers(sessionId: string): Promise<Record<string, StoredAnswer>> {
    const rows = await this.db.query<{ item_id: string; value: number | null; time_ms: number; revisions: number }>(
      'SELECT item_id, value, time_ms, revisions FROM answers WHERE session_id = ?',
      [sessionId],
    );
    return Object.fromEntries(rows.map((r) => [r.item_id, { value: r.value, timeMs: r.time_ms, revisions: r.revisions }]));
  }

  /**
   * Saves (or changes) one answer immediately. Time spent is added up; a change
   * of value counts as a revision.
   */
  async saveAnswer(sessionId: string, itemId: string, value: number | null, addTimeMs: number): Promise<void> {
    const at = nowIso();
    await this.db.batch([
      {
        sql: `INSERT INTO answers (session_id, item_id, value, time_ms, revisions, answered_at)
              VALUES (?, ?, ?, ?, 0, ?)
              ON CONFLICT(session_id, item_id) DO UPDATE SET
                revisions   = answers.revisions + (CASE WHEN answers.value IS excluded.value THEN 0 ELSE 1 END),
                value       = excluded.value,
                time_ms     = answers.time_ms + excluded.time_ms,
                answered_at = excluded.answered_at`,
        params: [sessionId, itemId, value, Math.max(0, Math.round(addTimeMs)), at],
      },
      { sql: "UPDATE test_sessions SET updated_at = ? WHERE id = ? AND status = 'in_progress'", params: [at, sessionId] },
    ]);
  }

  /**
   * Appends the next drawn question. `expectedLength` guards against two
   * windows drawing at the same time: the append only happens if nobody else did.
   */
  async appendEntry(sessionId: string, entry: SequenceEntry, expectedLength: number): Promise<void> {
    const r = await this.db.execute(
      `UPDATE test_sessions
       SET sequence_json = json_insert(sequence_json, '$[#]', json(?)), cursor = ?, updated_at = ?
       WHERE id = ? AND status = 'in_progress' AND json_array_length(sequence_json) = ?`,
      [JSON.stringify(entry), expectedLength, nowIso(), sessionId, expectedLength],
    );
    if (r.changes !== 1) throw new SessionError('The question sequence changed elsewhere; reload the test.', 'sequence_conflict');
  }

  async setCursor(sessionId: string, cursor: number): Promise<void> {
    await this.db.execute("UPDATE test_sessions SET cursor = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'", [
      cursor,
      nowIso(),
      sessionId,
    ]);
  }

  async setFlags(sessionId: string, flags: string[]): Promise<void> {
    await this.db.execute("UPDATE test_sessions SET flags_json = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'", [
      JSON.stringify([...new Set(flags)]),
      nowIso(),
      sessionId,
    ]);
  }

  async addElapsed(sessionId: string, ms: number): Promise<void> {
    if (ms <= 0) return;
    await this.db.execute("UPDATE test_sessions SET elapsed_ms = elapsed_ms + ? WHERE id = ? AND status = 'in_progress'", [
      Math.round(ms),
      sessionId,
    ]);
  }

  /** Average time per answered question in this person's past tests (for time estimates). */
  async averageAnswerMs(profileId: string): Promise<number | null> {
    const [row] = await this.db.query<{ avg: number | null; n: number }>(
      `SELECT AVG(a.time_ms) AS avg, COUNT(*) AS n FROM answers a JOIN test_sessions s ON s.id = a.session_id
       WHERE s.profile_id = ? AND a.value IS NOT NULL AND a.time_ms > 0`,
      [profileId],
    );
    return row && row.n >= 20 && row.avg ? row.avg : null;
  }

  async abandon(sessionId: string): Promise<void> {
    await this.db.execute("UPDATE test_sessions SET status = 'abandoned', updated_at = ? WHERE id = ? AND status = 'in_progress'", [
      nowIso(),
      sessionId,
    ]);
  }

  /** Writes the result and closes the session in one transaction. Returns the result id. */
  async complete(sessionId: string, result: MbtiResult, meta: ResultMeta): Promise<string> {
    const session = await this.require(sessionId);
    if (session.status !== 'in_progress') throw new SessionError('This test has already been submitted.', 'not_in_progress');
    const resultId = uuidv7();
    const at = nowIso();
    await this.db.batch([
      {
        sql: `INSERT INTO results (id, session_id, profile_id, version_id, mode, type_code, engine_version, summary_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          resultId,
          sessionId,
          session.profileId,
          session.versionId,
          session.mode,
          result.typeCode,
          `${result.engine}/${result.engineVersion}`,
          JSON.stringify({ result, meta }),
          at,
        ],
      },
      ...Object.values(result.dimensions).map((d) => ({
        sql: 'INSERT INTO dimension_scores (result_id, dimension, score, se, n, pole, band) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [resultId, d.dimension, d.score, d.se, d.answered, d.pole, d.band],
      })),
      ...Object.values(result.functions).map((f) => ({
        sql: 'INSERT INTO function_scores (result_id, func, score, se, n, rank) VALUES (?, ?, ?, ?, ?, ?)',
        params: [resultId, f.func, f.score, f.se, f.answered, f.rank],
      })),
      {
        sql: "UPDATE test_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'",
        params: [at, at, sessionId],
      },
    ]);
    return resultId;
  }
}
