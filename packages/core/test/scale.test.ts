import { describe, expect, it } from 'vitest';
import { scoreRange, scoreScale, validateScale, type ScaleFile } from '../src';

const t = (zh: string) => ({ 'zh-CN': zh, en: zh });

function makeScale(over: Partial<ScaleFile['scoring']> = {}): ScaleFile {
  return {
    kind: 'wellbeing',
    instrument: 'demo',
    version: '1.0.0',
    status: 'published',
    shortName: t('D'),
    title: t('演示'),
    description: t('演示'),
    instructions: t('演示'),
    license: 'x',
    licenseNote: t('演示'),
    source: t('演示'),
    citation: 'Demo citation for tests 2026',
    options: [0, 1, 2, 3].map((v) => ({ value: v, label: t(String(v)) })),
    items: [
      { id: 'A', text: t('一') },
      { id: 'B', text: t('二') },
      { id: 'C', text: t('三'), reverse: true },
    ],
    scoring: {
      engine: 'sum@1',
      multiplier: 1,
      higherIsBetter: false,
      safety: { itemIds: ['B'], minValue: 2 },
      bands: [
        { key: 'low', min: 0, max: 4, level: 'minimal', label: t('低'), summary: t('低'), suggestions: [] },
        { key: 'high', min: 5, max: 9, level: 'high', label: t('高'), summary: t('高'), suggestions: [], seekHelp: true },
      ],
      ...over,
    },
  };
}

describe('scoreScale', () => {
  it('sums answers and reverse-scores marked items', () => {
    const r = scoreScale(makeScale(), { A: 1, B: 1, C: 3 }); // C reversed: 3 → 0
    expect(r.raw).toBe(2);
    expect(r.score).toBe(2);
    expect(r.band).toEqual({ key: 'low', level: 'minimal', seekHelp: false });
    expect(scoreRange(makeScale())).toEqual([0, 9]);
  });

  it('applies the multiplier', () => {
    const s = makeScale({
      multiplier: 4,
      bands: [{ key: 'all', min: 0, max: 36, level: 'good', label: t('x'), summary: t('x'), suggestions: [] }],
    });
    expect(scoreScale(s, { A: 3, B: 3, C: 0 }).score).toBe(36);
  });

  it('gives no score until every item is answered, but still reports safety answers', () => {
    const r = scoreScale(makeScale(), { A: 1, B: 3 });
    expect(r.score).toBeNull();
    expect(r.band).toBeNull();
    expect(r.missing).toEqual(['C']);
    expect(r.safetyItems).toEqual(['B']);
  });

  it('ignores values that are not options', () => {
    const r = scoreScale(makeScale(), { A: 7, B: 1, C: 1 });
    expect(r.missing).toEqual(['A']);
  });

  it('marks bands that suggest seeking help', () => {
    expect(scoreScale(makeScale(), { A: 3, B: 3, C: 0 }).band?.seekHelp).toBe(true);
  });
});

describe('validateScale', () => {
  it('accepts a complete scale', () => {
    expect(validateScale(makeScale()).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('finds gaps and overlaps in the bands', () => {
    const gap = makeScale({
      bands: [
        { key: 'a', min: 0, max: 3, level: 'minimal', label: t('a'), summary: t('a'), suggestions: [] },
        { key: 'b', min: 5, max: 9, level: 'high', label: t('b'), summary: t('b'), suggestions: [] },
      ],
    });
    expect(validateScale(gap).some((i) => i.message.includes('score 4 falls in no band'))).toBe(true);
    const overlap = makeScale({
      bands: [
        { key: 'a', min: 0, max: 5, level: 'minimal', label: t('a'), summary: t('a'), suggestions: [] },
        { key: 'b', min: 5, max: 9, level: 'high', label: t('b'), summary: t('b'), suggestions: [] },
      ],
    });
    expect(validateScale(overlap).some((i) => i.message.includes('score 5 falls in 2 bands'))).toBe(true);
  });

  it('requires known safety items and a citation', () => {
    const s = makeScale({ safety: { itemIds: ['Z'], minValue: 1 } });
    s.citation = '';
    const codes = validateScale(s).map((i) => i.code);
    expect(codes).toContain('safety');
    expect(codes).toContain('citation');
  });
});
