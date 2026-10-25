import { describe, expect, it } from 'vitest';
import { bandOf, centre, expandAlternatives, scoreMbti, theoreticalStack, weightedStats, type BankItem } from '../src';
import { makeBank } from './fixtures';

const bank = makeBank();
const cfg = bank.scoring;
/** First n items of a target, alternating reverse/forward keyed so keying is balanced. */
const items = (target: string, n = 10) => {
  const all = bank.items.filter((i) => i.target === target);
  const rev = all.filter((i) => i.key === -1);
  const fwd = all.filter((i) => i.key === 1);
  const out: BankItem[] = [];
  for (let k = 0; out.length < all.length; k++) {
    if (rev[k]) out.push(rev[k]!);
    if (fwd[k]) out.push(fwd[k]!);
  }
  return out.slice(0, n);
};

/** Answer every item so that the stated pole/strength comes out. */
function answerAll(list: BankItem[], agreeWithFirstPole: number) {
  // agreeWithFirstPole: centred x in [-1,1] for +1 items; reverse items get the mirror.
  const a: Record<string, number> = {};
  for (const i of list) a[i.id] = Math.round(4 + 3 * agreeWithFirstPole * i.key);
  return a;
}

const allDims = () => ['EI', 'SN', 'TF', 'JP'].flatMap((d) => items(d));

describe('helpers', () => {
  it('centres 7-point answers and rejects invalid ones', () => {
    expect(centre(1, 7)).toBe(-1);
    expect(centre(4, 7)).toBe(0);
    expect(centre(7, 7)).toBe(1);
    for (const bad of [0, 8, 2.5, null, undefined]) expect(centre(bad as number, 7)).toBeNull();
  });

  it('computes weighted mean and SE', () => {
    expect(weightedStats([])).toBeNull();
    const one = weightedStats([{ v: 0.5, w: 1 }])!;
    expect(one.mean).toBe(0.5);
    expect(one.se).toBe(1); // a single answer gives no precision
    const s = weightedStats([
      { v: 1, w: 1 },
      { v: 0, w: 1 },
    ])!;
    expect(s.mean).toBe(0.5);
    expect(s.se).toBeCloseTo(0.5, 10); // sqrt(0.25 / (2-1))
  });

  it('bands follow the configured edges', () => {
    expect(bandOf(0.1, [0.1, 0.3, 0.6])).toBe('balanced');
    expect(bandOf(0.1001, [0.1, 0.3, 0.6])).toBe('slight');
    expect(bandOf(0.3, [0.1, 0.3, 0.6])).toBe('moderate');
    expect(bandOf(0.6, [0.1, 0.3, 0.6])).toBe('clear');
  });

  it('expands X letters', () => {
    expect(expandAlternatives('INXJ')).toEqual(['INTJ', 'INFJ']);
    expect(expandAlternatives('XNXJ')).toHaveLength(4);
    expect(expandAlternatives('INTJ')).toEqual([]);
  });
});

describe('scoreMbti — four dimensions', () => {
  it('fully agreeing with E items (and disagreeing with reverse ones) gives E 100%', () => {
    const list = items('EI');
    const r = scoreMbti(list, answerAll(list, 1), cfg, 7);
    expect(r.dimensions.EI.score).toBe(1);
    expect(r.dimensions.EI.percentFirst).toBe(100);
    expect(r.dimensions.EI.pole).toBe('E');
    expect(r.dimensions.EI.band).toBe('clear');
  });

  it('reverse-keyed items flip direction', () => {
    const reverse = items('EI', 30).filter((i) => i.key === -1).slice(0, 5);
    const agreeAll = Object.fromEntries(reverse.map((i) => [i.id, 7]));
    const r = scoreMbti(reverse, agreeAll, cfg, 7);
    expect(r.dimensions.EI.score).toBe(-1);
    expect(r.dimensions.EI.pole).toBe('I');
  });

  it('all-neutral answers are balanced and show X', () => {
    const list = allDims();
    const r = scoreMbti(list, Object.fromEntries(list.map((i) => [i.id, 4])), cfg, 7);
    expect(r.typeCode).toBe('XXXX');
    expect(r.dimensions.SN.band).toBe('balanced');
    expect(r.alternatives).toHaveLength(4);
  });

  it('builds the type code from all four dimensions', () => {
    const a = {
      ...answerAll(items('EI'), -0.67), // I
      ...answerAll(items('SN'), -1), // N
      ...answerAll(items('TF'), 0.34), // T (moderate)
      ...answerAll(items('JP'), 1), // J
    };
    const r = scoreMbti(allDims(), a, cfg, 7);
    expect(r.typeCode).toBe('INTJ');
    expect(r.alternatives).toEqual([]);
  });

  it('acquiescence (agreeing with everything) cancels out on balanced keying', () => {
    const list = allDims();
    const r = scoreMbti(list, Object.fromEntries(list.map((i) => [i.id, 7])), cfg, 7);
    for (const d of ['EI', 'SN', 'TF', 'JP'] as const) expect(r.dimensions[d].score).toBeCloseTo(0, 10);
  });

  it('leaves unanswered items out instead of treating them as neutral', () => {
    const list = items('EI', 10);
    const a: Record<string, number | null> = answerAll(list, 1);
    a[list[0]!.id] = null; // 9 of 10 answered = 90% ≥ 80%
    const r = scoreMbti(list, a, cfg, 7);
    expect(r.dimensions.EI.answered).toBe(9);
    expect(r.dimensions.EI.score).toBe(1);
  });

  it('marks a dimension insufficient below the answered ratio and uses ?', () => {
    const list = items('EI', 10);
    const a: Record<string, number> = {};
    list.slice(0, 7).forEach((i) => (a[i.id] = 7)); // 70% < 80%
    const r = scoreMbti(list, a, cfg, 7);
    expect(r.dimensions.EI.band).toBe('insufficient');
    expect(r.dimensions.EI.score).toBeNull();
    expect(r.typeCode[0]).toBe('?');
    expect(r.alternatives).toEqual([]);
  });

  it('flags a weak, noisy dimension as unstable', () => {
    const list = items('TF', 10);
    // Mixed answers with a small positive mean.
    const values = [7, 1, 7, 3, 7, 2, 7, 1, 6, 3]; // centred mean ≈ +0.13, large spread
    const a = Object.fromEntries(list.map((i, k) => [i.id, i.key === 1 ? values[k]! : 8 - values[k]!]));
    const r = scoreMbti(list, a, cfg, 7);
    expect(r.dimensions.TF.score!).toBeGreaterThan(0.1);
    expect(r.dimensions.TF.unstable).toBe(true);
  });

  it('respects item weights', () => {
    const [a, b] = bank.items.filter((i) => i.target === 'EI' && i.key === 1);
    const weighted = [{ ...a!, weight: 3 }, { ...b!, weight: 1 }];
    const r = scoreMbti(weighted, { [a!.id]: 7, [b!.id]: 1 }, cfg, 7);
    expect(r.dimensions.EI.score).toBeCloseTo((3 * 1 + 1 * -1) / 4, 10);
  });
});

describe('scoreMbti — eight functions', () => {
  it('scores each function from its own items only', () => {
    const list = [...allDims(), ...items('Ni', 4), ...items('Se', 4)];
    const a: Record<string, number> = { ...answerAll(items('Ni', 4), 1), ...answerAll(items('Se', 4), -1) };
    const r = scoreMbti(list, a, cfg, 7);
    expect(r.functions.Ni.score).toBe(100);
    expect(r.functions.Se.score).toBe(0);
    expect(r.functions.Ni.rank).toBe(1);
    expect(r.functions.Ne.score).toBeNull(); // no items → no number
    expect(r.functionsComplete).toBe(false);
    expect(r.stackAgreement).toBeNull();
  });

  it('needs minFunctionItems answers before showing a function', () => {
    const one = items('Fi', 1);
    const r = scoreMbti(one, { [one[0]!.id]: 7 }, cfg, 7);
    expect(r.functions.Fi.score).toBeNull();
    expect(r.functions.Fi.answered).toBe(1);
  });

  it('computes relative strength and stack agreement', () => {
    const fnItems = ['Se', 'Si', 'Ne', 'Ni', 'Te', 'Ti', 'Fe', 'Fi'].flatMap((f) => items(f, 4));
    const strength: Record<string, number> = { Ni: 1, Te: 0.67, Fi: 0, Se: -0.67, Ne: -0.34, Si: -0.34, Ti: 0, Fe: -0.34 };
    const a: Record<string, number> = {
      ...answerAll(items('EI'), -1),
      ...answerAll(items('SN'), -1),
      ...answerAll(items('TF'), 1),
      ...answerAll(items('JP'), 1),
    };
    for (const i of fnItems) a[i.id] = Math.round(4 + 3 * strength[i.target]! * i.key);
    const r = scoreMbti([...allDims(), ...fnItems], a, cfg, 7);
    expect(r.typeCode).toBe('INTJ');
    expect(r.functionsComplete).toBe(true);
    expect(r.theoreticalStack).toEqual({ dominant: 'Ni', auxiliary: 'Te', tertiary: 'Fi', inferior: 'Se' });
    expect(r.stackAgreement).toBe('match');
    const sumRel = Object.values(r.functions).reduce((s, f) => s + f.relative!, 0);
    expect(sumRel).toBeCloseTo(0, 8);
  });
});

describe('theoreticalStack', () => {
  const EXPECTED: Record<string, string> = {
    ISTJ: 'Si Te Fi Ne', ISFJ: 'Si Fe Ti Ne', INFJ: 'Ni Fe Ti Se', INTJ: 'Ni Te Fi Se',
    ISTP: 'Ti Se Ni Fe', ISFP: 'Fi Se Ni Te', INFP: 'Fi Ne Si Te', INTP: 'Ti Ne Si Fe',
    ESTP: 'Se Ti Fe Ni', ESFP: 'Se Fi Te Ni', ENFP: 'Ne Fi Te Si', ENTP: 'Ne Ti Fe Si',
    ESTJ: 'Te Si Ne Fi', ESFJ: 'Fe Si Ne Ti', ENFJ: 'Fe Ni Se Ti', ENTJ: 'Te Ni Se Fi',
  };

  it.each(Object.entries(EXPECTED))('%s → %s', (code, stack) => {
    const s = theoreticalStack(code)!;
    expect([s.dominant, s.auxiliary, s.tertiary, s.inferior].join(' ')).toBe(stack);
  });

  it('returns null for codes with X or ?', () => {
    expect(theoreticalStack('INXJ')).toBeNull();
    expect(theoreticalStack('?NTJ')).toBeNull();
  });
});
