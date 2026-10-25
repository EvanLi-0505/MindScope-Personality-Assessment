// Development tool: serves a built web app from a sub-path, like a typical
// static host (e.g. https://example.org/mindscope/). Used by the release E2E.
//
//   node scripts/serve-static.mjs <dir> <port> </sub/path/>
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dirArg = 'dist', portArg = '4174', baseArg = '/mindscope/'] = process.argv.slice(2);
const root = resolve(dirArg);
const base = baseArg.endsWith('/') ? baseArg : `${baseArg}/`;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/' || url.pathname === base.slice(0, -1)) {
    res.writeHead(302, { location: base }).end();
    return;
  }
  if (!url.pathname.startsWith(base)) {
    res.writeHead(404).end('not found');
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(Number(portArg), '127.0.0.1', () => console.log(`serving ${root} at http://localhost:${portArg}${base}`));
