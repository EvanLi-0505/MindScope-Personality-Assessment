import { describe, expect, it } from 'vitest';
import { B5_DOMAINS, scoreBigFive, validateBigFive, type B5Entry, type BigFiveFile } from '../src';

/** Small synthetic bank: 4 items per domain, two reverse-keyed; senior form with 2 facets per domain. */
function makeFile(): BigFiveFile {
  const items: BigFiveFile['items'] = [];
  const entries: B5Entry[] = [];
  const senior: B5Entry[] = [];
  for (const d of B5_DOMAINS) {
    for (let i = 0; i < 4; i++) {
      const id = `${d}${i}`;
      items.push({ id, text: { 'zh-CN': `题目 ${id}`, en: `Item ${id}` } });
      const key = i < 2 ? 1 : -1;
      entries.push({ item: id, domain: d, key });
      senior.push({ item: id, domain: d, facet: `${d}${i % 2 === 0 ? 1 : 2}`, key });
    }
  }
  const text = { 'zh-CN': 'x', en: 'x' };
  return {
    instrument: 'test-b5',
    version: '0.0.1',
    status: 'experimental',
    title: text,
    description: text,
    instructions: text,
    source: text,
    license: 'test',
    licenseNote: text,
    translationNote: text,
    citations: ['test'],
    options: [1, 2, 3, 4, 5].map((value) => ({ value, label: text })),
    scoring: { engine: 'likert-mean@1', bands: [2.3333, 3.6667], minAnsweredRatio: 0.75 },
    forms: {
      quick: { source: 't', citation: 't', facets: false, entries },
      normal: { source: 't', citation: 't', facets: false, entries },
      senior: { source: 't', citation: 't', facets: true, entries: senior },
    },
    items,
  };
}

describe('Big Five scoring (likert-mean@1)', () => {
  const file = makeFile();

  it('the synthetic bank is valid', () => {
    expect(validateBigFive(file)).toEqual([]);
  });

  it('reverse-keys items and averages per domain', () => {
    // + items answered 5, − items answered 1 → every keyed value is 5
    const answers = Object.fromEntries(file.items.map((it, i) => [it.id, i % 4 < 2 ? 5 : 1]));
    const r = scoreBigFive(file, 'normal', answers);
    for (const d of B5_DOMAINS) expect(r.domains[d]).toMatchObject({ mean: 5, score100: 100, band: 'high', answered: 4, total: 4, se: 0 });
    expect(r.facets).toBeNull();
    expect(r.answered).toBe(20);
  });

  it('answering the same option everywhere gives the middle for balanced keys', () => {
    const r = scoreBigFive(file, 'normal', Object.fromEntries(file.items.map((it) => [it.id, 4])));
    // two items keyed + (4) and two keyed − (6 − 4 = 2) → mean 3
    expect(r.domains.O).toMatchObject({ mean: 3, score100: 50, band: 'mid' });
  });

  it('bands follow the thresholds (position on the scale, not norms)', () => {
    const at = (v: number) => scoreBigFive(file, 'normal', Object.fromEntries(file.items.map((it, i) => [it.id, i % 4 < 2 ? v : 6 - v]))).domains.E;
    expect(at(1)).toMatchObject({ mean: 1, score100: 0, band: 'low' });
    expect(at(2)).toMatchObject({ band: 'low' });
    expect(at(3)).toMatchObject({ band: 'mid' });
    expect(at(4)).toMatchObject({ band: 'high' });
  });

  it('needs 75% of a domain answered; ignores invalid values', () => {
    const answers: Record<string, number | null> = Object.fromEntries(file.items.map((it) => [it.id, 3]));
    answers.O0 = null;
    expect(scoreBigFive(file, 'normal', answers).domains.O.mean).toBe(3);
    answers.O1 = 9; // out of range: ignored
    const r = scoreBigFive(file, 'normal', answers).domains.O;
    expect(r).toMatchObject({ mean: null, band: null, answered: 2, total: 4 });
  });

  it('scores facets in forms that have them', () => {
    const r = scoreBigFive(file, 'senior', Object.fromEntries(file.items.map((it) => [it.id, 5])));
    expect(Object.keys(r.facets!).sort()).toHaveLength(10);
    // facet 1 = items 0 (+) and 2 (−): (5 + 1) / 2 = 3
    expect(r.facets!.N1).toMatchObject({ mean: 3, answered: 2 });
  });

  it('the validator catches broken banks', () => {
    const bad = makeFile();
    bad.forms.normal.entries = bad.forms.normal.entries.slice(1);
    bad.items.push({ id: 'orphan', text: { 'zh-CN': 'x', en: 'x' } });
    bad.forms.senior.entries[0]!.facet = 'E9';
    const errs = validateBigFive(bad);
    expect(errs.some((e) => e.includes('equal, non-zero'))).toBe(true);
    expect(errs.some((e) => e.includes('orphan'))).toBe(true);
    expect(errs.some((e) => e.includes('needs a facet of domain'))).toBe(true);
  });
});
