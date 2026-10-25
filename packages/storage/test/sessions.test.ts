import { beforeEach, describe, expect, it } from 'vitest';
import { nextEntry, plannedCount, scoreMbti, type BankFile, type SequenceEntry } from '@mindscope/core';
import { ms16Bank } from '@mindscope/banks';
import { BankIntegrityError, bankHash, createRepositories, migrate, SessionError, type Repositories } from '../src';
import { NodeSqliteDriver } from './node-driver';

let db: NodeSqliteDriver;
let repo: Repositories;
let versionId: string;

beforeEach(async () => {
  db = new NodeSqliteDriver();
  await migrate(db);
  repo = createRepositories(db);
  versionId = (await repo.bank.installBuiltin(ms16Bank)).versionId;
});

/** Runs a full session through the planner and returns the result id. */
async function completeSession(profileId: string, mode: 'quick' | 'normal' = 'quick', answer = (id: string) => (id.length % 7) + 1) {
  const bank = await repo.bank.load(versionId);
  const seed = 1234;
  const first = nextEntry(bank, mode, seed, [], {})!;
  let s = await repo.sessions.create({ profileId, versionId, mode, seed, plannedCount: plannedCount(bank, mode), first });
  for (;;) {
    const current = s.sequence[s.sequence.length - 1]!;
    await repo.sessions.saveAnswer(s.id, current.itemId, answer(current.itemId), 900);
    const answers = Object.fromEntries(Object.entries(await repo.sessions.answers(s.id)).map(([k, v]) => [k, v.value]));
    const next = nextEntry(bank, mode, seed, s.sequence, answers);
    if (!next) break;
    await repo.sessions.appendEntry(s.id, next, s.sequence.length);
    s = (await repo.sessions.get(s.id))!;
  }
  const answers = Object.fromEntries(Object.entries(await repo.sessions.answers(s.id)).map(([k, v]) => [k, v.value]));
  const items = s.sequence.map((e) => bank.items.find((i) => i.id === e.itemId)!);
  const result = scoreMbti(items, answers, bank.scoring, 7);
  const resultId = await repo.sessions.complete(s.id, result, {
    mode,
    plannedCount: s.plannedCount,
    bankVersionId: versionId,
    bankMaturity: 'experimental',
    seed,
    elapsedMs: 1000,
  });
  return { resultId, session: s, result };
}

describe('bank repository', () => {
  it('installs a built-in bank once and loads an identical copy', async () => {
    expect(versionId).toBe('ms16@0.1.0');
    expect((await repo.bank.installBuiltin(ms16Bank)).installed).toBe(false);
    const stored = await repo.bank.load(versionId);
    expect(stored.items).toHaveLength(216);
    expect(stored.status).toBe('experimental');
    expect(stored.modes).toEqual(ms16Bank.modes);
    expect(stored.items.map((i) => [i.id, i.key, i.text['zh-CN']])).toEqual(ms16Bank.items.map((i) => [i.id, i.key, i.text['zh-CN']]));
    expect(bankHash({ ...stored } as BankFile)).not.toBe(''); // hash is computable from the stored copy
    expect(await repo.bank.latestVersionId('ms16')).toBe(versionId);
  });

  it('refuses a changed bank that keeps the same version number', async () => {
    const tampered = structuredClone(ms16Bank);
    tampered.items[0]!.text['zh-CN'] = '被修改过的题目';
    await expect(repo.bank.installBuiltin(tampered)).rejects.toBeInstanceOf(BankIntegrityError);
  });

  it('keeps old versions readable after a newer bank is installed', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const { resultId } = await completeSession(p.id);
    const v2 = structuredClone(ms16Bank);
    v2.version = '0.2.0';
    v2.items[0]!.text['zh-CN'] = '新版本的第一题';
    await repo.bank.installBuiltin(v2);

    const stored = await repo.results.get(resultId);
    const old = await createRepositories(db).bank.load(stored!.versionId);
    expect(old.items[0]!.text['zh-CN']).toBe(ms16Bank.items[0]!.text['zh-CN']);
  });
});

describe('sessions', () => {
  it('runs a full quick test and stores a complete result', async () => {
    const p = await repo.profiles.create({ name: '测试' });
    const { resultId, session, result } = await completeSession(p.id);
    expect(session.sequence).toHaveLength(40);

    const stored = (await repo.results.get(resultId))!;
    expect(stored.profileId).toBe(p.id);
    expect(stored.typeCode).toBe(result.typeCode);
    expect(stored.result.dimensions.EI.answered).toBe(result.dimensions.EI.answered);
    expect(stored.meta.bankVersionId).toBe('ms16@0.1.0');

    const dims = await db.query('SELECT * FROM dimension_scores WHERE result_id = ?', [resultId]);
    const funcs = await db.query('SELECT * FROM function_scores WHERE result_id = ?', [resultId]);
    expect(dims).toHaveLength(4);
    expect(funcs).toHaveLength(8);

    const s = (await repo.sessions.get(session.id))!;
    expect(s.status).toBe('completed');
    expect(s.completedAt).not.toBeNull();
    expect((await repo.results.latestByProfile()).get(p.id)).toMatchObject({ resultId, count: 1 });
    expect((await repo.stats.overview()).completedTests).toBe(1);
  });

  it('cannot submit the same session twice', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const { session, result } = await completeSession(p.id);
    await expect(
      repo.sessions.complete(session.id, result, { mode: 'quick', plannedCount: 40, bankVersionId: versionId, bankMaturity: 'experimental', seed: 1, elapsedMs: 0 }),
    ).rejects.toBeInstanceOf(SessionError);
  });

  it('counts revisions only when the value changes and adds up time', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const first: SequenceEntry = { itemId: 'EI-001', target: 'EI', reason: 'warmup' };
    const s = await repo.sessions.create({ profileId: p.id, versionId, mode: 'quick', seed: 1, plannedCount: 40, first });
    await repo.sessions.saveAnswer(s.id, 'EI-001', 5, 1000);
    await repo.sessions.saveAnswer(s.id, 'EI-001', 5, 500);
    await repo.sessions.saveAnswer(s.id, 'EI-001', 2, 250);
    expect((await repo.sessions.answers(s.id))['EI-001']).toEqual({ value: 2, timeMs: 1750, revisions: 1 });
  });

  it('rejects an append when the sequence changed elsewhere (two windows)', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const first: SequenceEntry = { itemId: 'EI-001', target: 'EI', reason: 'warmup' };
    const s = await repo.sessions.create({ profileId: p.id, versionId, mode: 'quick', seed: 1, plannedCount: 40, first });
    await repo.sessions.appendEntry(s.id, { itemId: 'SN-001', target: 'SN', reason: 'warmup' }, 1);
    await expect(repo.sessions.appendEntry(s.id, { itemId: 'TF-001', target: 'TF', reason: 'warmup' }, 1)).rejects.toMatchObject({
      code: 'sequence_conflict',
    });
    expect((await repo.sessions.get(s.id))!.sequence.map((e) => e.itemId)).toEqual(['EI-001', 'SN-001']);
  });

  it('restores cursor, flags and elapsed time after a "restart"', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const first: SequenceEntry = { itemId: 'EI-001', target: 'EI', reason: 'warmup' };
    const s = await repo.sessions.create({ profileId: p.id, versionId, mode: 'quick', seed: 1, plannedCount: 40, first });
    await repo.sessions.appendEntry(s.id, { itemId: 'SN-001', target: 'SN', reason: 'warmup' }, 1);
    await repo.sessions.setCursor(s.id, 0);
    await repo.sessions.setFlags(s.id, ['EI-001', 'EI-001']);
    await repo.sessions.addElapsed(s.id, 4200);

    const fresh = await createRepositories(db).sessions.get(s.id);
    expect(fresh).toMatchObject({ cursor: 0, flags: ['EI-001'], elapsedMs: 4200, status: 'in_progress' });
  });

  it('lists unfinished tests with the person name and answered count; abandoned ones disappear', async () => {
    const p = await repo.profiles.create({ name: '小林' });
    const first: SequenceEntry = { itemId: 'EI-001', target: 'EI', reason: 'warmup' };
    const s = await repo.sessions.create({ profileId: p.id, versionId, mode: 'normal', seed: 1, plannedCount: 80, first });
    await repo.sessions.saveAnswer(s.id, 'EI-001', 6, 100);
    expect(await repo.sessions.listUnfinished()).toMatchObject([{ id: s.id, profileName: '小林', answered: 1 }]);
    await repo.sessions.abandon(s.id);
    expect(await repo.sessions.listUnfinished()).toEqual([]);
  });

  it('lists results with filters and reads several in the requested order', async () => {
    const a = await repo.profiles.create({ name: '甲' });
    const b = await repo.profiles.create({ name: '乙' });
    const { resultId: r1 } = await completeSession(a.id, 'quick');
    const { resultId: r2 } = await completeSession(b.id, 'quick');
    const { resultId: r3 } = await completeSession(a.id, 'normal');

    expect((await repo.results.list()).map((r) => r.id)).toEqual([r3, r2, r1]);
    expect((await repo.results.list({ profileIds: [a.id] })).map((r) => r.id)).toEqual([r3, r1]);
    expect((await repo.results.list({ modes: ['normal'] })).map((r) => [r.id, r.profileName])).toEqual([[r3, '甲']]);
    expect(await repo.results.list({ from: '2999-01-01T00:00:00Z' })).toEqual([]);
    expect((await repo.results.getMany([r1, 'missing', r3])).map((r) => r.id)).toEqual([r1, r3]);
  });

  it('deleting one result removes its session and answers but nothing else', async () => {
    const a = await repo.profiles.create({ name: 'A' });
    const { resultId: keep } = await completeSession(a.id);
    const { resultId: drop, session } = await completeSession(a.id);
    expect(await repo.results.remove(drop)).toBe(true);
    expect((await repo.results.listByProfile(a.id)).map((r) => r.id)).toEqual([keep]);
    expect(await repo.sessions.get(session.id)).toBeNull();
    expect(await db.query('SELECT * FROM answers WHERE session_id = ?', [session.id])).toEqual([]);
    expect(await repo.results.remove('missing')).toBe(false);
  });

  it('keeps each person’s tests separate and deletes them with the person', async () => {
    const a = await repo.profiles.create({ name: 'A' });
    const b = await repo.profiles.create({ name: 'B' });
    await completeSession(a.id);
    const { resultId: bResult } = await completeSession(b.id);
    expect(await repo.results.listByProfile(a.id)).toHaveLength(1);
    await repo.profiles.remove(a.id);
    const left = await db.query<{ id: string }>('SELECT id FROM results');
    expect(left.map((r) => r.id)).toEqual([bResult]);
    expect(await db.query('SELECT * FROM answers a JOIN test_sessions s ON s.id = a.session_id WHERE s.profile_id = ?', [a.id])).toEqual([]);
  });
});
