import { describe, expect, it } from 'vitest';
import { FUNCTIONS, DIMENSIONS, plannedCount, validateBank } from '@mindscope/core';
import { dimensionTexts, functionTexts, ms16Bank, typeProfiles } from '../src';

const ALL_TYPES = ['E', 'I'].flatMap((a) => ['S', 'N'].flatMap((b) => ['T', 'F'].flatMap((c) => ['J', 'P'].map((d) => a + b + c + d))));

describe('ms16 bank 0.1.0', () => {
  it('passes validation without errors or warnings', () => {
    const issues = validateBank(ms16Bank);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.filter((i) => i.level === 'warning')).toEqual([]);
  });

  it('has the planned size for every mode', () => {
    expect(ms16Bank.items).toHaveLength(216);
    expect(plannedCount(ms16Bank, 'quick')).toBe(40);
    expect(plannedCount(ms16Bank, 'normal')).toBe(80);
    expect(plannedCount(ms16Bank, 'senior')).toBe(144);
    expect(plannedCount(ms16Bank, 'full')).toBe(216);
  });

  it('is clearly labelled as self-written and unvalidated', () => {
    expect(ms16Bank.status).toBe('experimental');
    expect(ms16Bank.source['zh-CN']).toContain('尚未经过');
  });
});

describe('texts', () => {
  it.each(ALL_TYPES)('%s has a complete profile in both languages', (code) => {
    for (const loc of ['zh-CN', 'en'] as const) {
      const p = typeProfiles[code]?.[loc];
      expect(p, `${code} ${loc}`).toBeDefined();
      expect(p!.title.length).toBeGreaterThan(1);
      expect(p!.summary.length).toBeGreaterThan(20);
      expect(p!.strengths.length).toBeGreaterThanOrEqual(3);
      expect(p!.challenges.length).toBeGreaterThanOrEqual(3);
      expect(p!.getAlong.do.length).toBeGreaterThanOrEqual(2);
      expect(p!.getAlong.avoid.length).toBeGreaterThanOrEqual(1);
      expect(p!.growth.length).toBeGreaterThanOrEqual(2);
      for (const field of ['work', 'communication', 'relationships'] as const) expect(p![field].length).toBeGreaterThan(10);
    }
  });

  it('type titles are unique', () => {
    const titles = ALL_TYPES.map((c) => typeProfiles[c]!['zh-CN'].title);
    expect(new Set(titles).size).toBe(16);
  });

  it('covers every function and dimension in both languages', () => {
    for (const f of FUNCTIONS) for (const loc of ['zh-CN', 'en'] as const) expect(functionTexts[f][loc]?.name).toBeTruthy();
    for (const d of DIMENSIONS) for (const loc of ['zh-CN', 'en'] as const) expect(dimensionTexts[d][loc]?.first.name).toBeTruthy();
  });
});
