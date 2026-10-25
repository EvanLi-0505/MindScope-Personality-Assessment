import {
  DIMENSIONS,
  FUNCTIONS,
  MODE_IDS,
  isDimension,
  isFunction,
  itemsForMode,
  type BankFile,
  type BankItem,
  type Target,
} from './types';

export interface BankIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  itemId?: string;
}

/** Share of +1 items each dimension must stay within (controls acquiescence bias). */
const DIM_KEY_BALANCE: [number, number] = [0.35, 0.65];
/** Below this share of reverse-keyed items a function gets a warning. */
const FUNC_MIN_REVERSE = 0.15;
const NEAR_DUPLICATE = 0.85;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function trigrams(text: string): Set<string> {
  const chars = [...text];
  const set = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i++) set.add(chars.slice(i, i + 3).join(''));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function validateBank(bank: BankFile): BankIssue[] {
  const issues: BankIssue[] = [];
  const err = (code: string, message: string, itemId?: string) => issues.push({ level: 'error', code, message, itemId });
  const warn = (code: string, message: string, itemId?: string) => issues.push({ level: 'warning', code, message, itemId });

  if (!bank.instrument?.trim()) err('instrument', 'instrument is required');
  if (!/^\d+\.\d+\.\d+$/.test(bank.version ?? '')) err('version', `version must be semver, got "${bank.version}"`);
  const s = bank.scoring;
  if (!s?.engine) err('scoring', 'scoring.engine is required');
  else {
    const [b0, b1, b2] = s.bands;
    if (!(0 <= b0 && b0 < b1 && b1 < b2 && b2 <= 1)) err('scoring', 'scoring.bands must be increasing within [0,1]');
    if (s.balancedThreshold !== b0) warn('scoring', 'balancedThreshold usually equals bands[0]');
    if (!(s.minAnsweredRatio > 0 && s.minAnsweredRatio <= 1)) err('scoring', 'minAnsweredRatio must be in (0,1]');
  }

  // ── items ──
  const ids = new Set<string>();
  for (const item of bank.items) {
    if (!/^[A-Za-z0-9-]+$/.test(item.id)) err('item_id', `invalid id "${item.id}"`, item.id);
    if (ids.has(item.id)) err('duplicate_id', `duplicate id ${item.id}`, item.id);
    ids.add(item.id);
    if (!isDimension(item.target) && !isFunction(item.target)) err('target', `unknown target ${item.target}`, item.id);
    if (item.key !== 1 && item.key !== -1) err('key', 'key must be 1 or -1', item.id);
    if (!(item.weight > 0)) err('weight', 'weight must be > 0', item.id);
    if (!bank.scales[item.scale]) err('scale', `unknown scale ${item.scale}`, item.id);
    if (!item.text?.['zh-CN']?.trim()) err('text', 'zh-CN text is required', item.id);
    if (!item.text?.en?.trim()) warn('text_en', 'English text missing', item.id);
    for (const m of item.modes ?? []) if (!(MODE_IDS as readonly string[]).includes(m)) err('modes', `unknown mode ${m}`, item.id);
  }
  for (const [id, sc] of Object.entries(bank.scales)) {
    for (const [loc, labels] of Object.entries(sc.labels)) {
      if (labels.length !== sc.points) err('scale', `scale ${id} (${loc}) needs ${sc.points} labels`);
    }
  }

  // ── key balance ──
  const enabled = bank.items.filter((i) => i.enabled);
  const byTarget = new Map<Target, BankItem[]>();
  for (const i of enabled) byTarget.set(i.target, [...(byTarget.get(i.target) ?? []), i]);
  for (const d of DIMENSIONS) {
    const list = byTarget.get(d) ?? [];
    if (!list.length) {
      err('coverage', `no items for ${d}`);
      continue;
    }
    const share = list.filter((i) => i.key === 1).length / list.length;
    if (share < DIM_KEY_BALANCE[0] || share > DIM_KEY_BALANCE[1]) {
      err('key_balance', `${d}: ${(share * 100).toFixed(0)}% of items are +1 keyed (allowed 35%–65%)`);
    }
  }
  for (const f of FUNCTIONS) {
    const list = byTarget.get(f) ?? [];
    if (!list.length) {
      err('coverage', `no items for ${f}`);
      continue;
    }
    const reverse = list.filter((i) => i.key === -1).length / list.length;
    if (reverse < FUNC_MIN_REVERSE) warn('key_balance', `${f}: only ${(reverse * 100).toFixed(0)}% reverse-keyed items`);
  }

  // ── modes are feasible ──
  for (const m of MODE_IDS) {
    const cfg = bank.modes[m];
    if (!cfg) {
      err('mode', `mode ${m} missing`);
      continue;
    }
    const pool = itemsForMode(bank, m);
    if (cfg.all) {
      if (!pool.length) err('mode', `mode ${m} has no items`);
      continue;
    }
    const d = cfg.dimensions;
    if (d) {
      if (d.min > d.max) err('mode', `${m}: dimensions.min > max`);
      if (d.total < d.min * DIMENSIONS.length || d.total > d.max * DIMENSIONS.length) {
        err('mode', `${m}: dimensions.total must be between 4×min and 4×max`);
      }
      for (const dim of DIMENSIONS) {
        const n = pool.filter((i) => i.target === dim).length;
        if (n < d.max) err('mode', `${m}: ${dim} has ${n} items, needs ${d.max}`);
      }
    }
    if (cfg.functions) {
      for (const f of FUNCTIONS) {
        const n = pool.filter((i) => i.target === f).length;
        if (n < cfg.functions.per) err('mode', `${m}: ${f} has ${n} items, needs ${cfg.functions.per}`);
      }
    }
  }

  // ── duplicate wording (per language) ──
  for (const loc of ['zh-CN', 'en']) {
    const texts = enabled
      .map((i) => ({ id: i.id, norm: normalize(i.text[loc] ?? '') }))
      .filter((t) => t.norm.length > 0);
    const seen = new Map<string, string>();
    for (const t of texts) {
      const prev = seen.get(t.norm);
      if (prev) err('duplicate_text', `${loc}: same wording as ${prev}`, t.id);
      else seen.set(t.norm, t.id);
    }
    const grams = texts.map((t) => ({ id: t.id, g: trigrams(t.norm) }));
    for (let a = 0; a < grams.length; a++) {
      for (let b = a + 1; b < grams.length; b++) {
        const sim = jaccard(grams[a]!.g, grams[b]!.g);
        if (sim >= NEAR_DUPLICATE && sim < 1) {
          warn('near_duplicate', `${loc}: ${grams[a]!.id} and ${grams[b]!.id} are ${(sim * 100).toFixed(0)}% similar`, grams[b]!.id);
        }
      }
    }
  }

  return issues;
}
