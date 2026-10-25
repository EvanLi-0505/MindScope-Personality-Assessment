import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from '../src';

describe('sha256Hex', () => {
  it('matches the FIPS test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('handles multi-block UTF-8 input', () => {
    const s = '心理'.repeat(100);
    expect(sha256Hex(s)).toBe(sha256Hex(new TextEncoder().encode(s)));
    expect(sha256Hex(s)).toHaveLength(64);
  });

  it('canonical JSON ignores key order', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
});
