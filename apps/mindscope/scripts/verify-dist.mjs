// Fails the build if the test-only simulated AI provider ended up in a normal
// build (it is meant to exist only in `vite build --mode e2e`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const MARKERS = ['simulated://local', 'mock-401', 'createSimulatedAi'];
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  }
};
walk(dir);
const hits = files.flatMap((f) => {
  const text = readFileSync(f, 'utf-8');
  return MARKERS.filter((m) => text.includes(m)).map((m) => `${f}: ${m}`);
});
if (hits.length) {
  console.error('verify-dist: test-only code found in the build:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`verify-dist: ok (${files.length} files, no test-only code)`);
