/**
 * Pure helpers for history views and comparisons. Inputs are stored results;
 * nothing here is invented — empty input gives empty output.
 */
import { DIMENSIONS, FIRST_POLE, SECOND_POLE, type Dimension, type ModeId } from './bank/types';
import type { MbtiResult } from './scoring/mbti';

export interface HistoryEntry {
  id: string;
  profileId: string;
  profileName?: string;
  mode: ModeId;
  versionId: string;
  createdAt: string;
  result: MbtiResult;
}

export interface HistorySummary {
  total: number;
  /** Type code → count, most frequent first. Codes with X/? are kept as they are. */
  types: { code: string; count: number }[];
  /** "YYYY-MM" (local time) → count, oldest first, months without tests included. */
  months: { month: string; count: number }[];
  perProfile: { profileId: string; name: string; count: number }[];
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function summarizeHistory(entries: readonly HistoryEntry[]): HistorySummary {
  const types = new Map<string, number>();
  const months = new Map<string, number>();
  const people = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    types.set(e.result.typeCode, (types.get(e.result.typeCode) ?? 0) + 1);
    const m = monthKey(e.createdAt);
    months.set(m, (months.get(m) ?? 0) + 1);
    const p = people.get(e.profileId) ?? { name: e.profileName ?? e.profileId, count: 0 };
    p.count++;
    people.set(e.profileId, p);
  }
  // Fill gaps between the first and last month so the chart has a true time axis.
  const keys = [...months.keys()].sort();
  const filled: { month: string; count: number }[] = [];
  if (keys.length) {
    let [y, mo] = keys[0]!.split('-').map(Number) as [number, number];
    const last = keys[keys.length - 1]!;
    for (;;) {
      const k = `${y}-${String(mo).padStart(2, '0')}`;
      filled.push({ month: k, count: months.get(k) ?? 0 });
      if (k === last) break;
      mo++;
      if (mo > 12) {
        mo = 1;
        y++;
      }
    }
  }
  return {
    total: entries.length,
    types: [...types].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    months: filled,
    perProfile: [...people].map(([profileId, v]) => ({ profileId, ...v })).sort((a, b) => b.count - a.count),
  };
}

export type ComparabilityNote = 'different_modes' | 'different_banks' | 'different_people' | 'includes_quick';

/** Why the compared results are not directly comparable (empty = directly comparable). */
export function comparabilityNotes(entries: readonly HistoryEntry[]): ComparabilityNote[] {
  const notes: ComparabilityNote[] = [];
  if (new Set(entries.map((e) => e.mode)).size > 1) notes.push('different_modes');
  if (new Set(entries.map((e) => e.versionId)).size > 1) notes.push('different_banks');
  if (new Set(entries.map((e) => e.profileId)).size > 1) notes.push('different_people');
  if (entries.some((e) => e.mode === 'quick')) notes.push('includes_quick');
  return notes;
}

export interface DimensionComparison {
  dimension: Dimension;
  /** S per entry (null when insufficient). */
  scores: (number | null)[];
  letters: (string | null)[];
  /** Largest minus smallest S among available scores (0 when < 2 scores). */
  spread: number;
  /** At least two entries lean to different poles. */
  lettersDiffer: boolean;
}

export function compareDimensions(entries: readonly HistoryEntry[]): DimensionComparison[] {
  return DIMENSIONS.map((d) => {
    const scores = entries.map((e) => e.result.dimensions[d].score);
    const letters = entries.map((e) => e.result.dimensions[d].pole);
    const available = scores.filter((s): s is number => s !== null);
    const decided = letters.filter((l): l is string => l !== null);
    return {
      dimension: d,
      scores,
      letters,
      spread: available.length >= 2 ? Math.max(...available) - Math.min(...available) : 0,
      lettersDiffer: new Set(decided).size > 1,
    };
  });
}

/** Points for a dimension trend line: y = S × 100, positive = first pole (E/S/T/J). */
export function dimensionTrend(entries: readonly HistoryEntry[], d: Dimension) {
  return [...entries]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({ id: e.id, at: e.createdAt, mode: e.mode, value: e.result.dimensions[d].score === null ? null : e.result.dimensions[d].score! * 100 }));
}

export function poleLabels(d: Dimension): [string, string] {
  return [FIRST_POLE[d], SECOND_POLE[d]];
}
