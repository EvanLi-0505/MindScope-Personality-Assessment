/**
 * Wellbeing self-assessment scales (PHQ-9, GAD-7, WHO-5, …). Unlike the 16-type
 * bank these are short fixed questionnaires scored by a simple sum, with
 * published severity bands. Kept separate from personality data on purpose.
 */
import type { I18nText } from '../bank/types';

export type BandLevel = 'good' | 'minimal' | 'mild' | 'moderate' | 'high' | 'severe';

export interface ScaleOption {
  value: number;
  label: I18nText;
}

export interface ScaleItem {
  id: string;
  text: I18nText;
  /** Reverse scored: value → (max + min − value). */
  reverse?: boolean;
}

export interface ScaleBand {
  key: string;
  /** Inclusive range on the reported score (raw × multiplier). */
  min: number;
  max: number;
  level: BandLevel;
  label: I18nText;
  summary: I18nText;
  suggestions: I18nText[];
  /** Suggest talking with a professional at this level. */
  seekHelp?: boolean;
}

export interface ScaleScoring {
  engine: string;
  /** Reported score = raw × multiplier (WHO-5 uses 4 to get 0–100). */
  multiplier: number;
  /** WHO-5: higher is better. PHQ-9/GAD-7: higher means more symptoms. */
  higherIsBetter: boolean;
  bands: ScaleBand[];
  /** Items that show crisis resources whenever answered at or above `minValue`, whatever the total. */
  safety?: { itemIds: string[]; minValue: number };
  /** Change in reported score that is worth noticing in a trend (from the source literature). */
  meaningfulChange?: number;
}

export interface ScaleFile {
  kind: 'wellbeing';
  instrument: string;
  version: string;
  /** published = validated instrument; experimental = self-written. */
  status: 'published' | 'experimental';
  shortName: I18nText;
  title: I18nText;
  description: I18nText;
  instructions: I18nText;
  license: string;
  licenseNote: I18nText;
  source: I18nText;
  citation: string;
  /** Required notice for translations, e.g. WHO's disclaimer. */
  translationNote?: I18nText;
  /** In display order. */
  options: ScaleOption[];
  items: ScaleItem[];
  scoring: ScaleScoring;
}

export function optionRange(scale: Pick<ScaleFile, 'options'>): [number, number] {
  const values = scale.options.map((o) => o.value);
  return [Math.min(...values), Math.max(...values)];
}

/** Lowest and highest reported score. */
export function scoreRange(scale: Pick<ScaleFile, 'options' | 'items' | 'scoring'>): [number, number] {
  const [lo, hi] = optionRange(scale);
  const n = scale.items.length;
  return [lo * n * scale.scoring.multiplier, hi * n * scale.scoring.multiplier];
}
