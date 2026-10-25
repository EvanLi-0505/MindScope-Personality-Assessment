import { describe, expect, it } from 'vitest';
import { scoreScale, validateScale, type ScaleFile } from '@mindscope/core';
import { WELLBEING_SCALES } from '../src';

const byId = Object.fromEntries(WELLBEING_SCALES.map((s) => [s.instrument, s])) as Record<string, ScaleFile>;

/** Answers that add up to `raw` (filling items in order). */
function answersFor(scale: ScaleFile, raw: number) {
  const values = scale.options.map((o) => o.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const out: Record<string, number> = {};
  let left = raw - lo * scale.items.length;
  for (const item of scale.items) {
    const add = Math.min(hi - lo, left);
    left -= add;
    const effective = lo + add;
    out[item.id] = item.reverse ? hi + lo - effective : effective;
  }
  return out;
}

const bandAt = (id: string, raw: number) => scoreScale(byId[id]!, answersFor(byId[id]!, raw)).band?.key;

describe('wellbeing scale files', () => {
  it.each(WELLBEING_SCALES.map((s) => [s.instrument, s] as const))('%s validates without errors or warnings', (_id, scale) => {
    expect(validateScale(scale)).toEqual([]);
  });

  it('PHQ-9 bands follow the official cut points 5 / 10 / 15 / 20', () => {
    expect(byId.phq9!.items).toHaveLength(9);
    const cases: [number, string][] = [
      [0, 'minimal'], [4, 'minimal'], [5, 'mild'], [9, 'mild'], [10, 'moderate'], [14, 'moderate'],
      [15, 'moderately_severe'], [19, 'moderately_severe'], [20, 'severe'], [27, 'severe'],
    ];
    for (const [raw, key] of cases) expect(bandAt('phq9', raw), `raw ${raw}`).toBe(key);
  });

  it('GAD-7 bands follow the official cut points 5 / 10 / 15', () => {
    expect(byId.gad7!.items).toHaveLength(7);
    const cases: [number, string][] = [[4, 'minimal'], [5, 'mild'], [9, 'mild'], [10, 'moderate'], [14, 'moderate'], [15, 'severe'], [21, 'severe']];
    for (const [raw, key] of cases) expect(bandAt('gad7', raw), `raw ${raw}`).toBe(key);
  });

  it('WHO-5 reports raw × 4 and flags scores below 50', () => {
    const r12 = scoreScale(byId.who5!, answersFor(byId.who5!, 12));
    expect(r12.raw).toBe(12);
    expect(r12.score).toBe(48);
    expect(r12.band?.key).toBe('low');
    expect(bandAt('who5', 13)).toBe('ok'); // 52
    expect(scoreScale(byId.who5!, answersFor(byId.who5!, 25)).score).toBe(100);
    expect(byId.who5!.translationNote?.en).toContain('This translation was not created by the World Health Organization');
  });

  it('PHQ-9 item 9 triggers the safety flag on its own, whatever the total', () => {
    const answers = Object.fromEntries(byId.phq9!.items.map((i) => [i.id, 0]));
    answers['PHQ9-09'] = 1;
    const r = scoreScale(byId.phq9!, answers);
    expect(r.score).toBe(1);
    expect(r.band?.key).toBe('minimal');
    expect(r.safetyItems).toEqual(['PHQ9-09']);
    answers['PHQ9-09'] = 0;
    expect(scoreScale(byId.phq9!, answers).safetyItems).toEqual([]);
  });

  it('the stress check-in reverse-scores its coping items and is marked experimental', () => {
    const s = byId['ms-stress']!;
    expect(s.status).toBe('experimental');
    const best = Object.fromEntries(s.items.map((i) => [i.id, i.reverse ? 4 : 0]));
    expect(scoreScale(s, best).score).toBe(0);
    const worst = Object.fromEntries(s.items.map((i) => [i.id, i.reverse ? 0 : 4]));
    expect(scoreScale(s, worst).score).toBe(40);
    expect(bandAt('ms-stress', 13)).toBe('low');
    expect(bandAt('ms-stress', 14)).toBe('medium');
    expect(bandAt('ms-stress', 27)).toBe('high');
  });

  it('every validated scale names its source and licence', () => {
    for (const s of WELLBEING_SCALES) {
      expect(s.citation.length).toBeGreaterThan(20);
      expect(s.licenseNote['zh-CN'].length).toBeGreaterThan(10);
    }
  });
});
