/**
 * Big Five (preview). Stored as a `personality` instrument (the table only
 * allows personality / wellbeing) and told apart from the 16-type test by
 * its scoring engine, `likert-mean@…`. All queries here filter on that
 * engine, and the 16-type queries exclude it, so the two never mix.
 */
import {
  B5_DOMAINS,
  canonicalJson,
  nowIso,
  sha256Hex,
  uuidv7,
  type B5FormId,
  type BankItem,
  type BigFiveFile,
  type BigFiveResult,
  type I18nText,
} from '@mindscope/core';
import type { SqlDriver, Statement } from '../driver';
import { BankIntegrityError, type StoredBank } from './bank';

/** SQL condition on instrument_versions `v`: is this a Big Five version? */
export const IS_BIGFIVE = `json_extract(v.scoring_json, '$.engine') LIKE 'likert-mean@%'`;

export interface StoredBigFive extends BigFiveFile {
  versionId: string;
  contentHash: string;
}

export interface BigFiveResultMeta {
  versionId: string;
  form: B5FormId;
  elapsedMs: number;
}

export interface StoredBigFiveResult {
  id: string;
  sessionId: string;
  profileId: string;
  profileName: string;
  versionId: string;
  form: B5FormId;
  result: BigFiveResult;
  meta: BigFiveResultMeta;
  createdAt: string;
}

type Meta = Pick<BigFiveFile, 'description' | 'instructions' | 'licenseNote' | 'translationNote' | 'citations'> & { kind: 'bigfive' };

export const bigFiveVersionId = (f: Pick<BigFiveFile, 'instrument' | 'version'>) => `${f.instrument}@${f.version}`;
export const bigFiveHash = (f: BigFiveFile) => sha256Hex(canonicalJson(f));

interface ResultRow {
  id: string;
  session_id: string;
  profile_id: string;
  profile_name: string;
  version_id: string;
  mode: string;
  summary_json: string;
  created_at: string;
}

const RESULT_SELECT = `
  SELECT r.id, r.session_id, r.profile_id, p.name AS profile_name, r.version_id, r.mode, r.summary_json, r.created_at
  FROM results r
  JOIN profiles p ON p.id = r.profile_id
  JOIN instrument_versions v ON v.id = r.version_id
  WHERE ${IS_BIGFIVE}`;

function toResult(r: ResultRow): StoredBigFiveResult {
  const s = JSON.parse(r.summary_json) as { result: BigFiveResult; meta: BigFiveResultMeta };
  return {
    id: r.id,
    sessionId: r.session_id,
    profileId: r.profile_id,
    profileName: r.profile_name,
    versionId: r.version_id,
    form: r.mode as B5FormId,
    result: s.result,
    meta: s.meta,
    createdAt: r.created_at,
  };
}

export class BigFiveRepository {
  private cache = new Map<string, StoredBigFive>();

  constructor(private readonly db: SqlDriver) {}

  /** Copies the built-in bank in once; a changed bank with the same version is refused. */
  async installBuiltin(file: BigFiveFile): Promise<{ versionId: string; installed: boolean }> {
    const versionId = bigFiveVersionId(file);
    const hash = bigFiveHash(file);
    const existing = await this.db.query<{ content_hash: string }>('SELECT content_hash FROM instrument_versions WHERE id = ?', [versionId]);
    if (existing.length) {
      if (existing[0]!.content_hash !== hash) throw new BankIntegrityError(versionId);
      return { versionId, installed: false };
    }
    const at = nowIso();
    const meta: Meta = {
      kind: 'bigfive',
      description: file.description,
      instructions: file.instructions,
      licenseNote: file.licenseNote,
      translationNote: file.translationNote,
      citations: file.citations,
    };
    const statements: Statement[] = [
      {
        sql: 'INSERT OR IGNORE INTO instruments (id, kind, name_i18n, created_at) VALUES (?, ?, ?, ?)',
        params: [file.instrument, 'personality', JSON.stringify(file.title), at],
      },
      {
        sql: `INSERT INTO instrument_versions
              (id, instrument_id, version, status, is_builtin, content_hash, title_i18n, scales_json, scoring_json, modes_json, license, source, created_at, maturity, meta_json)
              VALUES (?, ?, ?, 'published', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          versionId,
          file.instrument,
          file.version,
          hash,
          JSON.stringify(file.title),
          JSON.stringify({ options: file.options }),
          JSON.stringify(file.scoring),
          JSON.stringify(file.forms),
          file.license,
          JSON.stringify(file.source),
          at,
          file.status,
          JSON.stringify(meta),
        ],
      },
      ...file.items.map((item, ordinal) => ({
        sql: `INSERT INTO bank_items (version_id, item_id, ordinal, target, key, weight, scale_id, text_i18n, tags_json, modes_json, enabled)
              VALUES (?, ?, ?, 'pool', 1, 1, 'likert5', ?, ?, NULL, 1)`,
        params: [versionId, item.id, ordinal, JSON.stringify(item.text), JSON.stringify(item.adapted ? [`adapted:${item.adapted.replaces}`] : [])],
      })),
    ];
    await this.db.batch(statements);
    return { versionId, installed: true };
  }

  async latestVersionId(): Promise<string | null> {
    const [row] = await this.db.query<{ id: string }>(
      `SELECT v.id FROM instrument_versions v WHERE ${IS_BIGFIVE} AND v.status = 'published' ORDER BY v.created_at DESC, v.id DESC LIMIT 1`,
    );
    return row?.id ?? null;
  }

  /** Version ids are `instrument@version`; used to route sessions without a query. */
  isBigFiveVersion(versionId: string): boolean {
    return versionId.startsWith('ipip-b5@');
  }

  async load(versionId: string): Promise<StoredBigFive> {
    const cached = this.cache.get(versionId);
    if (cached) return cached;
    const [v] = await this.db.query<{
      instrument_id: string;
      version: string;
      maturity: string;
      content_hash: string;
      title_i18n: string;
      scales_json: string;
      scoring_json: string;
      modes_json: string;
      license: string | null;
      source: string | null;
      meta_json: string;
    }>(`SELECT v.* FROM instrument_versions v WHERE v.id = ? AND ${IS_BIGFIVE}`, [versionId]);
    if (!v) throw new Error(`Unknown Big Five version ${versionId}`);
    const items = await this.db.query<{ item_id: string; text_i18n: string; tags_json: string }>(
      'SELECT item_id, text_i18n, tags_json FROM bank_items WHERE version_id = ? ORDER BY ordinal',
      [versionId],
    );
    const meta = JSON.parse(v.meta_json) as Meta;
    const stored: StoredBigFive = {
      versionId,
      contentHash: v.content_hash,
      instrument: v.instrument_id,
      version: v.version,
      status: v.maturity === 'published' ? 'published' : 'experimental',
      title: JSON.parse(v.title_i18n) as I18nText,
      description: meta.description,
      instructions: meta.instructions,
      source: v.source ? (JSON.parse(v.source) as I18nText) : { 'zh-CN': '' },
      license: v.license ?? '',
      licenseNote: meta.licenseNote,
      translationNote: meta.translationNote,
      citations: meta.citations,
      options: (JSON.parse(v.scales_json) as { options: BigFiveFile['options'] }).options,
      scoring: JSON.parse(v.scoring_json),
      forms: JSON.parse(v.modes_json),
      items: items.map((i) => {
        const adapted = (JSON.parse(i.tags_json) as string[]).find((t) => t.startsWith('adapted:'));
        return { id: i.item_id, text: JSON.parse(i.text_i18n) as I18nText, ...(adapted ? { adapted: { replaces: adapted.slice(8) } } : {}) };
      }),
    };
    this.cache.set(versionId, stored);
    return stored;
  }

  /**
   * The bank seen through one form, in the shape the shared answering page
   * uses (items with a target and key, a 5-point scale with labels).
   */
  asBank(b: StoredBigFive, form: B5FormId): StoredBank {
    const byId = new Map(b.items.map((i) => [i.id, i]));
    const labels: Record<string, string[]> = {};
    for (const loc of ['zh-CN', 'en']) labels[loc] = b.options.map((o) => o.label[loc] ?? o.label['zh-CN']);
    const items: BankItem[] = b.forms[form].entries.map((e) => ({
      id: e.item,
      target: e.domain as unknown as BankItem['target'],
      key: e.key,
      weight: 1,
      scale: 'likert5',
      text: byId.get(e.item)!.text,
      enabled: true,
    }));
    return {
      versionId: b.versionId,
      contentHash: b.contentHash,
      installedAt: '',
      instrument: b.instrument,
      version: b.version,
      status: b.status,
      title: b.title,
      license: b.license,
      source: b.source,
      scales: { likert5: { points: 5, labels } },
      scoring: { engine: b.scoring.engine, balancedThreshold: 0, bands: [0, 0, 0], minAnsweredRatio: b.scoring.minAnsweredRatio, minFunctionItems: 0 },
      modes: {} as StoredBank['modes'],
      items,
    };
  }

  /** Writes a result (domains and facets as queryable rows) and closes the session. */
  async complete(sessionId: string, result: BigFiveResult, meta: BigFiveResultMeta): Promise<string> {
    const [s] = await this.db.query<{ profile_id: string; status: string; version_id: string }>(
      'SELECT profile_id, status, version_id FROM test_sessions WHERE id = ?',
      [sessionId],
    );
    if (!s) throw new Error(`Session ${sessionId} not found`);
    if (s.status !== 'in_progress') throw new Error('This test has already been submitted.');
    if (B5_DOMAINS.some((d) => result.domains[d].mean === null)) throw new Error('Too many questions are unanswered.');
    const id = uuidv7();
    const at = nowIso();
    const rows = [
      ...B5_DOMAINS.map((d) => [d, result.domains[d]] as const),
      ...Object.entries(result.facets ?? {}),
    ];
    await this.db.batch([
      {
        sql: `INSERT INTO results (id, session_id, profile_id, version_id, mode, type_code, engine_version, summary_json, created_at)
              VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        params: [id, sessionId, s.profile_id, s.version_id, result.form, `${result.engine}/${result.engineVersion}`, JSON.stringify({ result, meta }), at],
      },
      ...rows.map(([dim, sc]) => ({
        sql: 'INSERT INTO dimension_scores (result_id, dimension, score, se, n, pole, band) VALUES (?, ?, ?, ?, ?, NULL, ?)',
        params: [id, dim, sc.mean, sc.se, sc.answered, sc.band],
      })),
      {
        sql: "UPDATE test_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'",
        params: [at, at, sessionId],
      },
    ]);
    return id;
  }

  async get(id: string): Promise<StoredBigFiveResult | null> {
    const rows = await this.db.query<ResultRow>(`${RESULT_SELECT} AND r.id = ?`, [id]);
    return rows[0] ? toResult(rows[0]) : null;
  }

  async bySession(sessionId: string): Promise<StoredBigFiveResult | null> {
    const rows = await this.db.query<ResultRow>(`${RESULT_SELECT} AND r.session_id = ?`, [sessionId]);
    return rows[0] ? toResult(rows[0]) : null;
  }

  /** Big Five results, newest first. */
  async list(filter: { profileIds?: string[] } = {}): Promise<StoredBigFiveResult[]> {
    let sql = RESULT_SELECT;
    const params: string[] = [];
    if (filter.profileIds?.length) {
      sql += ` AND r.profile_id IN (${filter.profileIds.map(() => '?').join(',')})`;
      params.push(...filter.profileIds);
    }
    const rows = await this.db.query<ResultRow>(`${sql} ORDER BY r.created_at DESC, r.id DESC`, params);
    return rows.map(toResult);
  }
}
