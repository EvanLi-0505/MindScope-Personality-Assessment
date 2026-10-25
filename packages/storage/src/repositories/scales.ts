/**
 * Wellbeing scales (PHQ-9, GAD-7, WHO-5, …) and their results. They share the
 * session/result tables with the 16-type test but are always queried by
 * instrument kind, so personality and wellbeing data never mix in a view.
 */
import { canonicalJson, nowIso, sha256Hex, uuidv7, type I18nText, type ScaleFile, type ScaleResult } from '@mindscope/core';
import type { SqlDriver, Statement } from '../driver';
import { BankIntegrityError } from './bank';

export interface StoredScale extends ScaleFile {
  versionId: string;
  contentHash: string;
}

export interface ScaleResultMeta {
  instrument: string;
  versionId: string;
  elapsedMs: number;
}

export interface StoredScaleResult {
  id: string;
  sessionId: string;
  profileId: string;
  profileName: string;
  versionId: string;
  instrument: string;
  result: ScaleResult;
  meta: ScaleResultMeta;
  createdAt: string;
}

type ScaleMeta = Pick<ScaleFile, 'shortName' | 'description' | 'instructions' | 'licenseNote' | 'citation' | 'translationNote'> & {
  kind: 'wellbeing';
};

export function scaleVersionId(scale: Pick<ScaleFile, 'instrument' | 'version'>): string {
  return `${scale.instrument}@${scale.version}`;
}

export function scaleHash(scale: ScaleFile): string {
  return sha256Hex(canonicalJson(scale));
}

interface ResultRow {
  id: string;
  session_id: string;
  profile_id: string;
  profile_name: string;
  version_id: string;
  instrument_id: string;
  summary_json: string;
  created_at: string;
}

function toResult(r: ResultRow): StoredScaleResult {
  const s = JSON.parse(r.summary_json) as { result: ScaleResult; meta: ScaleResultMeta };
  return {
    id: r.id,
    sessionId: r.session_id,
    profileId: r.profile_id,
    profileName: r.profile_name,
    versionId: r.version_id,
    instrument: r.instrument_id,
    result: s.result,
    meta: s.meta,
    createdAt: r.created_at,
  };
}

const RESULT_SELECT = `
  SELECT r.id, r.session_id, r.profile_id, p.name AS profile_name, r.version_id, v.instrument_id, r.summary_json, r.created_at
  FROM results r
  JOIN profiles p ON p.id = r.profile_id
  JOIN instrument_versions v ON v.id = r.version_id
  JOIN instruments i ON i.id = v.instrument_id
  WHERE i.kind = 'wellbeing'`;

export class ScalesRepository {
  private cache = new Map<string, StoredScale>();

  constructor(private readonly db: SqlDriver) {}

  /** Copies a built-in scale into the database once; a changed scale with the same version is refused. */
  async installBuiltin(scale: ScaleFile): Promise<{ versionId: string; installed: boolean }> {
    const versionId = scaleVersionId(scale);
    const hash = scaleHash(scale);
    const existing = await this.db.query<{ content_hash: string }>('SELECT content_hash FROM instrument_versions WHERE id = ?', [versionId]);
    if (existing.length) {
      if (existing[0]!.content_hash !== hash) throw new BankIntegrityError(versionId);
      return { versionId, installed: false };
    }
    const at = nowIso();
    const meta: ScaleMeta = {
      kind: 'wellbeing',
      shortName: scale.shortName,
      description: scale.description,
      instructions: scale.instructions,
      licenseNote: scale.licenseNote,
      citation: scale.citation,
      ...(scale.translationNote ? { translationNote: scale.translationNote } : {}),
    };
    const statements: Statement[] = [
      {
        sql: 'INSERT OR IGNORE INTO instruments (id, kind, name_i18n, created_at) VALUES (?, ?, ?, ?)',
        params: [scale.instrument, 'wellbeing', JSON.stringify(scale.title), at],
      },
      {
        sql: `INSERT INTO instrument_versions
              (id, instrument_id, version, status, is_builtin, content_hash, title_i18n, scales_json, scoring_json, modes_json, license, source, created_at, maturity, meta_json)
              VALUES (?, ?, ?, 'published', 1, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)`,
        params: [
          versionId,
          scale.instrument,
          scale.version,
          hash,
          JSON.stringify(scale.title),
          JSON.stringify({ options: scale.options }),
          JSON.stringify(scale.scoring),
          scale.license,
          JSON.stringify(scale.source),
          at,
          scale.status,
          JSON.stringify(meta),
        ],
      },
      ...scale.items.map((item, ordinal) => ({
        sql: `INSERT INTO bank_items (version_id, item_id, ordinal, target, key, weight, scale_id, text_i18n, tags_json, modes_json, enabled)
              VALUES (?, ?, ?, 'total', ?, 1, 'main', ?, '[]', NULL, 1)`,
        params: [versionId, item.id, ordinal, item.reverse ? -1 : 1, JSON.stringify(item.text)],
      })),
    ];
    await this.db.batch(statements);
    return { versionId, installed: true };
  }

  /** Newest installed version of each wellbeing instrument. */
  async latestVersions(): Promise<{ instrument: string; versionId: string }[]> {
    const rows = await this.db.query<{ instrument_id: string; id: string }>(
      `SELECT v.instrument_id, v.id FROM instrument_versions v JOIN instruments i ON i.id = v.instrument_id
       WHERE i.kind = 'wellbeing' AND v.status = 'published'
         AND v.created_at = (SELECT MAX(v2.created_at) FROM instrument_versions v2 WHERE v2.instrument_id = v.instrument_id)
       ORDER BY v.created_at, v.id`,
    );
    return rows.map((r) => ({ instrument: r.instrument_id, versionId: r.id }));
  }

  async load(versionId: string): Promise<StoredScale> {
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
      license: string | null;
      source: string | null;
      meta_json: string;
    }>('SELECT * FROM instrument_versions WHERE id = ?', [versionId]);
    if (!v) throw new Error(`Unknown scale version ${versionId}`);
    const items = await this.db.query<{ item_id: string; key: number; text_i18n: string }>(
      'SELECT item_id, key, text_i18n FROM bank_items WHERE version_id = ? ORDER BY ordinal',
      [versionId],
    );
    const meta = JSON.parse(v.meta_json) as ScaleMeta;
    const stored: StoredScale = {
      versionId,
      contentHash: v.content_hash,
      kind: 'wellbeing',
      instrument: v.instrument_id,
      version: v.version,
      status: v.maturity === 'experimental' ? 'experimental' : 'published',
      shortName: meta.shortName,
      title: JSON.parse(v.title_i18n) as I18nText,
      description: meta.description,
      instructions: meta.instructions,
      license: v.license ?? '',
      licenseNote: meta.licenseNote,
      source: v.source ? (JSON.parse(v.source) as I18nText) : { 'zh-CN': '' },
      citation: meta.citation,
      ...(meta.translationNote ? { translationNote: meta.translationNote } : {}),
      options: (JSON.parse(v.scales_json) as { options: ScaleFile['options'] }).options,
      items: items.map((i) => ({ id: i.item_id, text: JSON.parse(i.text_i18n) as I18nText, ...(i.key === -1 ? { reverse: true } : {}) })),
      scoring: JSON.parse(v.scoring_json),
    };
    this.cache.set(versionId, stored);
    return stored;
  }

  /** Writes a wellbeing result and closes the session in one transaction. */
  async complete(sessionId: string, result: ScaleResult, meta: ScaleResultMeta): Promise<string> {
    const [s] = await this.db.query<{ profile_id: string; status: string; version_id: string }>(
      'SELECT profile_id, status, version_id FROM test_sessions WHERE id = ?',
      [sessionId],
    );
    if (!s) throw new Error(`Session ${sessionId} not found`);
    if (s.status !== 'in_progress') throw new Error('This check-in has already been submitted.');
    if (result.score === null) throw new Error('Every question needs an answer before submitting.');
    const id = uuidv7();
    const at = nowIso();
    await this.db.batch([
      {
        sql: `INSERT INTO results (id, session_id, profile_id, version_id, mode, type_code, engine_version, summary_json, created_at)
              VALUES (?, ?, ?, ?, 'standard', NULL, ?, ?, ?)`,
        params: [id, sessionId, s.profile_id, s.version_id, `${result.engine}/${result.engineVersion}`, JSON.stringify({ result, meta }), at],
      },
      {
        sql: 'INSERT INTO dimension_scores (result_id, dimension, score, se, n, pole, band) VALUES (?, ?, ?, NULL, ?, NULL, ?)',
        params: [id, 'total', result.score, result.answered, result.band?.key ?? null],
      },
      {
        sql: "UPDATE test_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'",
        params: [at, at, sessionId],
      },
    ]);
    return id;
  }

  async get(id: string): Promise<StoredScaleResult | null> {
    const rows = await this.db.query<ResultRow>(`${RESULT_SELECT} AND r.id = ?`, [id]);
    return rows[0] ? toResult(rows[0]) : null;
  }

  /** Wellbeing results, newest first. */
  async list(filter: { profileIds?: string[]; instruments?: string[] } = {}): Promise<StoredScaleResult[]> {
    let sql = RESULT_SELECT;
    const params: string[] = [];
    if (filter.profileIds?.length) {
      sql += ` AND r.profile_id IN (${filter.profileIds.map(() => '?').join(',')})`;
      params.push(...filter.profileIds);
    }
    if (filter.instruments?.length) {
      sql += ` AND v.instrument_id IN (${filter.instruments.map(() => '?').join(',')})`;
      params.push(...filter.instruments);
    }
    const rows = await this.db.query<ResultRow>(`${sql} ORDER BY r.created_at DESC, r.id DESC`, params);
    return rows.map(toResult);
  }
}
