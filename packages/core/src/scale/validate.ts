import type { BankIssue } from '../bank/validate';
import { optionRange, scoreRange, type ScaleFile } from './types';

/** Checks a wellbeing scale file: ids, options, texts, and that bands cover every possible score exactly once. */
export function validateScale(scale: ScaleFile): BankIssue[] {
  const issues: BankIssue[] = [];
  const err = (code: string, message: string, itemId?: string) => issues.push({ level: 'error', code, message, itemId });
  const warn = (code: string, message: string, itemId?: string) => issues.push({ level: 'warning', code, message, itemId });

  if (scale.kind !== 'wellbeing') err('kind', 'kind must be "wellbeing"');
  if (!/^\d+\.\d+\.\d+$/.test(scale.version)) err('version', 'version must be semver');
  for (const field of ['title', 'description', 'instructions', 'source', 'licenseNote'] as const) {
    if (!scale[field]?.['zh-CN']?.trim()) err('text', `${field} needs zh-CN text`);
    else if (!scale[field]?.en?.trim()) warn('text_en', `${field} has no English text`);
  }
  if (!scale.citation?.trim()) err('citation', 'citation is required');

  const values = scale.options.map((o) => o.value);
  if (values.length < 2) err('options', 'at least two options are needed');
  if (new Set(values).size !== values.length) err('options', 'option values must be unique');
  if (values.some((v) => !Number.isInteger(v))) err('options', 'option values must be integers');
  for (const o of scale.options) if (!o.label['zh-CN']) err('options', `option ${o.value} needs a label`);

  const ids = new Set<string>();
  for (const item of scale.items) {
    if (ids.has(item.id)) err('duplicate_id', `duplicate id ${item.id}`, item.id);
    ids.add(item.id);
    if (!item.text['zh-CN']?.trim()) err('text', 'item needs zh-CN text', item.id);
    else if (!item.text.en?.trim()) warn('text_en', 'item has no English text', item.id);
  }
  if (!scale.items.length) err('items', 'no items');

  const s = scale.scoring;
  if (s.engine !== 'sum@1') err('engine', `unknown engine ${s.engine}`);
  if (!(s.multiplier > 0)) err('multiplier', 'multiplier must be > 0');
  for (const id of s.safety?.itemIds ?? []) if (!ids.has(id)) err('safety', `unknown safety item ${id}`);

  // Bands: sorted, no gaps, no overlaps, covering every reachable score.
  if (values.length >= 2 && scale.items.length) {
    const [lo, hi] = optionRange(scale);
    const [min, max] = scoreRange(scale);
    const step = s.multiplier;
    const reachable: number[] = [];
    for (let raw = lo * scale.items.length; raw <= hi * scale.items.length; raw++) reachable.push(raw * step);
    for (const score of reachable) {
      const hits = s.bands.filter((b) => score >= b.min && score <= b.max).length;
      if (hits === 0) err('bands', `score ${score} falls in no band`);
      if (hits > 1) err('bands', `score ${score} falls in ${hits} bands`);
    }
    if (s.bands.some((b) => b.min < min || b.max > max)) warn('bands', `bands extend beyond the score range ${min}–${max}`);
  }
  for (const b of s.bands) {
    if (!b.label['zh-CN'] || !b.summary['zh-CN']) err('bands', `band ${b.key} needs zh-CN label and summary`);
  }
  return issues;
}
