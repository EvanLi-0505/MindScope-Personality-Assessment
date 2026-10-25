import { describe, expect, it } from 'vitest';
import { B5_DOMAINS, B5_FORMS, validateBigFive } from '@mindscope/core';
import { bigFiveBank as b, bigFiveTexts } from '../src';

const byId = new Map(b.items.map((i) => [i.id, i]));
const en = (id: string) => byId.get(id)!.text.en!;
const entry = (form: 'quick' | 'normal' | 'senior', text: string) => b.forms[form].entries.find((e) => en(e.item) === text);

describe('Big Five bank (IPIP, preview)', () => {
  it('is valid', () => {
    expect(validateBigFive(b)).toEqual([]);
  });

  it('has the published sizes: Mini-IPIP 4×5, 50 markers 10×5, IPIP-NEO-120 24×5 with 30 facets of 4', () => {
    const per = (f: (typeof B5_FORMS)[number]) => B5_DOMAINS.map((d) => b.forms[f].entries.filter((e) => e.domain === d).length);
    expect(per('quick')).toEqual([4, 4, 4, 4, 4]);
    expect(per('normal')).toEqual([10, 10, 10, 10, 10]);
    expect(per('senior')).toEqual([24, 24, 24, 24, 24]);
    const facets = new Map<string, number>();
    for (const e of b.forms.senior.entries) facets.set(e.facet!, (facets.get(e.facet!) ?? 0) + 1);
    expect(facets.size).toBe(30);
    expect([...facets.values()].every((n) => n === 4)).toBe(true);
    expect(b.items).toHaveLength(156);
  });

  it('every Mini-IPIP item has the same domain and key as in the 50-item markers', () => {
    for (const q of b.forms.quick.entries) {
      const n = b.forms.normal.entries.find((e) => e.item === q.item);
      expect(n, en(q.item)).toBeDefined();
      expect([n!.domain, n!.key], en(q.item)).toEqual([q.domain, q.key]);
    }
  });

  it('items shared by the 50 markers and the IPIP-NEO-120 agree, except the one known cross-domain item', () => {
    const diffs: string[] = [];
    for (const s of b.forms.senior.entries) {
      const n = b.forms.normal.entries.find((e) => e.item === s.item);
      if (n && (n.domain !== s.domain || n.key !== s.key)) diffs.push(`${en(s.item)} ${n.domain}${n.key} vs ${s.domain}${s.key}`);
    }
    // "Feel others' emotions": Agreeableness in Goldberg's markers, Openness (Emotionality) in Johnson's NEO-120.
    expect(diffs).toEqual(["Feel others' emotions. A1 vs O1"]);
  });

  it('spot checks against the official IPIP keys', () => {
    // Emotional Stability items flip to Neuroticism.
    expect(entry('normal', 'Get stressed out easily.')).toMatchObject({ domain: 'N', key: 1 });
    expect(entry('normal', 'Am relaxed most of the time.')).toMatchObject({ domain: 'N', key: -1 });
    expect(entry('normal', 'Am the life of the party.')).toMatchObject({ domain: 'E', key: 1 });
    expect(entry('normal', 'Feel little concern for others.')).toMatchObject({ domain: 'A', key: -1 });
    expect(entry('normal', 'Am exacting in my work.')).toMatchObject({ domain: 'C', key: 1 });
    expect(entry('normal', 'Use difficult words.')).toMatchObject({ domain: 'O', key: 1 });
    expect(entry('senior', 'Am not easily annoyed.')).toMatchObject({ facet: 'N2', key: -1 });
    expect(entry('senior', 'Rarely overindulge.')).toMatchObject({ facet: 'N5', key: -1 });
    expect(entry('senior', 'Act wild and crazy.')).toMatchObject({ facet: 'E5', key: 1 });
    expect(entry('senior', 'Cheat to get ahead.')).toMatchObject({ facet: 'A2', key: -1 });
    expect(entry('senior', 'Act without thinking.')).toMatchObject({ facet: 'C6', key: -1 });
  });

  it('marks the two adapted items and keeps nothing about voting', () => {
    const adapted = b.items.filter((i) => i.adapted);
    expect(adapted.map((i) => i.adapted!.replaces).sort()).toEqual([
      'Tend to vote for conservative political candidates.',
      'Tend to vote for liberal political candidates.',
    ]);
    expect(adapted.every((i) => b.forms.senior.entries.find((e) => e.item === i.id)?.facet === 'O6')).toBe(true);
    expect(b.items.some((i) => /vote/i.test(i.text.en!))).toBe(false);
  });

  it('every item has a distinct Chinese translation written in Chinese', () => {
    const zh = b.items.map((i) => i.text['zh-CN']);
    expect(new Set(zh).size).toBe(zh.length);
    for (const t of zh) expect(t).toMatch(/^[一-鿿，、。（）“”]+$/u);
  });

  it('has texts for every domain and facet in both languages', () => {
    for (const d of B5_DOMAINS) {
      for (const loc of ['zh-CN', 'en'] as const) {
        const t = bigFiveTexts.domains[d][loc]!;
        for (const k of ['name', 'summary', 'high', 'mid', 'low', 'getAlongHigh', 'getAlongLow'] as const) expect(t[k], `${d} ${loc} ${k}`).toBeTruthy();
      }
    }
    for (const e of b.forms.senior.entries) expect(bigFiveTexts.facets[e.facet!]?.en).toBeTruthy();
  });
});
