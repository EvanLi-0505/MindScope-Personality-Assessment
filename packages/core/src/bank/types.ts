/** Text in several languages. `zh-CN` is required; other locales fall back to it. */
export type I18nText = { 'zh-CN': string; en?: string } & Record<string, string | undefined>;

export const DIMENSIONS = ['EI', 'SN', 'TF', 'JP'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const FUNCTIONS = ['Se', 'Si', 'Ne', 'Ni', 'Te', 'Ti', 'Fe', 'Fi'] as const;
export type CogFunction = (typeof FUNCTIONS)[number];

export type Target = Dimension | CogFunction;

/** First pole of each dimension: agreeing with a +1 item moves towards it. */
export const FIRST_POLE: Record<Dimension, string> = { EI: 'E', SN: 'S', TF: 'T', JP: 'J' };
export const SECOND_POLE: Record<Dimension, string> = { EI: 'I', SN: 'N', TF: 'F', JP: 'P' };

export const MODE_IDS = ['quick', 'normal', 'senior', 'full'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export interface ScoringConfig {
  /** Which scoring engine interprets this bank, e.g. "bipolar-likert@1". */
  engine: string;
  /** |S| at or below this is shown as "close to balanced". */
  balancedThreshold: number;
  /** Clarity band edges for |S|: [balanced, slight, moderate]. */
  bands: [number, number, number];
  /** A dimension needs at least this share of its administered items answered. */
  minAnsweredRatio: number;
  /** A function needs at least this many answered items to be shown. */
  minFunctionItems: number;
}

export interface ModeConfig {
  /** Adaptive: per-dimension minimum/maximum and the total of dimension items. */
  dimensions?: { min: number; max: number; total: number };
  /** Fixed number of items per cognitive function. */
  functions?: { per: number };
  /** Use every enabled item of the bank. */
  all?: boolean;
  adaptive: boolean;
}

export interface BankItem {
  /** Stable id, never reused, e.g. "EI-001". */
  id: string;
  target: Target;
  /** +1: agreeing points to the first pole (E/S/T/J) or to the function. -1: reverse keyed. */
  key: 1 | -1;
  weight: number;
  scale: string;
  text: I18nText;
  tags?: string[];
  /** Restrict to some modes; omitted = all modes. */
  modes?: ModeId[];
  enabled: boolean;
}

export interface BankFile {
  instrument: string;
  version: string;
  status: 'experimental' | 'published';
  title: I18nText;
  license: string;
  source: I18nText;
  scales: Record<string, { points: number; labels: Record<string, string[]> }>;
  scoring: ScoringConfig;
  modes: Record<ModeId, ModeConfig>;
  items: BankItem[];
}

export function isDimension(t: string): t is Dimension {
  return (DIMENSIONS as readonly string[]).includes(t);
}

export function isFunction(t: string): t is CogFunction {
  return (FUNCTIONS as readonly string[]).includes(t);
}

export function localize(text: I18nText | undefined, locale: string): string {
  if (!text) return '';
  return text[locale] ?? text['zh-CN'];
}

/** Items usable in a mode (enabled and not restricted to other modes). */
export function itemsForMode(bank: Pick<BankFile, 'items'>, mode: ModeId): BankItem[] {
  return bank.items.filter((i) => i.enabled && (!i.modes || i.modes.includes(mode)));
}

/** Number of questions a mode asks. */
export function plannedCount(bank: Pick<BankFile, 'items' | 'modes'>, mode: ModeId): number {
  const cfg = bank.modes[mode];
  if (cfg.all) return itemsForMode(bank, mode).length;
  return (cfg.dimensions?.total ?? 0) + (cfg.functions?.per ?? 0) * FUNCTIONS.length;
}
