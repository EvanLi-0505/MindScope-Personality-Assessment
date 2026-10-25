/**
 * "sum@1" scoring for wellbeing scales:
 *
 *   raw   = Σ value_i            (reverse items: max + min − value)
 *   score = raw × multiplier
 *   band  = the band whose [min, max] contains score
 *
 * Every item must be answered (published scales are not prorated here).
 * The safety rule is independent of the total: a single answer at or above
 * the threshold on a safety item (PHQ-9 item 9) always triggers it.
 */
import { optionRange, scoreRange, type BandLevel, type ScaleFile } from './types';

export const SCALE_ENGINE_ID = 'sum@1';
export const SCALE_ENGINE_VERSION = '1.0.0';

export interface ScaleResult {
  engine: string;
  engineVersion: string;
  instrument: string;
  /** null when not every item is answered. */
  raw: number | null;
  score: number | null;
  minScore: number;
  maxScore: number;
  higherIsBetter: boolean;
  band: { key: string; level: BandLevel; seekHelp: boolean } | null;
  answered: number;
  total: number;
  missing: string[];
  /** Safety items answered at or above the threshold. */
  safetyItems: string[];
  /** Answer per item as given (before reverse scoring). */
  answers: Record<string, number | null>;
}

export type ScaleAnswers = Readonly<Record<string, number | null | undefined>>;

export function scoreScale(scale: ScaleFile, answers: ScaleAnswers): ScaleResult {
  const [lo, hi] = optionRange(scale);
  const valid = new Set(scale.options.map((o) => o.value));
  const [minScore, maxScore] = scoreRange(scale);

  let raw = 0;
  const missing: string[] = [];
  const given: Record<string, number | null> = {};
  for (const item of scale.items) {
    const v = answers[item.id];
    if (v == null || !valid.has(v)) {
      missing.push(item.id);
      given[item.id] = null;
      continue;
    }
    given[item.id] = v;
    raw += item.reverse ? hi + lo - v : v;
  }

  const safety = scale.scoring.safety;
  const safetyItems = safety ? safety.itemIds.filter((id) => (given[id] ?? -Infinity) >= safety.minValue) : [];

  const complete = missing.length === 0;
  const score = complete ? raw * scale.scoring.multiplier : null;
  const band = score === null ? null : scale.scoring.bands.find((b) => score >= b.min && score <= b.max) ?? null;

  return {
    engine: SCALE_ENGINE_ID,
    engineVersion: SCALE_ENGINE_VERSION,
    instrument: scale.instrument,
    raw: complete ? raw : null,
    score,
    minScore,
    maxScore,
    higherIsBetter: scale.scoring.higherIsBetter,
    band: band ? { key: band.key, level: band.level, seekHelp: !!band.seekHelp } : null,
    answered: scale.items.length - missing.length,
    total: scale.items.length,
    missing,
    safetyItems,
    answers: given,
  };
}
