import { describe, expect, it } from 'vitest';
import { compareDimensions, comparabilityNotes, dimensionTrend, isValidAvatar, scoreMbti, summarizeHistory, validateProfileInput, type HistoryEntry } from '../src';
import { makeBank } from './fixtures';

const bank = makeBank();
const dimItems = bank.items.filter((i) => ['EI', 'SN', 'TF', 'JP'].includes(i.target));

/** A result whose four dimension scores are exactly `s` (each in [−1, 1], multiples of 1/3). */
function resultWith(s: Record<string, number>) {
  const answers = Object.fromEntries(dimItems.map((i) => [i.id, Math.round(4 + 3 * s[i.target]! * i.key)]));
  return scoreMbti(dimItems, answers, bank.scoring, 7);
}

function entry(id: string, createdAt: string, s: Record<string, number>, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, profileId: 'p1', profileName: '甲', mode: 'normal', versionId: 'ms16@0.1.0', createdAt, result: resultWith(s), ...extra };
}

const INTJ = { EI: -2 / 3, SN: -2 / 3, TF: 1 / 3, JP: 1 };
const INFJ = { EI: -2 / 3, SN: -1, TF: -1 / 3, JP: 2 / 3 };

describe('summarizeHistory', () => {
  it('is empty for no results', () => {
    expect(summarizeHistory([])).toEqual({ total: 0, types: [], months: [], perProfile: [] });
  });

  it('counts types, months (with gaps filled) and people', () => {
    const s = summarizeHistory([
      entry('a', '2026-01-15T10:00:00Z', INTJ),
      entry('b', '2026-03-02T10:00:00Z', INTJ),
      entry('c', '2026-03-20T10:00:00Z', INFJ, { profileId: 'p2', profileName: '乙' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.types).toEqual([
      { code: 'INTJ', count: 2 },
      { code: 'INFJ', count: 1 },
    ]);
    expect(s.months.map((m) => [m.month, m.count])).toEqual([
      ['2026-01', 1],
      ['2026-02', 0],
      ['2026-03', 2],
    ]);
    expect(s.perProfile).toEqual([
      { profileId: 'p1', name: '甲', count: 2 },
      { profileId: 'p2', name: '乙', count: 1 },
    ]);
  });

  it('fills months across a year boundary', () => {
    const s = summarizeHistory([entry('a', '2025-11-10T12:00:00Z', INTJ), entry('b', '2026-02-10T12:00:00Z', INTJ)]);
    expect(s.months.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('comparisons', () => {
  it('reports what makes results not directly comparable', () => {
    const a = entry('a', '2026-01-01T00:00:00Z', INTJ);
    expect(comparabilityNotes([a, entry('b', '2026-02-01T00:00:00Z', INTJ)])).toEqual([]);
    expect(
      comparabilityNotes([a, entry('b', '2026-02-01T00:00:00Z', INTJ, { mode: 'quick', versionId: 'ms16@0.2.0', profileId: 'p2' })]),
    ).toEqual(['different_modes', 'different_banks', 'different_people', 'includes_quick']);
  });

  it('finds dimensions whose letters differ and their spread', () => {
    const rows = compareDimensions([entry('a', '2026-01-01T00:00:00Z', INTJ), entry('b', '2026-02-01T00:00:00Z', INFJ)]);
    const tf = rows.find((r) => r.dimension === 'TF')!;
    expect(tf.letters).toEqual(['T', 'F']);
    expect(tf.lettersDiffer).toBe(true);
    expect(tf.spread).toBeCloseTo(2 / 3, 10);
    expect(rows.find((r) => r.dimension === 'EI')!.lettersDiffer).toBe(false);
  });

  it('trend points are ordered by time and scaled to ±100', () => {
    const pts = dimensionTrend([entry('b', '2026-02-01T00:00:00Z', INFJ), entry('a', '2026-01-01T00:00:00Z', INTJ)], 'JP');
    expect(pts.map((p) => p.id)).toEqual(['a', 'b']);
    expect(pts[0]!.value).toBeCloseTo(100, 8);
  });
});

describe('avatar validation', () => {
  it('accepts presets and small inline images, rejects anything else', () => {
    expect(isValidAvatar({ kind: 'preset', icon: 'leaf', color: '#1F7A6D' })).toBe(true);
    expect(isValidAvatar({ kind: 'preset', icon: 'leaf', color: 'red;background:url(x)' })).toBe(false);
    expect(isValidAvatar({ kind: 'image', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' })).toBe(true);
    expect(isValidAvatar({ kind: 'image', dataUrl: 'javascript:alert(1)' })).toBe(false);
    expect(isValidAvatar({ kind: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })).toBe(false);
    expect(isValidAvatar({ kind: 'image', dataUrl: `data:image/png;base64,${'A'.repeat(300_001)}` })).toBe(false);
    expect(validateProfileInput({ name: 'x', avatar: { kind: 'image', dataUrl: 'nope' } })).toEqual([{ field: 'avatar', code: 'invalid' }]);
  });
});
