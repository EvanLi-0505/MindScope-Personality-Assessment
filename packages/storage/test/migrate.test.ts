import { describe, expect, it, vi } from 'vitest';
import { checksum, LATEST_SCHEMA_VERSION, migrate, MigrationError, MIGRATIONS } from '../src';
import { NodeSqliteDriver } from './node-driver';

const NEXT = LATEST_SCHEMA_VERSION + 1;

describe('migrate', () => {
  it('creates the full schema on a fresh database', async () => {
    const db = new NodeSqliteDriver();
    const r = await migrate(db);
    expect(r).toEqual({ fromVersion: 0, toVersion: LATEST_SCHEMA_VERSION, applied: MIGRATIONS.map((m) => m.version) });
    const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(
      (t) => t.name,
    );
    for (const t of [
      'app_settings',
      'profiles',
      'tags',
      'profile_tags',
      'instruments',
      'instrument_versions',
      'bank_items',
      'test_sessions',
      'answers',
      'results',
      'dimension_scores',
      'function_scores',
      'reports',
      'network_audit',
      'schema_migrations',
    ]) {
      expect(tables).toContain(t);
    }
  });

  it('is idempotent and does not call beforeApply when nothing is pending', async () => {
    const db = new NodeSqliteDriver();
    await migrate(db);
    const beforeApply = vi.fn();
    const r = await migrate(db, { beforeApply });
    expect(r.applied).toEqual([]);
    expect(beforeApply).not.toHaveBeenCalled();
  });

  it('calls beforeApply (backup hook) only for existing databases', async () => {
    const db = new NodeSqliteDriver();
    const beforeApply = vi.fn(async () => {});
    await migrate(db, { beforeApply });
    expect(beforeApply).not.toHaveBeenCalled(); // fresh db: nothing to back up

    const next = [...MIGRATIONS, { version: NEXT, name: 'extra', sql: 'CREATE TABLE extra (x INTEGER);' }];
    await migrate(db, { migrations: next, beforeApply });
    expect(beforeApply).toHaveBeenCalledOnce();
  });

  it('aborts when the backup hook fails, leaving the schema untouched', async () => {
    const db = new NodeSqliteDriver();
    await migrate(db);
    const next = [...MIGRATIONS, { version: NEXT, name: 'extra', sql: 'CREATE TABLE extra (x INTEGER);' }];
    await expect(
      migrate(db, {
        migrations: next,
        beforeApply: async () => {
          throw new Error('disk full');
        },
      }),
    ).rejects.toThrow('disk full');
    const [row] = await db.query<{ v: number }>('SELECT MAX(version) AS v FROM schema_migrations');
    expect(row!.v).toBe(LATEST_SCHEMA_VERSION);
  });

  it('rolls back a failing migration completely', async () => {
    const db = new NodeSqliteDriver();
    await migrate(db);
    const broken = [
      ...MIGRATIONS,
      { version: NEXT, name: 'broken', sql: 'CREATE TABLE half_done (x INTEGER); THIS IS NOT SQL;' },
    ];
    await expect(migrate(db, { migrations: broken })).rejects.toBeInstanceOf(MigrationError);
    const t = await db.query("SELECT name FROM sqlite_master WHERE name = 'half_done'");
    expect(t).toHaveLength(0);
  });

  it('refuses a database created by a newer app version', async () => {
    const db = new NodeSqliteDriver();
    await migrate(db);
    await db.execute("INSERT INTO schema_migrations VALUES (99, 'future', 'x', '2030-01-01')");
    await expect(migrate(db)).rejects.toMatchObject({ code: 'db_too_new' });
  });

  it('detects an edited migration', async () => {
    const db = new NodeSqliteDriver();
    await migrate(db);
    const edited = [{ ...MIGRATIONS[0]!, sql: MIGRATIONS[0]!.sql + '\n-- changed' }, ...MIGRATIONS.slice(1)];
    await expect(migrate(db, { migrations: edited })).rejects.toMatchObject({ code: 'checksum_mismatch' });
  });

  it('checksum ignores CRLF vs LF', () => {
    expect(checksum('a\r\nb')).toBe(checksum('a\nb'));
  });
});
