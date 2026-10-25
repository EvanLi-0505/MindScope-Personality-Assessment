import { beforeEach, describe, expect, it } from 'vitest';
import { scoreScale, type SequenceEntry } from '@mindscope/core';
import { WELLBEING_SCALES, ms16Bank } from '@mindscope/banks';
import { BankIntegrityError, createRepositories, migrate, type Repositories } from '../src';
import { NodeSqliteDriver } from './node-driver';

let db: NodeSqliteDriver;
let repo: Repositories;

beforeEach(async () => {
  db = new NodeSqliteDriver();
  await migrate(db);
  repo = createRepositories(db);
  await repo.bank.installBuiltin(ms16Bank);
  for (const s of WELLBEING_SCALES) await repo.scales.installBuiltin(s);
});

const phq9 = WELLBEING_SCALES.find((s) => s.instrument === 'phq9')!;

/** Fills a whole check-in with `value` for every item and submits it. */
async function checkIn(profileId: string, instrument: string, value: (id: string) => number) {
  const versionId = (await repo.scales.latestVersions()).find((v) => v.instrument === instrument)!.versionId;
  const scale = await repo.scales.load(versionId);
  const sequence: SequenceEntry[] = scale.items.map((i) => ({ itemId: i.id, target: 'total', reason: 'full' }));
  const s = await repo.sessions.create({ profileId, versionId, mode: 'standard' as never, seed: 0, plannedCount: scale.items.length, first: sequence[0]!, sequence });
  for (const item of scale.items) await repo.sessions.saveAnswer(s.id, item.id, value(item.id), 1000);
  const answers = Object.fromEntries(Object.entries(await repo.sessions.answers(s.id)).map(([k, v]) => [k, v.value]));
  const result = scoreScale(scale, answers);
  const id = await repo.scales.complete(s.id, result, { instrument, versionId, elapsedMs: 9000 });
  return { id, result, sessionId: s.id };
}

describe('wellbeing scales in storage', () => {
  it('installs every scale once and loads an identical copy', async () => {
    for (const s of WELLBEING_SCALES) expect((await repo.scales.installBuiltin(s)).installed).toBe(false);
    expect((await repo.scales.latestVersions()).map((v) => v.versionId).sort()).toEqual(
      ['gad7@1.0.0', 'ms-stress@0.1.0', 'phq9@1.0.0', 'who5@1.0.0'],
    );
    for (const s of WELLBEING_SCALES) {
      const { versionId: _v, contentHash: _h, ...loaded } = await repo.scales.load(`${s.instrument}@${s.version}`);
      expect(loaded).toEqual(s);
    }
  });

  it('refuses a changed scale that keeps its version number', async () => {
    const tampered = structuredClone(phq9);
    tampered.scoring.bands[0]!.max = 3;
    await expect(repo.scales.installBuiltin(tampered)).rejects.toBeInstanceOf(BankIntegrityError);
  });

  it('stores a completed check-in with its band and safety flag', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const { id, result } = await checkIn(p.id, 'phq9', (item) => (item === 'PHQ9-09' ? 1 : 2));
    expect(result.score).toBe(17);
    const stored = (await repo.scales.get(id))!;
    expect(stored.instrument).toBe('phq9');
    expect(stored.result.band?.key).toBe('moderately_severe');
    expect(stored.result.safetyItems).toEqual(['PHQ9-09']);
    expect(stored.profileName).toBe('A');
    const [dim] = await db.query<{ dimension: string; score: number; band: string }>('SELECT * FROM dimension_scores WHERE result_id = ?', [id]);
    expect(dim).toMatchObject({ dimension: 'total', score: 17, band: 'moderately_severe' });
  });

  it('refuses to submit an incomplete check-in', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const versionId = 'gad7@1.0.0';
    const first: SequenceEntry = { itemId: 'GAD7-01', target: 'total', reason: 'full' };
    const s = await repo.sessions.create({ profileId: p.id, versionId, mode: 'standard' as never, seed: 0, plannedCount: 7, first });
    const partial = scoreScale(await repo.scales.load(versionId), { 'GAD7-01': 1 });
    await expect(repo.scales.complete(s.id, partial, { instrument: 'gad7', versionId, elapsedMs: 0 })).rejects.toThrow();
  });

  it('filters by person and instrument, newest first', async () => {
    const a = await repo.profiles.create({ name: 'A' });
    const b = await repo.profiles.create({ name: 'B' });
    const r1 = await checkIn(a.id, 'who5', () => 3);
    const r2 = await checkIn(a.id, 'gad7', () => 1);
    const r3 = await checkIn(b.id, 'who5', () => 5);
    expect((await repo.scales.list()).map((r) => r.id)).toEqual([r3.id, r2.id, r1.id]);
    expect((await repo.scales.list({ profileIds: [a.id] })).map((r) => r.id)).toEqual([r2.id, r1.id]);
    expect((await repo.scales.list({ instruments: ['who5'] })).map((r) => r.result.score)).toEqual([100, 60]);
  });

  it('personality views never see wellbeing results, and vice versa', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const { id } = await checkIn(p.id, 'gad7', () => 0);
    expect(await repo.results.list()).toEqual([]);
    expect(await repo.results.get(id)).toBeNull();
    expect(await repo.results.listByProfile(p.id)).toEqual([]);
    expect((await repo.results.latestByProfile()).size).toBe(0);
    expect(await repo.results.getMany([id])).toEqual([]);
  });

  it('unfinished sessions report their kind so the UI opens the right page', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const first: SequenceEntry = { itemId: 'WHO5-01', target: 'total', reason: 'full' };
    await repo.sessions.create({ profileId: p.id, versionId: 'who5@1.0.0', mode: 'standard' as never, seed: 0, plannedCount: 5, first });
    expect(await repo.sessions.listUnfinished()).toMatchObject([{ instrument: 'who5', kind: 'wellbeing' }]);
  });

  it('deleting a check-in result removes its session too', async () => {
    const p = await repo.profiles.create({ name: 'A' });
    const { id, sessionId } = await checkIn(p.id, 'who5', () => 2);
    expect(await repo.results.remove(id)).toBe(true);
    expect(await repo.scales.get(id)).toBeNull();
    expect(await repo.sessions.get(sessionId)).toBeNull();
  });
});
