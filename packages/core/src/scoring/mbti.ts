/**
 * MindScope 16-type scoring engine ("bipolar-likert@1"). White box: every
 * number shown to the user comes from the formulas below.
 *
 *   x_i  = (r_i − mid) / (mid − 1)            centred answer in [−1, 1] (7-point: (r−4)/3)
 *   v_i  = key_i · x_i                         reverse-keyed items flip sign
 *   S_d  = Σ w_i·v_i / Σ w_i                   dimension score in [−1, 1], answered items only
 *   P_d  = 50 + 50·S_d                         percent towards the first pole (E/S/T/J)
 *   SE_d = sqrt( Σw(v−S)²/Σw / (n_eff − 1) ),  n_eff = (Σw)² / Σw²
 *
 *   F_f  = 50 + 50 · Σ w_i·v_i / Σ w_i          cognitive-function score in [0, 100]
 *   F'_f = F_f − mean(F)                        relative strength within the person
 *
 * Unanswered items are left out (not treated as neutral). The eight functions
 * are scored from their own items only; the four letters never feed into them.
 */
import {
  DIMENSIONS,
  FIRST_POLE,
  FUNCTIONS,
  SECOND_POLE,
  isDimension,
  type BankItem,
  type CogFunction,
  type Dimension,
  type ScoringConfig,
} from '../bank/types';

export const ENGINE_ID = 'bipolar-likert@1';
export const ENGINE_VERSION = '1.0.0';

export type Band = 'insufficient' | 'balanced' | 'slight' | 'moderate' | 'clear';

export interface DimensionScore {
  dimension: Dimension;
  administered: number;
  answered: number;
  /** S_d in [−1, 1]; null when too few answers. */
  score: number | null;
  se: number | null;
  /** Percent towards the first pole (E, S, T or J). */
  percentFirst: number | null;
  /** Winning letter; null when balanced or insufficient. */
  pole: string | null;
  band: Band;
  /** |S| < 1.5·SE: the letter could easily flip on a retest. */
  unstable: boolean;
}

export interface FunctionScore {
  func: CogFunction;
  administered: number;
  answered: number;
  /** F_f in [0, 100]; null when fewer than `minFunctionItems` answers. */
  score: number | null;
  se: number | null;
  relative: number | null;
  /** 1 = strongest among the functions that have a score. */
  rank: number | null;
}

export interface TypeStack {
  dominant: CogFunction;
  auxiliary: CogFunction;
  tertiary: CogFunction;
  inferior: CogFunction;
}

export interface MbtiResult {
  engine: string;
  engineVersion: string;
  /** e.g. "INFJ"; X = close to balanced; ? = not enough answers. */
  typeCode: string;
  /** Concrete types a code with X could stand for (max 4 listed). */
  alternatives: string[];
  dimensions: Record<Dimension, DimensionScore>;
  functions: Record<CogFunction, FunctionScore>;
  /** True when all eight functions have a score. */
  functionsComplete: boolean;
  /** Type-theory function order (Grant/Beebe) — a reference, NOT a measurement. */
  theoreticalStack: TypeStack | null;
  /** How the two strongest measured functions compare with the theoretical dominant + auxiliary. */
  stackAgreement: 'match' | 'partial' | 'mismatch' | null;
  administered: number;
  answered: number;
}

export type Answers = ReadonlyMap<string, number | null | undefined> | Readonly<Record<string, number | null | undefined>>;

function getAnswer(answers: Answers, id: string): number | null | undefined {
  return answers instanceof Map ? answers.get(id) : (answers as Record<string, number | null | undefined>)[id];
}

interface WeightedStats {
  mean: number;
  se: number;
  n: number;
}

/** Weighted mean and its standard error (see header). */
export function weightedStats(values: readonly { v: number; w: number }[]): WeightedStats | null {
  const sw = values.reduce((a, p) => a + p.w, 0);
  if (!values.length || sw <= 0) return null;
  const mean = values.reduce((a, p) => a + p.w * p.v, 0) / sw;
  const sw2 = values.reduce((a, p) => a + p.w * p.w, 0);
  const nEff = (sw * sw) / sw2;
  const variance = values.reduce((a, p) => a + p.w * (p.v - mean) ** 2, 0) / sw;
  const se = nEff > 1 ? Math.sqrt(variance / (nEff - 1)) : 1;
  return { mean, se, n: values.length };
}

/** Centred value of a Likert answer, or null when it is missing/invalid. */
export function centre(answer: number | null | undefined, points: number): number | null {
  if (answer == null || !Number.isInteger(answer) || answer < 1 || answer > points) return null;
  const mid = (points + 1) / 2;
  return (answer - mid) / (mid - 1);
}

export function bandOf(absScore: number, bands: readonly [number, number, number]): Exclude<Band, 'insufficient'> {
  if (absScore <= bands[0]) return 'balanced';
  if (absScore < bands[1]) return 'slight';
  if (absScore < bands[2]) return 'moderate';
  return 'clear';
}

/** All concrete codes for a code with X letters (at most `limit`). */
export function expandAlternatives(code: string, limit = 4): string[] {
  const options: Record<number, [string, string]> = { 0: ['E', 'I'], 1: ['S', 'N'], 2: ['T', 'F'], 3: ['J', 'P'] };
  let out = [''];
  for (let i = 0; i < 4; i++) {
    const c = code[i]!;
    out = out.flatMap((prefix) => (c === 'X' ? options[i]!.map((o) => prefix + o) : [prefix + c]));
  }
  return code.includes('X') ? out.slice(0, limit) : [];
}

const CONCRETE = /^[EI][SN][TF][JP]$/;

/**
 * Grant/Beebe function order. J/P says which function is extraverted:
 * J → the judging function (T/F) faces outward, P → the perceiving one (S/N).
 * E types lead with the extraverted function, I types with the introverted one.
 * Tertiary = opposite of the auxiliary in the dominant's attitude;
 * inferior = opposite of the dominant in the auxiliary's attitude.
 */
export function theoreticalStack(code: string): TypeStack | null {
  if (!CONCRETE.test(code)) return null;
  const [ei, sn, tf, jp] = code as unknown as [string, string, string, string];
  const perceiving = { letter: sn, attitude: jp === 'P' ? 'e' : 'i' };
  const judging = { letter: tf, attitude: jp === 'J' ? 'e' : 'i' };
  const [dom, aux] = ei === 'E' ? (perceiving.attitude === 'e' ? [perceiving, judging] : [judging, perceiving]) : perceiving.attitude === 'i' ? [perceiving, judging] : [judging, perceiving];
  const opposite: Record<string, string> = { S: 'N', N: 'S', T: 'F', F: 'T' };
  const fn = (letter: string, attitude: string) => `${letter}${attitude}` as CogFunction;
  return {
    dominant: fn(dom!.letter, dom!.attitude),
    auxiliary: fn(aux!.letter, aux!.attitude),
    tertiary: fn(opposite[aux!.letter]!, dom!.attitude),
    inferior: fn(opposite[dom!.letter]!, aux!.attitude),
  };
}

export function scoreMbti(items: readonly BankItem[], answers: Answers, config: ScoringConfig, points: number): MbtiResult {
  let answeredTotal = 0;
  const groups = new Map<string, { v: number; w: number }[]>();
  const administered = new Map<string, number>();

  for (const item of items) {
    administered.set(item.target, (administered.get(item.target) ?? 0) + 1);
    const x = centre(getAnswer(answers, item.id), points);
    if (x === null) continue;
    answeredTotal++;
    const list = groups.get(item.target) ?? [];
    list.push({ v: item.key * x, w: item.weight });
    groups.set(item.target, list);
  }

  // ── four dimensions ──
  const dimensions = {} as Record<Dimension, DimensionScore>;
  let code = '';
  for (const d of DIMENSIONS) {
    const adm = administered.get(d) ?? 0;
    const vals = groups.get(d) ?? [];
    const enough = adm > 0 && vals.length >= Math.ceil(adm * config.minAnsweredRatio);
    const st = enough ? weightedStats(vals) : null;
    if (!st) {
      dimensions[d] = { dimension: d, administered: adm, answered: vals.length, score: null, se: null, percentFirst: null, pole: null, band: 'insufficient', unstable: false };
      code += '?';
      continue;
    }
    const band = bandOf(Math.abs(st.mean), config.bands);
    const pole = band === 'balanced' ? null : st.mean > 0 ? FIRST_POLE[d] : SECOND_POLE[d];
    dimensions[d] = {
      dimension: d,
      administered: adm,
      answered: vals.length,
      score: st.mean,
      se: st.se,
      percentFirst: 50 + 50 * st.mean,
      pole,
      band,
      unstable: Math.abs(st.mean) < 1.5 * st.se,
    };
    code += pole ?? 'X';
  }

  // ── eight functions (independent items) ──
  const functions = {} as Record<CogFunction, FunctionScore>;
  for (const f of FUNCTIONS) {
    const adm = administered.get(f) ?? 0;
    const vals = groups.get(f) ?? [];
    const st = vals.length >= config.minFunctionItems ? weightedStats(vals) : null;
    functions[f] = {
      func: f,
      administered: adm,
      answered: vals.length,
      score: st ? 50 + 50 * st.mean : null,
      se: st ? 50 * st.se : null,
      relative: null,
      rank: null,
    };
  }
  const scored = FUNCTIONS.map((f) => functions[f]).filter((s) => s.score !== null);
  if (scored.length) {
    const mean = scored.reduce((a, s) => a + s.score!, 0) / scored.length;
    for (const s of scored) s.relative = s.score! - mean;
    [...scored].sort((a, b) => b.score! - a.score!).forEach((s, i) => (s.rank = i + 1));
  }
  const functionsComplete = scored.length === FUNCTIONS.length;

  const stack = theoreticalStack(code);
  let stackAgreement: MbtiResult['stackAgreement'] = null;
  if (stack && functionsComplete) {
    const top2 = new Set(scored.filter((s) => s.rank! <= 2).map((s) => s.func));
    const hits = [stack.dominant, stack.auxiliary].filter((f) => top2.has(f)).length;
    stackAgreement = hits === 2 ? 'match' : hits === 1 ? 'partial' : 'mismatch';
  }

  return {
    engine: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    typeCode: code,
    alternatives: code.includes('?') ? [] : expandAlternatives(code),
    dimensions,
    functions,
    functionsComplete,
    theoreticalStack: stack,
    stackAgreement,
    administered: items.length,
    answered: answeredTotal,
  };
}

/** Dimension items only (used by the adaptive planner for live estimates). */
export function liveDimensionEstimate(
  items: readonly BankItem[],
  answers: Answers,
  points: number,
): Record<Dimension, WeightedStats | null> {
  const out = {} as Record<Dimension, WeightedStats | null>;
  for (const d of DIMENSIONS) {
    const vals = items
      .filter((i) => i.target === d && isDimension(i.target))
      .map((i) => ({ x: centre(getAnswer(answers, i.id), points), i }))
      .filter((p) => p.x !== null)
      .map((p) => ({ v: p.i.key * p.x!, w: p.i.weight }));
    out[d] = weightedStats(vals);
  }
  return out;
}
