import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  FUNCTIONS,
  fullOrder,
  modeSummary,
  nextEntry,
  plannedCount,
  slotTemplate,
  type ModeId,
  type SequenceEntry,
} from '../src';
import { makeBank } from './fixtures';

const bank = makeBank();
const byId = new Map(bank.items.map((i) => [i.id, i]));

/** Runs a whole session; `answer` decides each response (default: neutral). */
function run(mode: ModeId, seed: number, answer: (id: string) => number = () => 4) {
  const seq: SequenceEntry[] = [];
  const answers: Record<string, number> = {};
  for (;;) {
    const e = nextEntry(bank, mode, seed, seq, answers);
    if (!e) break;
    seq.push(e);
    answers[e.itemId] = answer(e.itemId);
  }
  return { seq, answers };
}

describe('planner', () => {
  it('asks exactly the planned number of distinct questions in every mode', () => {
    for (const mode of ['quick', 'normal', 'senior', 'full'] as const) {
      const { seq } = run(mode, 42);
      expect(seq).toHaveLength(plannedCount(bank, mode));
      expect(new Set(seq.map((e) => e.itemId)).size).toBe(seq.length);
    }
    expect(modeSummary(bank, 'quick')).toMatchObject({ total: 40, dimensionItems: 24, functionItems: 16, adaptive: true });
    expect(modeSummary(bank, 'full')).toMatchObject({ total: 216, adaptive: false });
  });

  it('respects per-dimension min/max and per-function counts', () => {
    const cfg = bank.modes.normal;
    const { seq } = run('normal', 7, (id) => (byId.get(id)!.target === 'EI' ? 7 : 4));
    for (const d of DIMENSIONS) {
      const n = seq.filter((e) => e.target === d).length;
      expect(n).toBeGreaterThanOrEqual(cfg.dimensions!.min);
      expect(n).toBeLessThanOrEqual(cfg.dimensions!.max);
    }
    for (const f of FUNCTIONS) expect(seq.filter((e) => e.target === f)).toHaveLength(cfg.functions!.per);
  });

  it('keeps +1 and −1 items balanced within each dimension', () => {
    const { seq } = run('senior', 3);
    for (const d of DIMENSIONS) {
      const keys = seq.filter((e) => e.target === d).map((e) => byId.get(e.itemId)!.key);
      const plus = keys.filter((k) => k === 1).length;
      expect(Math.abs(plus - (keys.length - plus))).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same seed and answers, and differs across seeds', () => {
    const a = run('normal', 99).seq.map((e) => e.itemId);
    const b = run('normal', 99).seq.map((e) => e.itemId);
    const c = run('normal', 100).seq.map((e) => e.itemId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('resuming from a stored sequence gives the same next question', () => {
    const { seq, answers } = run('normal', 5, (id) => (id.charCodeAt(id.length - 1) % 7) + 1);
    const cut = 30;
    const resumed = nextEntry(bank, 'normal', 5, seq.slice(0, cut), answers);
    expect(resumed).toEqual(seq[cut]);
  });

  it('spends adaptive questions on the least certain dimension', () => {
    // EI, SN, TF answered consistently (clear); JP answered erratically (uncertain).
    let flip = false;
    const { seq } = run('normal', 11, (id) => {
      const it = byId.get(id)!;
      if (it.target === 'JP') {
        flip = !flip;
        return flip ? 7 : 1;
      }
      return it.key === 1 ? 7 : 1;
    });
    const adaptive = seq.filter((e) => e.reason === 'adaptive');
    expect(adaptive.length).toBe(48 - 4 * 9);
    const jp = adaptive.filter((e) => e.target === 'JP').length;
    expect(jp).toBe(bank.modes.normal.dimensions!.max - bank.modes.normal.dimensions!.min); // JP filled up to its max
  });

  it('full mode covers every item and rarely repeats a target back to back', () => {
    const order = fullOrder(bank, 'full', 1);
    expect(order).toHaveLength(bank.items.length);
    let repeats = 0;
    for (let i = 1; i < order.length; i++) if (order[i]!.target === order[i - 1]!.target) repeats++;
    expect(repeats).toBeLessThan(order.length * 0.15);
  });

  it('spreads function slots evenly and starts with a dimension item', () => {
    const t = slotTemplate(40, 16);
    expect(t.filter((s) => s === 'func')).toHaveLength(16);
    expect(t[0]).toBe('dim');
  });
});
