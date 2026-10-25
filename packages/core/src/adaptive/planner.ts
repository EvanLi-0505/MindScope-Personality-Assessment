/**
 * Adaptive item selection, modelled on the capstone "AI Adaptive Exam":
 *  - the total number of questions is fixed per mode;
 *  - the next question is chosen only when the user moves past the last one drawn;
 *  - questions already drawn never change (going back and editing an answer only
 *    affects questions drawn later).
 *
 * The capstone raised/lowered difficulty after right/wrong answers. Personality
 * items have no right answer, so instead the next dimension item goes to the
 * dimension whose estimate is currently LEAST certain:
 *
 *     U_d = SE_d / max(|S_d|, 0.05)      (n < 2 answers → U_d = ∞)
 *
 * Every decision is a pure function of (bank, mode, seed, drawn sequence, answers),
 * so a session can be resumed or replayed exactly.
 */
import type { B5Domain } from '../bigfive/types';
import { DIMENSIONS, FUNCTIONS, itemsForMode, plannedCount, type BankFile, type BankItem, type CogFunction, type Dimension, type ModeId, type Target } from '../bank/types';
import { liveDimensionEstimate, type Answers } from '../scoring/mbti';
import { derive, shuffle } from './random';

export type DrawReason = 'warmup' | 'adaptive' | 'function' | 'full';

export interface SequenceEntry {
  itemId: string;
  /** 'total' for fixed questionnaires (wellbeing scales); a Big Five domain letter for Big Five forms. */
  target: Target | 'total' | B5Domain;
  reason: DrawReason;
  /** U_d of the chosen dimension when the item was drawn (null = not enough data yet). */
  uncertainty?: number | null;
}

export type PlannerBank = Pick<BankFile, 'items' | 'modes' | 'scales'>;

const MIN_DENOMINATOR = 0.05;
const SALT_ORDER = 1;
const SALT_FUNCS = 2;
const SALT_WARMUP = 3;
const SALT_POSITION = 100;

function pointsOf(bank: PlannerBank): number {
  const first = bank.items[0];
  return (first && bank.scales[first.scale]?.points) || 7;
}

/** Positions of function items, spread evenly; position 0 is always a dimension item. */
export function slotTemplate(total: number, functionSlots: number): ('dim' | 'func')[] {
  return Array.from({ length: total }, (_, i) =>
    Math.floor(((i + 1) * functionSlots) / total) > Math.floor((i * functionSlots) / total) ? 'func' : 'dim',
  );
}

/** Interleaves groups round by round so consecutive items rarely share a target. */
function roundRobin<T>(groups: T[][], rnd: () => number): T[] {
  const out: T[] = [];
  const queues = groups.map((g) => [...g]);
  while (queues.some((q) => q.length)) {
    for (const q of shuffle(queues.filter((x) => x.length), rnd)) out.push(q.shift()!);
  }
  return out;
}

/** Full mode: every item once, shuffled within targets, targets interleaved. */
export function fullOrder(bank: PlannerBank, mode: ModeId, seed: number): BankItem[] {
  const rnd = derive(seed, SALT_ORDER);
  const pool = itemsForMode(bank, mode);
  const targets = [...new Set(pool.map((i) => i.target))];
  return roundRobin(targets.map((t) => shuffle(pool.filter((i) => i.target === t), rnd)), rnd);
}

/** Fixed function items for a mode: `per` items each, reverse-keyed share kept proportional. */
export function functionOrder(bank: PlannerBank, mode: ModeId, seed: number): BankItem[] {
  const per = bank.modes[mode].functions?.per ?? 0;
  if (!per) return [];
  const rnd = derive(seed, SALT_FUNCS);
  const pool = itemsForMode(bank, mode);
  const groups = FUNCTIONS.map((f: CogFunction) => {
    const items = shuffle(pool.filter((i) => i.target === f), rnd);
    const reverse = items.filter((i) => i.key === -1);
    const forward = items.filter((i) => i.key === 1);
    const nReverse = Math.min(reverse.length, Math.round((per * reverse.length) / Math.max(items.length, 1)));
    const picked = [...reverse.slice(0, nReverse), ...forward.slice(0, per - nReverse)];
    // Not enough of one kind: top up with whatever is left.
    for (const i of items) if (picked.length < per && !picked.includes(i)) picked.push(i);
    return shuffle(picked, rnd);
  });
  return roundRobin(groups, rnd);
}

/** Warm-up: `min` rounds, each a shuffled order of the four dimensions. */
function warmupOrder(min: number, seed: number): Dimension[] {
  const rnd = derive(seed, SALT_WARMUP);
  return Array.from({ length: min }, () => shuffle(DIMENSIONS, rnd)).flat();
}

/** Picks an unused item of `target`, keeping +1/−1 items balanced, highest weight first. */
function chooseItem(pool: BankItem[], target: Target, used: Set<string>, rnd: () => number): BankItem | null {
  const available = pool.filter((i) => i.target === target && !used.has(i.id));
  if (!available.length) return null;
  const usedOfTarget = pool.filter((i) => i.target === target && used.has(i.id));
  const plus = usedOfTarget.filter((i) => i.key === 1).length;
  const minus = usedOfTarget.length - plus;
  const prefer = plus === minus ? (rnd() < 0.5 ? 1 : -1) : plus < minus ? 1 : -1;
  const preferred = available.filter((i) => i.key === prefer);
  const candidates = preferred.length ? preferred : available;
  const best = Math.max(...candidates.map((i) => i.weight));
  const top = candidates.filter((i) => i.weight === best);
  return top[Math.floor(rnd() * top.length)]!;
}

/**
 * The next question to show, or null when the planned number is reached.
 * Call it only when the user moves forward from the last drawn question.
 */
export function nextEntry(
  bank: PlannerBank,
  mode: ModeId,
  seed: number,
  sequence: readonly SequenceEntry[],
  answers: Answers,
): SequenceEntry | null {
  const cfg = bank.modes[mode];
  const total = plannedCount(bank, mode);
  const position = sequence.length;
  if (position >= total) return null;

  if (cfg.all || !cfg.adaptive) {
    const item = fullOrder(bank, mode, seed)[position];
    return item ? { itemId: item.id, target: item.target, reason: 'full' } : null;
  }

  const pool = itemsForMode(bank, mode);
  const per = cfg.functions?.per ?? 0;
  const template = slotTemplate(total, per * FUNCTIONS.length);

  if (template[position] === 'func') {
    const index = sequence.filter((e) => e.reason === 'function').length;
    const item = functionOrder(bank, mode, seed)[index];
    return item ? { itemId: item.id, target: item.target, reason: 'function' } : null;
  }

  const dims = cfg.dimensions!;
  const used = new Set(sequence.map((e) => e.itemId));
  const rnd = derive(seed, SALT_POSITION + position);
  const dimEntries = sequence.filter((e) => e.reason === 'warmup' || e.reason === 'adaptive');
  const warmup = warmupOrder(dims.min, seed);

  if (dimEntries.length < warmup.length) {
    const target = warmup[dimEntries.length]!;
    const item = chooseItem(pool, target, used, rnd);
    return item ? { itemId: item.id, target, reason: 'warmup', uncertainty: null } : null;
  }

  // Adaptive part: least certain dimension first.
  const byId = new Map(pool.map((i) => [i.id, i]));
  const drawnDimItems = dimEntries.map((e) => byId.get(e.itemId)).filter((i): i is BankItem => !!i);
  const live = liveDimensionEstimate(drawnDimItems, answers, pointsOf(bank));
  const counts = Object.fromEntries(DIMENSIONS.map((d) => [d, drawnDimItems.filter((i) => i.target === d).length])) as Record<Dimension, number>;

  const candidates = DIMENSIONS.filter(
    (d) => counts[d] < dims.max && pool.some((i) => i.target === d && !used.has(i.id)),
  ).map((d) => {
    const st = live[d];
    const u = !st || st.n < 2 ? Number.POSITIVE_INFINITY : st.se / Math.max(Math.abs(st.mean), MIN_DENOMINATOR);
    return { d, u, n: counts[d], tie: rnd() };
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.u - a.u || a.n - b.n || a.tie - b.tie);
  const chosen = candidates[0]!;
  const item = chooseItem(pool, chosen.d, used, rnd);
  return item
    ? { itemId: item.id, target: chosen.d, reason: 'adaptive', uncertainty: Number.isFinite(chosen.u) ? chosen.u : null }
    : null;
}

export interface ModeSummary {
  mode: ModeId;
  total: number;
  dimensionItems: number;
  functionItems: number;
  adaptive: boolean;
}

export function modeSummary(bank: PlannerBank, mode: ModeId): ModeSummary {
  const cfg = bank.modes[mode];
  const total = plannedCount(bank, mode);
  const fnItems = cfg.all ? itemsForMode(bank, mode).filter((i) => (FUNCTIONS as readonly string[]).includes(i.target)).length : (cfg.functions?.per ?? 0) * FUNCTIONS.length;
  return { mode, total, dimensionItems: total - fnItems, functionItems: fnItems, adaptive: !!cfg.adaptive && !cfg.all };
}
