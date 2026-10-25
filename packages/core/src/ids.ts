/**
 * UUID v7 (RFC 9562): 48-bit Unix millisecond timestamp + random bits.
 * Time-ordered, so primary keys sort by creation time and records from
 * different devices can be merged later without collisions.
 */

let lastMs = -1;
let lastSeq = 0;

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);

  if (nowMs < lastMs) nowMs = lastMs; // clock went backwards: never go back in time

  // Keep ids monotonic within the same millisecond: a 12-bit counter goes
  // into the rand_a field (bytes 6-7).
  if (nowMs === lastMs) {
    lastSeq = (lastSeq + 1) & 0x0fff;
    if (lastSeq === 0) nowMs = lastMs + 1; // counter overflow: borrow the next ms
  } else {
    lastSeq = 0;
  }
  lastMs = nowMs;

  const ms = BigInt(nowMs);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = 0x70 | ((lastSeq >> 8) & 0x0f); // version 7
  bytes[7] = lastSeq & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Milliseconds encoded in a v7 id. */
export function uuidv7Time(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
