import { describe, expect, it } from 'vitest';
import { isUuid, uuidv7, uuidv7Time } from '../src/ids';

describe('uuidv7', () => {
  it('produces RFC-shaped v7 ids', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('encodes the timestamp', () => {
    const t = Date.now() + 3_600_000; // ahead of any id generated so far
    expect(uuidv7Time(uuidv7(t))).toBe(t);
  });

  it('is strictly increasing even within the same millisecond', () => {
    const t = Date.now() + 10_000;
    const ids = Array.from({ length: 500 }, () => uuidv7(t));
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
