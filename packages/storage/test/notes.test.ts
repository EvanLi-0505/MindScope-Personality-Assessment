import { beforeEach, describe, expect, it } from 'vitest';
import { createRepositories, migrate, type Repositories } from '../src';
import { NodeSqliteDriver } from './node-driver';

let db: NodeSqliteDriver;
let repo: Repositories;
let pid: string;

beforeEach(async () => {
  db = new NodeSqliteDriver();
  await migrate(db);
  repo = createRepositories(db);
  pid = (await repo.profiles.create({ name: '测试者' })).id;
});

describe('growth notes', () => {
  it('adds, lists newest date first, updates and removes', async () => {
    await repo.growth.add(pid, '2026-03-01', '  开始每天跑步  ');
    const b = await repo.growth.add(pid, '2026-05-10', '换了新工作');
    expect((await repo.growth.list(pid)).map((n) => n.text)).toEqual(['换了新工作', '开始每天跑步']);
    await repo.growth.update(b.id, '2026-01-01', '换了新工作，有点紧张');
    expect((await repo.growth.list(pid))[1]!.text).toBe('换了新工作，有点紧张');
    expect(await repo.growth.remove(b.id)).toBe(true);
    expect(await repo.growth.list(pid)).toHaveLength(1);
  });

  it('rejects empty text, bad dates and overlong text', async () => {
    await expect(repo.growth.add(pid, '2026-03-01', '   ')).rejects.toThrow('EMPTY_TEXT');
    await expect(repo.growth.add(pid, '2026/03/01', 'x')).rejects.toThrow('INVALID_DATE');
    await expect(repo.growth.add(pid, '2026-03-01', 'x'.repeat(2001))).rejects.toThrow('TEXT_TOO_LONG');
  });

  it('is deleted together with the person card', async () => {
    await repo.growth.add(pid, '2026-03-01', 'note');
    await repo.aiNotes.add({ profileId: pid, task: 'growth', model: 'm', promptVersion: 'ai-prompt@1', categories: ['growth'], basis: { lines: [] }, safety: false, content: 'x' });
    await repo.profiles.remove(pid);
    expect(await repo.growth.list(pid)).toHaveLength(0);
    expect(await repo.aiNotes.list(pid)).toHaveLength(0);
  });
});

describe('AI notes', () => {
  it('stores what was sent and the app-made basis', async () => {
    const n = await repo.aiNotes.add({
      profileId: pid,
      task: 'history',
      model: 'qwen-plus',
      promptVersion: 'ai-prompt@1',
      categories: ['personality', 'wellbeing'],
      basis: { lines: ['3 次人格测评'] },
      safety: true,
      content: '## 总结',
    });
    const got = await repo.aiNotes.get(n.id);
    expect(got).toMatchObject({ task: 'history', categories: ['personality', 'wellbeing'], basis: { lines: ['3 次人格测评'] }, safety: true });
    expect(await repo.aiNotes.remove(n.id)).toBe(true);
    expect(await repo.aiNotes.get(n.id)).toBeNull();
  });
});

describe('network record', () => {
  it('starts empty and sums usage', async () => {
    expect(await repo.network.usage()).toEqual({ requests: 0, ok: 0, tokens: 0, lastAt: null, lastOutcome: null });
    await repo.network.record({ endpoint: 'https://a/v1/chat/completions', purpose: 'test', categories: [], bytes: 10, outcome: 'ok', model: 'm', tokens: 5 });
    await repo.network.record({ endpoint: 'https://a/v1/chat/completions', purpose: 'history', categories: ['personality'], bytes: 900, outcome: 'invalid_key (401)', model: 'm', tokens: 0 });
    const u = await repo.network.usage();
    expect(u).toMatchObject({ requests: 2, ok: 1, tokens: 5, lastOutcome: 'invalid_key (401)' });
    expect((await repo.network.list())[0]!.categories).toEqual(['personality']);
  });
});

describe('overview', () => {
  it('has no last result on an empty database', async () => {
    expect((await repo.stats.overview()).lastResult).toBeNull();
  });
});
