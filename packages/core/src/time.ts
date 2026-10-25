/** All timestamps are stored as ISO-8601 UTC strings and shown in local time. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** File-name friendly local timestamp, e.g. 20261022-1530. */
export function fileStamp(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}
