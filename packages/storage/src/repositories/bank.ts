import { canonicalJson, nowIso, sha256Hex, type BankFile, type BankItem, type I18nText } from '@mindscope/core';
import type { SqlDriver, Statement } from '../driver';

export class BankIntegrityError extends Error {
  constructor(readonly versionId: string) {
    super(`Item bank ${versionId} changed after it was installed. Published bank versions are immutable — bump the version instead.`);
    this.name = 'BankIntegrityError';
  }
}

/** A bank version as stored in the database (immutable snapshot). */
export interface StoredBank extends BankFile {
  versionId: string;
  contentHash: string;
  installedAt: string;
}

export function bankVersionId(bank: Pick<BankFile, 'instrument' | 'version'>): string {
  return `${bank.instrument}@${bank.version}`;
}

/** Hash of the bank content, independent of key order and of the `$schema` hint. */
export function bankHash(bank: BankFile): string {
  const { $schema: _s, ...content } = bank as BankFile & { $schema?: string };
  return sha256Hex(canonicalJson(content));
}

interface VersionRow {
  id: string;
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
  created_at: string;
}

interface ItemRow {
  item_id: string;
  target: string;
  key: number;
  weight: number;
  scale_id: string;
  text_i18n: string;
  tags_json: string;
  modes_json: string | null;
  enabled: number;
}

export class BankRepository {
  private cache = new Map<string, StoredBank>();

  constructor(private readonly db: SqlDriver) {}

  /**
   * Copies a built-in bank into the database once. Sessions always read the
   * stored copy, so results stay explainable after the app ships a newer bank.
   */
  async installBuiltin(bank: BankFile, kind: 'personality' | 'wellbeing' = 'personality'): Promise<{ versionId: string; installed: boolean }> {
    const versionId = bankVersionId(bank);
    const hash = bankHash(bank);
    const existing = await this.db.query<{ content_hash: string }>('SELECT content_hash FROM instrument_versions WHERE id = ?', [versionId]);
    if (existing.length) {
      if (existing[0]!.content_hash !== hash) throw new BankIntegrityError(versionId);
      return { versionId, installed: false };
    }
    const at = nowIso();
    const statements: Statement[] = [
      {
        sql: 'INSERT OR IGNORE INTO instruments (id, kind, name_i18n, created_at) VALUES (?, ?, ?, ?)',
        params: [bank.instrument, kind, JSON.stringify(bank.title), at],
      },
      {
        sql: `INSERT INTO instrument_versions
              (id, instrument_id, version, status, is_builtin, content_hash, title_i18n, scales_json, scoring_json, modes_json, license, source, created_at, maturity)
              VALUES (?, ?, ?, 'published', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          versionId,
          bank.instrument,
          bank.version,
          hash,
          JSON.stringify(bank.title),
          JSON.stringify(bank.scales),
          JSON.stringify(bank.scoring),
          JSON.stringify(bank.modes),
          bank.license,
          JSON.stringify(bank.source),
          at,
          bank.status === 'published' ? 'published' : 'experimental',
        ],
      },
      ...bank.items.map((item, ordinal) => ({
        sql: `INSERT INTO bank_items (version_id, item_id, ordinal, target, key, weight, scale_id, text_i18n, tags_json, modes_json, enabled)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          versionId,
          item.id,
          ordinal,
          item.target,
          item.key,
          item.weight,
          item.scale,
          JSON.stringify(item.text),
          JSON.stringify(item.tags ?? []),
          item.modes ? JSON.stringify(item.modes) : null,
          item.enabled ? 1 : 0,
        ],
      })),
    ];
    await this.db.batch(statements);
    return { versionId, installed: true };
  }

  /** Newest usable version of an instrument (by install time). */
  async latestVersionId(instrument: string): Promise<string | null> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM instrument_versions WHERE instrument_id = ? AND status = 'published' ORDER BY created_at DESC, id DESC LIMIT 1`,
      [instrument],
    );
    return rows[0]?.id ?? null;
  }

  async load(versionId: string): Promise<StoredBank> {
    const cached = this.cache.get(versionId);
    if (cached) return cached;
    const [v] = await this.db.query<VersionRow>('SELECT * FROM instrument_versions WHERE id = ?', [versionId]);
    if (!v) throw new Error(`Unknown bank version ${versionId}`);
    const rows = await this.db.query<ItemRow>('SELECT * FROM bank_items WHERE version_id = ? ORDER BY ordinal', [versionId]);
    const items: BankItem[] = rows.map((r) => ({
      id: r.item_id,
      target: r.target as BankItem['target'],
      key: r.key === -1 ? -1 : 1,
      weight: r.weight,
      scale: r.scale_id,
      text: JSON.parse(r.text_i18n) as I18nText,
      tags: JSON.parse(r.tags_json) as string[],
      ...(r.modes_json ? { modes: JSON.parse(r.modes_json) as BankItem['modes'] } : {}),
      enabled: r.enabled === 1,
    }));
    const stored: StoredBank = {
      versionId,
      contentHash: v.content_hash,
      installedAt: v.created_at,
      instrument: v.instrument_id,
      version: v.version,
      status: v.maturity === 'published' ? 'published' : 'experimental',
      title: JSON.parse(v.title_i18n),
      license: v.license ?? '',
      source: v.source ? JSON.parse(v.source) : { 'zh-CN': '' },
      scales: JSON.parse(v.scales_json),
      scoring: JSON.parse(v.scoring_json),
      modes: JSON.parse(v.modes_json),
      items,
    };
    this.cache.set(versionId, stored);
    return stored;
  }
}
