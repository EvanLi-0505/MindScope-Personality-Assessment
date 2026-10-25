/**
 * Simulated respondents with KNOWN preferences answer through the real planner
 * and scoring engine. This checks that the engine recovers what was put in.
 * It does NOT validate the real item wording — that needs real people.
 *
 * Answer model per item: r = round(4 + 3·(a_i·key·t_d + ε)), clipped to 1..7,
 * with item loading a_i ∈ [0.55, 0.95] (unknown to the engine) and noise ε ~ N(0, 0.45).
 */
import { describe, expect, it } from 'vitest';
import { DIMENSIONS, FIRST_POLE, SECOND_POLE, mulberry32, nextEntry, scoreMbti, type ModeId, type SequenceEntry } from '../src';
import { makeBank } from './fixtures';

const bank = makeBank();
const rnd = mulberry32(2026);
const loading = new Map(bank.items.map((i) => [i.id, 0.55 + 0.4 * rnd()]));

function gaussian(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function simulate(mode: ModeId, people: number, seed: number) {
  const r = mulberry32(seed);
  let clearTotal = 0;
  let clearCorrect = 0;
  let allTotal = 0;
  let allCorrect = 0;
  for (let p = 0; p < people; p++) {
    const latent = Object.fromEntries(DIMENSIONS.map((d) => [d, r() * 2 - 1])) as Record<string, number>;
    const seq: SequenceEntry[] = [];
    const answers: Record<string, number> = {};
    for (;;) {
      const e = nextEntry(bank, mode, Math.floor(r() * 2 ** 32), seq, answers);
      if (!e) break;
      seq.push(e);
      const item = bank.items.find((i) => i.id === e.itemId)!;
      const t = latent[item.target] ?? 0;
      const raw = 4 + 3 * (loading.get(item.id)! * item.key * t + 0.45 * gaussian(r));
      answers[e.itemId] = Math.min(7, Math.max(1, Math.round(raw)));
    }
    const administered = seq.map((e) => bank.items.find((i) => i.id === e.itemId)!);
    const res = scoreMbti(administered, answers, bank.scoring, 7);
    for (const d of DIMENSIONS) {
      const truth = latent[d]! > 0 ? FIRST_POLE[d] : SECOND_POLE[d];
      const got = res.dimensions[d].pole;
      allTotal++;
      if (got === truth) allCorrect++;
      if (Math.abs(latent[d]!) >= 0.3) {
        clearTotal++;
        if (got === truth) clearCorrect++;
      }
    }
  }
  return { clearAccuracy: clearCorrect / clearTotal, overallAccuracy: allCorrect / allTotal };
}

describe('simulation: engine recovers known preferences', () => {
  const results: Record<string, ReturnType<typeof simulate>> = {};

  it.each(['quick', 'normal', 'senior'] as const)('%s mode', (mode) => {
    results[mode] = simulate(mode, 300, 7 + mode.length);
    const min = { quick: 0.9, normal: 0.95, senior: 0.97 }[mode];
    expect(results[mode]!.clearAccuracy).toBeGreaterThanOrEqual(min);
  });

  it('longer modes are at least as accurate overall', () => {
    console.info('[simulation] letter accuracy', JSON.stringify(results, null, 2));
    expect(results.senior!.overallAccuracy).toBeGreaterThanOrEqual(results.quick!.overallAccuracy - 0.01);
  });
});
