// Rasterises the brand SVG and lets the Tauri CLI produce every icon size
// (icon.ico for the exe, PNGs for future mobile builds).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const svg = resolve(here, '../../../assets/brand/mindscope-icon.svg');
const outDir = resolve(here, '../src-tauri/icons');
const png = resolve(here, '../src-tauri/icons/source-1024.png');

mkdirSync(outDir, { recursive: true });
await sharp(svg, { density: 512 }).resize(1024, 1024).png().toFile(png);
execFileSync('npx', ['tauri', 'icon', png, '-o', outDir], { stdio: 'inherit', shell: true, cwd: resolve(here, '..') });
console.log('icons written to', outDir);
