import { defineConfig } from '@playwright/test';

// Release check: the real production web build (`npm run build`, the same
// files as the web release zip), served from a sub-path like a static host.
export default defineConfig({
  testDir: './e2e-release',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174/mindscope/',
    channel: 'msedge',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node scripts/serve-static.mjs dist 4174 /mindscope/',
    url: 'http://localhost:4174/mindscope/',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
