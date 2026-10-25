import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, migrate, ValidationError, type Repositories } from '../src';
import { NodeSqliteDriver } from './node-driver';

let db: NodeSqliteDriver;
let repo: Repositories;

beforeEach(async () => {
  db = new NodeSqliteDriver();
  await migrate(db);
  repo = createRepositories(db);
});

/** Inserts the minimum rows needed for a session + result owned by `profileId`. */
async function addResult(profileId: string, suffix: string) {
  await db.execute(
    "INSERT OR IGNORE INTO instruments VALUES ('ms16', 'personality', '{}', '2026-01-01')",
  );
  await db.execute(
    `INSERT OR IGNORE INTO instrument_versions
     (id, instrument_id, version, status, is_builtin, content_hash, title_i18n, scales_json, scoring_json, modes_json, created_at)
     VALUES ('ms16@0.1.0', 'ms16', '0.1.0', 'published', 1, 'h', '{}', '{}', '{}', '{}', '2026-01-01')`,
  );
  await db.execute(
    `INSERT INTO test_sessions (id, profile_id, version_id, mode, status, seed, planned_count, started_at, updated_at)
     VALUES (?, ?, 'ms16@0.1.0', 'quick', 'completed', 1, 40, '2026-01-01', '2026-01-01')`,
    [`s-${suffix}`, profileId],
  );
  await db.execute(
    `INSERT INTO results (id, session_id, profile_id, version_id, mode, type_code, engine_version, summary_json, created_at)
     VALUES (?, ?, ?, 'ms16@0.1.0', 'quick', 'INFJ', '1', '{}', '2026-01-02')`,
    [`r-${suffix}`, `s-${suffix}`, profileId],
  );
}

describe('profiles', () => {
  it('creates a profile with only a name and reads it back', async () => {
    const p = await repo.profiles.create({ name: '  小明  ' });
    expect(p.name).toBe('小明');
    expect(p.avatar.kind).toBe('preset');
    expect(p.birthYear).toBeNull();
    expect(await repo.profiles.count()).toBe(1);
  });

  it('rejects an empty name and out-of-range birth year', async () => {
    await expect(repo.profiles.create({ name: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(repo.profiles.create({ name: 'A', birthYear: 1800 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores empty optional strings as NULL', async () => {
    const p = await repo.profiles.create({ name: 'A', occupation: '  ', note: '' });
    expect(p.occupation).toBeNull();
    expect(p.note).toBeNull();
  });

  it('assigns, replaces and filters by tags (AND semantics)', async () => {
    const family = await repo.tags.create('家人', '#E0708A');
    const friend = await repo.tags.create('朋友', '#4F7BE0');
    const a = await repo.profiles.create({ name: 'A' }, [family.id, friend.id]);
    await repo.profiles.create({ name: 'B' }, [friend.id]);
    await repo.profiles.create({ name: 'C' });

    expect((await repo.profiles.list({ tagIds: [friend.id] })).map((p) => p.name).sort()).toEqual(['A', 'B']);
    expect((await repo.profiles.list({ tagIds: [friend.id, family.id] })).map((p) => p.name)).toEqual(['A']);

    await repo.profiles.update(a.id, { name: 'A' }, [family.id]);
    expect((await repo.profiles.get(a.id))!.tags.map((t) => t.name)).toEqual(['家人']);

    const tags = await repo.tags.list();
    expect(tags.find((t) => t.id === friend.id)!.profileCount).toBe(1);
  });

  it('treats tag names case-insensitively and returns the existing tag', async () => {
    const t1 = await repo.tags.create('Work', '#000');
    const t2 = await repo.tags.create('work', '#fff');
    expect(t2.id).toBe(t1.id);
  });

  it('deleting a tag keeps the profiles', async () => {
    const t = await repo.tags.create('临时', '#000');
    const p = await repo.profiles.create({ name: 'A' }, [t.id]);
    await repo.tags.remove(t.id);
    expect((await repo.profiles.get(p.id))!.tags).toEqual([]);
  });

  it('search matches name or note and treats % and _ literally', async () => {
    await repo.profiles.create({ name: 'Alice', note: '同事' });
    await repo.profiles.create({ name: '100% sure' });
    await repo.profiles.create({ name: 'Bob' });
    expect((await repo.profiles.list({ search: '同事' })).map((p) => p.name)).toEqual(['Alice']);
    expect((await repo.profiles.list({ search: '%' })).map((p) => p.name)).toEqual(['100% sure']);
    expect(await repo.profiles.list({ search: '_' })).toHaveLength(0);
  });

  it('keeps data isolated per profile and cascades on delete', async () => {
    const a = await repo.profiles.create({ name: 'A' });
    const b = await repo.profiles.create({ name: 'B' });
    await addResult(a.id, 'a1');
    await addResult(a.id, 'a2');
    await addResult(b.id, 'b1');

    await repo.profiles.remove(a.id);

    const remaining = await db.query<{ profile_id: string }>('SELECT profile_id FROM results');
    expect(remaining.map((r) => r.profile_id)).toEqual([b.id]);
    const sessions = await db.query('SELECT id FROM test_sessions');
    expect(sessions).toHaveLength(1);
    expect((await repo.stats.overview()).completedTests).toBe(1);
  });

  it('a failing batch leaves no partial profile behind', async () => {
    await expect(repo.profiles.create({ name: 'X' }, ['no-such-tag'])).rejects.toThrow();
    expect(await repo.profiles.count()).toBe(0);
  });
});

describe('settings', () => {
  it('round-trips JSON values and falls back to defaults', async () => {
    expect(await repo.settings.get('theme', 'system')).toBe('system');
    await repo.settings.set('theme', 'dark');
    await repo.settings.set('theme', 'light');
    expect(await repo.settings.get('theme', 'system')).toBe('light');
    await repo.settings.set('obj', { a: [1, 2] });
    expect(await repo.settings.get('obj', null)).toEqual({ a: [1, 2] });
  });
});
