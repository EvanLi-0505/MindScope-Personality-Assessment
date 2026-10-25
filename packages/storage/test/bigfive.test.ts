import { beforeEach, describe, expect, it } from 'vitest';
import { nextEntry, plannedCount, scoreBigFive, scoreMbti, type SequenceEntry } from '@mindscope/core';
import { bigFiveBank, ms16Bank } from '@mindscope/banks';
import { BankIntegrityError, createRepositories, migrate, type Repositories } from '../src';
import { NodeSqliteDriver } from './node-driver';

let db: NodeSqliteDriver;
let repo: Repositories;
let pid: string;

beforeEach(async () => {
  db = new NodeSqliteDriver();
  await migrate(db);
  repo = createRepositories(db);
  await repo.bank.installBuiltin(ms16Bank);
  await repo.bigfive.installBuiltin(bigFiveBank);
  pid = (await repo.profiles.create({ name: '大五测试者' })).id;
});

/** Starts a Big Five session for a form, answers every item with `value(itemId)`, and submits. */
async function takeBigFive(form: 'quick' | 'normal' | 'senior', value: (id: string) => number, submit = true) {
  const versionId = (await repo.bigfive.latestVersionId())!;
  const stored = await repo.bigfive.load(versionId);
  const sequence: SequenceEntry[] = stored.forms[form].entries.map((e) => ({ itemId: e.item, target: e.domain, reason: 'full' }));
  const s = await repo.sessions.create({ profileId: pid, versionId, mode: form, seed: 0, plannedCount: sequence.length, first: sequence[0]!, sequence });
  for (const e of sequence) await repo.sessions.saveAnswer(s.id, e.itemId, value(e.itemId), 800);
  if (!submit) return { sessionId: s.id, id: null };
  const answers = Object.fromEntries(Object.entries(await repo.sessions.answers(s.id)).map(([k, v]) => [k, v.value]));
  const result = scoreBigFive(stored, form, answers);
  const id = await repo.bigfive.complete(s.id, result, { versionId, form, elapsedMs: 5000 });
  return { sessionId: s.id, id, result };
}

describe('Big Five in storage', () => {
  it('installs once, loads an identical copy, refuses a changed copy', async () => {
    expect((await repo.bigfive.installBuiltin(bigFiveBank)).installed).toBe(false);
    const { versionId: _v, contentHash: _h, ...loaded } = await repo.bigfive.load('ipip-b5@0.1.0');
    expect(loaded).toEqual(bigFiveBank);
    const changed = structuredClone(bigFiveBank);
    changed.items[0]!.text['zh-CN'] = '改过的题目';
    await expect(repo.bigfive.installBuiltin(changed)).rejects.toBeInstanceOf(BankIntegrityError);
  });

  it('gives the answering page a bank view of a form', async () => {
    const view = repo.bigfive.asBank(await repo.bigfive.load('ipip-b5@0.1.0'), 'quick');
    expect(view.items).toHaveLength(20);
    expect(view.scales.likert5!.points).toBe(5);
    expect(view.scales.likert5!.labels['zh-CN']).toEqual(['非常不符合', '比较不符合', '不确定', '比较符合', '非常符合']);
  });

  it('saves a result with queryable domain and facet scores', async () => {
    const { id, result } = await takeBigFive('senior', () => 4);
    const got = await repo.bigfive.get(id!);
    expect(got).toMatchObject({ profileName: '大五测试者', form: 'senior' });
    expect(got!.result).toEqual(result);
    const rows = await db.query<{ dimension: string }>('SELECT dimension FROM dimension_scores WHERE result_id = ?', [id]);
    expect(rows).toHaveLength(5 + 30);
    expect(await repo.bigfive.list({ profileIds: [pid] })).toHaveLength(1);
  });

  it('never mixes with 16-type results, and the overview / unfinished list know which is which', async () => {
    // one 16-type quick test
    const versionId = (await repo.bank.latestVersionId('ms16'))!;
    const bank = await repo.bank.load(versionId);
    const seq: SequenceEntry[] = [nextEntry(bank, 'quick', 1, [], {})!];
    const s = await repo.sessions.create({ profileId: pid, versionId, mode: 'quick', seed: 1, plannedCount: plannedCount(bank, 'quick'), first: seq[0]! });
    const answers: Record<string, number> = {};
    for (;;) {
      const e = seq[seq.length - 1]!;
      answers[e.itemId] = 6;
      await repo.sessions.saveAnswer(s.id, e.itemId, 6, 500);
      const n = nextEntry(bank, 'quick', 1, seq, answers);
      if (!n) break;
      await repo.sessions.appendEntry(s.id, n, seq.length);
      seq.push(n);
    }
    const items = seq.map((e) => bank.items.find((i) => i.id === e.itemId)!);
    await repo.sessions.complete(s.id, scoreMbti(items, answers, bank.scoring, 7), {
      mode: 'quick', plannedCount: seq.length, bankVersionId: versionId, bankMaturity: 'experimental', seed: 1, elapsedMs: 1,
    });

    const b5 = await takeBigFive('quick', () => 3);
    expect(await repo.results.list({})).toHaveLength(1); // 16-type only
    expect((await repo.results.latestByProfile()).get(pid)?.count ?? 1).toBe(1);
    expect(await repo.results.get(b5.id!)).toBeNull();
    expect(await repo.bigfive.list({})).toHaveLength(1);
    expect((await repo.stats.overview()).lastResult).toEqual({ id: b5.id, kind: 'bigfive' });

    const open = await takeBigFive('normal', () => 3, false);
    const unfinished = await repo.sessions.listUnfinished(pid);
    expect(unfinished.find((u) => u.id === open.sessionId)).toMatchObject({ kind: 'bigfive', instrument: 'ipip-b5', mode: 'normal' });
  });

  it('refuses to save when too many answers are missing', async () => {
    const versionId = (await repo.bigfive.latestVersionId())!;
    const stored = await repo.bigfive.load(versionId);
    const seq: SequenceEntry[] = stored.forms.quick.entries.map((e) => ({ itemId: e.item, target: e.domain, reason: 'full' }));
    const s = await repo.sessions.create({ profileId: pid, versionId, mode: 'quick', seed: 0, plannedCount: 20, first: seq[0]!, sequence: seq });
    const result = scoreBigFive(stored, 'quick', {});
    await expect(repo.bigfive.complete(s.id, result, { versionId, form: 'quick', elapsedMs: 0 })).rejects.toThrow(/unanswered/);
  });
});
