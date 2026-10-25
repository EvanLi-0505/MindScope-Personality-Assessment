import { B5_DOMAINS, B5_ENGINE, B5_FORMS, type BigFiveFile } from './types';

/** Structural checks for a Big Five bank. Returns problems; empty means valid. */
export function validateBigFive(file: BigFiveFile): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const it of file.items) {
    if (ids.has(it.id)) errors.push(`duplicate item id ${it.id}`);
    ids.add(it.id);
    if (!it.text['zh-CN']?.trim() || !it.text.en?.trim()) errors.push(`${it.id}: needs zh-CN and en text`);
  }
  if (file.scoring.engine !== B5_ENGINE) errors.push(`unsupported engine ${file.scoring.engine}`);
  const [lo, hi] = file.scoring.bands;
  if (!(lo > 1 && lo < hi && hi < 5)) errors.push('bands must satisfy 1 < low < high < 5');
  if (file.options.map((o) => o.value).join() !== '1,2,3,4,5') errors.push('options must be 1..5');
  if (!file.citations.length) errors.push('citations are required');

  const used = new Set<string>();
  for (const formId of B5_FORMS) {
    const form = file.forms[formId];
    if (!form) {
      errors.push(`missing form ${formId}`);
      continue;
    }
    const seen = new Set<string>();
    const perDomain = new Map<string, number>();
    const perFacet = new Map<string, { domain: string; n: number }>();
    for (const e of form.entries) {
      if (!ids.has(e.item)) errors.push(`${formId}: unknown item ${e.item}`);
      if (seen.has(e.item)) errors.push(`${formId}: item ${e.item} used twice`);
      seen.add(e.item);
      used.add(e.item);
      if (!(B5_DOMAINS as readonly string[]).includes(e.domain)) errors.push(`${formId}: bad domain ${e.domain}`);
      if (e.key !== 1 && e.key !== -1) errors.push(`${formId}: bad key on ${e.item}`);
      perDomain.set(e.domain, (perDomain.get(e.domain) ?? 0) + 1);
      if (form.facets) {
        if (!e.facet || e.facet[0] !== e.domain) errors.push(`${formId}: ${e.item} needs a facet of domain ${e.domain}`);
        else {
          const f = perFacet.get(e.facet) ?? { domain: e.domain, n: 0 };
          f.n++;
          perFacet.set(e.facet, f);
        }
      } else if (e.facet) errors.push(`${formId}: facet given in a form without facets`);
    }
    const counts = B5_DOMAINS.map((d) => perDomain.get(d) ?? 0);
    if (counts.some((c) => c !== counts[0] || c === 0)) errors.push(`${formId}: domains must have equal, non-zero item counts (${counts.join('/')})`);
    if (form.facets) {
      const sizes = [...perFacet.values()].map((f) => f.n);
      if (sizes.some((n) => n !== sizes[0])) errors.push(`${formId}: facets must have equal item counts`);
    }
  }
  for (const id of ids) if (!used.has(id)) errors.push(`item ${id} is not used by any form`);
  return errors;
}
