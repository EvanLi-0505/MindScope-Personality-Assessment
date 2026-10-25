import { describe, expect, it } from 'vitest';
import zhCN from './zh-CN';
import en from './en';

type Tree = { [k: string]: string | string[] | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else if (Array.isArray(v)) v.forEach((s, i) => out.set(`${key}.${i}`, s));
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const zh = flatten(zhCN as unknown as Tree);
const english = flatten(en as unknown as Tree);

describe('i18n messages', () => {
  it('both languages have exactly the same keys', () => {
    expect([...english.keys()].sort()).toEqual([...zh.keys()].sort());
  });

  // vue-i18n treats "|" as a plural separator and "@" as a linked message:
  // a stray one silently truncates the text on screen.
  it.each([...zh, ...english].map(([k, v]) => [k, v]))('%s has no unescaped | or @', (_k, v) => {
    expect(v).not.toMatch(/[|@]/);
  });

  it('placeholders match between languages', () => {
    for (const [key, text] of zh) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(english.get(key) ?? ''), key).toEqual(names(text));
    }
  });
});
