import { describe, expect, it } from 'vitest';
import { validateBank } from '../src';
import { makeBank } from './fixtures';

const errors = (bank: ReturnType<typeof makeBank>) => validateBank(bank).filter((i) => i.level === 'error');

describe('validateBank', () => {
  it('accepts a well-formed bank', () => {
    expect(errors(makeBank())).toEqual([]);
  });

  it('flags duplicate ids and unknown targets', () => {
    const bank = makeBank();
    bank.items[1]!.id = bank.items[0]!.id;
    (bank.items[2] as { target: string }).target = 'XX';
    const codes = errors(bank).map((e) => e.code);
    expect(codes).toContain('duplicate_id');
    expect(codes).toContain('target');
  });

  it('flags unbalanced keying', () => {
    const bank = makeBank();
    for (const i of bank.items.filter((x) => x.target === 'EI')) i.key = 1;
    expect(errors(bank).some((e) => e.code === 'key_balance')).toBe(true);
  });

  it('flags modes that need more items than the bank has', () => {
    const bank = makeBank(10, 3);
    const codes = errors(bank).filter((e) => e.code === 'mode').map((e) => e.message);
    expect(codes.some((m) => m.includes('normal'))).toBe(true);
  });

  it('flags identical wording, ignoring punctuation and case', () => {
    const bank = makeBank();
    bank.items[5]!.text = { ...bank.items[4]!.text, en: `${bank.items[4]!.text.en!.toUpperCase()}!!` };
    expect(errors(bank).some((e) => e.code === 'duplicate_text')).toBe(true);
  });

  it('requires zh-CN text and warns on missing English', () => {
    const bank = makeBank();
    bank.items[0]!.text = { 'zh-CN': '' };
    const issues = validateBank(bank);
    expect(issues.some((e) => e.level === 'error' && e.code === 'text')).toBe(true);
    expect(issues.some((e) => e.level === 'warning' && e.code === 'text_en')).toBe(true);
  });
});
