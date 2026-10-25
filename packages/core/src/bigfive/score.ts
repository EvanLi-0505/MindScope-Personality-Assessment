/**
 * `likert-mean@1`: each item 1–5, reverse-keyed items scored 6 − x; a
 * domain (or facet) score is the mean of its keyed answers. No norms: the
 * band only says where the mean lies on the 1–5 scale.
 */
import { B5_DOMAINS, B5_ENGINE, B5_ENGINE_VERSION, type B5Band, type B5Domain, type B5Entry, type B5FormId, type B5Score, type BigFiveFile, type BigFiveResult } from './types';

type Answers = Readonly<Record<string, number | null | undefined>>;

function bandOf(mean: number, [lo, hi]: [number, number]): B5Band {
  return mean < lo ? 'low' : mean > hi ? 'high' : 'mid';
}

function scoreEntries(entries: B5Entry[], answers: Answers, file: BigFiveFile): B5Score {
  const values: number[] = [];
  for (const e of entries) {
    const v = answers[e.item];
    if (v == null || !Number.isInteger(v) || v < 1 || v > 5) continue;
    values.push(e.key === 1 ? v : 6 - v);
  }
  const total = entries.length;
  const n = values.length;
  if (!total || n / total < file.scoring.minAnsweredRatio) {
    return { mean: null, score100: null, se: null, answered: n, total, band: null };
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const se = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) / n) : null;
  return {
    mean: round(mean, 3),
    score100: Math.round(((mean - 1) / 4) * 100),
    se: se == null ? null : round(se, 3),
    answered: n,
    total,
    band: bandOf(mean, file.scoring.bands),
  };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function scoreBigFive(file: BigFiveFile, formId: B5FormId, answers: Answers): BigFiveResult {
  const form = file.forms[formId];
  if (!form) throw new Error(`Unknown Big Five form ${formId}`);
  const domains = Object.fromEntries(
    B5_DOMAINS.map((d) => [d, scoreEntries(form.entries.filter((e) => e.domain === d), answers, file)]),
  ) as Record<B5Domain, B5Score>;
  let facets: Record<string, B5Score> | null = null;
  if (form.facets) {
    const ids = [...new Set(form.entries.map((e) => e.facet).filter((f): f is string => !!f))];
    facets = Object.fromEntries(ids.map((f) => [f, scoreEntries(form.entries.filter((e) => e.facet === f), answers, file)]));
  }
  const given: Record<string, number> = {};
  for (const e of form.entries) {
    const v = answers[e.item];
    if (v != null) given[e.item] = v;
  }
  return {
    engine: B5_ENGINE,
    engineVersion: B5_ENGINE_VERSION,
    form: formId,
    domains,
    facets,
    answered: Object.keys(given).length,
    total: form.entries.length,
    answers: given,
  };
}
