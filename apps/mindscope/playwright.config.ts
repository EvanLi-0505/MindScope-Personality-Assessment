import { defineConfig } from '@playwright/test';

// Runs against a production-mode web build (vite preview), so the strict CSP
// is exercised too. Uses the system Edge, so no browser download is needed.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
  // The test build (mode "e2e") is the production build plus a local stand-in
  // for the AI provider, so AI screens can be tested without any network.
  webServer: {
    command: 'npm run build:e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
