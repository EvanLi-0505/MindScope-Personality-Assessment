import type { SqlDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations';

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly code: 'checksum_mismatch' | 'db_too_new' | 'apply_failed',
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export interface MigrateOptions {
  migrations?: readonly Migration[];
  /**
   * Called once before pending migrations are applied to a database that
   * already has data (not on a fresh database). The app uses it to make a
   * backup copy. Throwing here aborts the migration.
   */
  beforeApply?: (pending: readonly Migration[], fromVersion: number) => Promise<void>;
  now?: () => string;
}

export interface MigrateResult {
  fromVersion: number;
  toVersion: number;
  applied: number[];
}

/** FNV-1a 32-bit — enough to detect an edited migration, no crypto API needed. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  const normalized = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export async function migrate(db: SqlDriver, options: MigrateOptions = {}): Promise<MigrateResult> {
  const migrations = options.migrations ?? MIGRATIONS;
  const now = options.now ?? (() => new Date().toISOString());

  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       checksum   TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = await db.query<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version',
  );
  const fromVersion = applied.length ? applied[applied.length - 1]!.version : 0;
  const known = new Map(migrations.map((m) => [m.version, m]));
  const latestKnown = migrations.length ? migrations[migrations.length - 1]!.version : 0;

  if (fromVersion > latestKnown) {
    throw new MigrationError(
      `Database schema v${fromVersion} is newer than this app supports (v${latestKnown}). Please use a newer MindScope.`,
      'db_too_new',
    );
  }
  for (const row of applied) {
    const m = known.get(row.version);
    if (m && checksum(m.sql) !== row.checksum) {
      throw new MigrationError(`Migration ${row.version} was modified after it was applied.`, 'checksum_mismatch');
    }
  }

  const pending = migrations.filter((m) => m.version > fromVersion);
  if (!pending.length) return { fromVersion, toVersion: fromVersion, applied: [] };

  if (fromVersion > 0 && options.beforeApply) await options.beforeApply(pending, fromVersion);

  for (const m of pending) {
    try {
      await db.batch([
        { sql: m.sql },
        {
          sql: 'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
          params: [m.version, m.name, checksum(m.sql), now()],
        },
      ]);
    } catch (err) {
      throw new MigrationError(`Failed to apply migration ${m.version} (${m.name}): ${String(err)}`, 'apply_failed');
    }
  }
  return { fromVersion, toVersion: pending[pending.length - 1]!.version, applied: pending.map((m) => m.version) };
}
