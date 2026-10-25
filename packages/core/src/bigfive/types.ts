/**
 * Big Five (preview) item bank format. One pool of items; each form (mode)
 * lists which items it uses and, per item, the domain, facet and key —
 * the same sentence can belong to different domains in different published
 * inventories (e.g. "Feel others' emotions": Agreeableness in the 50-item
 * markers, Openness/Emotionality in the IPIP-NEO-120).
 */
import type { I18nText } from '../bank/types';

/** Display order: O C E A N. */
export const B5_DOMAINS = ['O', 'C', 'E', 'A', 'N'] as const;
export type B5Domain = (typeof B5_DOMAINS)[number];

/** Forms reuse the 16-type mode ids so the UI speaks one language: quick / normal / senior. */
export const B5_FORMS = ['quick', 'normal', 'senior'] as const;
export type B5FormId = (typeof B5_FORMS)[number];

export const B5_ENGINE = 'likert-mean@1';
export const B5_ENGINE_VERSION = '1.0.0';

export interface B5Item {
  id: string;
  text: I18nText;
  /** Present on items written by MindScope to replace an original item. */
  adapted?: { replaces: string };
}

export interface B5Entry {
  item: string;
  domain: B5Domain;
  /** e.g. "N1"; only in forms with facets. */
  facet?: string;
  key: 1 | -1;
}

export interface B5Form {
  source: string;
  citation: string;
  facets: boolean;
  entries: B5Entry[];
}

export interface BigFiveFile {
  instrument: string;
  version: string;
  status: 'experimental' | 'published';
  title: I18nText;
  description: I18nText;
  instructions: I18nText;
  source: I18nText;
  license: string;
  licenseNote: I18nText;
  translationNote: I18nText;
  citations: string[];
  options: { value: number; label: I18nText }[];
  scoring: {
    engine: string;
    /** Mean thresholds between low / mid / high (position on the scale, not norms). */
    bands: [number, number];
    /** A domain or facet needs this share of its items answered to get a score. */
    minAnsweredRatio: number;
  };
  forms: Record<B5FormId, B5Form>;
  items: B5Item[];
}

export type B5Band = 'low' | 'mid' | 'high';

export interface B5Score {
  /** Mean of keyed answers, 1–5; null when too few answers. */
  mean: number | null;
  /** The mean on 0–100: (mean − 1) / 4 × 100. */
  score100: number | null;
  /** Standard error of the mean on the 1–5 scale. */
  se: number | null;
  answered: number;
  total: number;
  band: B5Band | null;
}

export interface BigFiveResult {
  engine: string;
  engineVersion: string;
  form: B5FormId;
  domains: Record<B5Domain, B5Score>;
  /** Facet scores (senior form only). */
  facets: Record<string, B5Score> | null;
  answered: number;
  total: number;
  /** Raw answers by item id, as given (1–5). */
  answers: Record<string, number>;
}
