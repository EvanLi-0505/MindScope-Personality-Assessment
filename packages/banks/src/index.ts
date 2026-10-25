/**
 * Built-in item banks and texts. Content is licensed CC BY-SA 4.0.
 * A published bank version is immutable: change the content → bump the version.
 */
import type { B5Domain, BankFile, BigFiveFile, CogFunction, Dimension, ScaleFile } from '@mindscope/core';
import ms16Raw from '../ms16/bank-0.1.0.json';
import phq9Raw from '../wellbeing/phq9-1.0.0.json';
import gad7Raw from '../wellbeing/gad7-1.0.0.json';
import who5Raw from '../wellbeing/who5-1.0.0.json';
import stressRaw from '../wellbeing/stress-0.1.0.json';
import typesRaw from '../ms16/types.json';
import functionsRaw from '../ms16/functions.json';
import bigFiveRaw from '../bigfive/ipip-b5-0.1.0.json';
import bigFiveTextsRaw from '../bigfive/texts.json';

export const ms16Bank = ms16Raw as unknown as BankFile;

export interface TypeProfileText {
  title: string;
  summary: string;
  strengths: string[];
  challenges: string[];
  work: string;
  communication: string;
  relationships: string;
  getAlong: { do: string[]; avoid: string[] };
  growth: string[];
}

export interface FunctionText {
  name: string;
  short: string;
  description: string;
  examples: string[];
}

export interface DimensionText {
  name: string;
  first: { letter: string; name: string; description: string };
  second: { letter: string; name: string; description: string };
}

type Localized<T> = { 'zh-CN': T; en?: T };

const { _note: _t, ...typeEntries } = typesRaw as Record<string, unknown>;
export const typeProfiles = typeEntries as Record<string, Localized<TypeProfileText>>;
export const functionTexts = (functionsRaw as { functions: Record<CogFunction, Localized<FunctionText>> }).functions;
export const dimensionTexts = (functionsRaw as { dimensions: Record<Dimension, Localized<DimensionText>> }).dimensions;

export function pick<T>(entry: Localized<T> | undefined, locale: string): T | undefined {
  if (!entry) return undefined;
  return (entry as Record<string, T>)[locale] ?? entry['zh-CN'];
}

export const BUILTIN_BANKS: readonly BankFile[] = [ms16Bank];

/** Big Five (preview): IPIP items (public domain), MindScope translation. */
export const bigFiveBank = bigFiveRaw as unknown as BigFiveFile;

export interface BigFiveDomainText {
  name: string;
  /** The English research name, shown next to the localized name. */
  en: string;
  summary: string;
  high: string;
  mid: string;
  low: string;
  getAlongHigh: string;
  getAlongLow: string;
}
export const bigFiveTexts = bigFiveTextsRaw as unknown as {
  domains: Record<B5Domain, Localized<BigFiveDomainText>>;
  facets: Record<string, Localized<string>>;
};

/** Wellbeing self-assessments, in the order they are offered. */
export const WELLBEING_SCALES: readonly ScaleFile[] = [phq9Raw, gad7Raw, who5Raw, stressRaw] as unknown as ScaleFile[];

/** Crisis resources shown with safety items and high bands (text only, no network). */
export const CRISIS_RESOURCES = {
  'zh-CN': {
    title: '如果你现在感到很难受',
    lines: [
      '全国统一心理援助热线：12356（免费）',
      '如果有伤害自己的想法或身处危险之中，请立即拨打 110 或 120，或前往最近的医院急诊。',
      '请联系一位你信任的人，让 TA 陪在你身边。',
      '如果你不在中国大陆，请拨打当地的紧急电话或心理危机热线。',
    ],
  },
  en: {
    title: 'If you are struggling right now',
    lines: [
      'If you have thoughts of harming yourself or are in danger, call your local emergency number or go to the nearest emergency department now.',
      'Contact a local crisis or mental-health helpline (in mainland China: 12356, free of charge).',
      'Reach out to someone you trust and ask them to stay with you.',
    ],
  },
} as const;
