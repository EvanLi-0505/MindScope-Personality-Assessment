import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

type Item = { id: string; target: string; key: number; text: Record<string, string> };
const bank = JSON.parse(readFileSync(fileURLToPath(new URL('../../../packages/banks/ms16/bank-0.1.0.json', import.meta.url)), 'utf-8')) as {
  items: Item[];
};
const byText = new Map(bank.items.map((i) => [i.text['zh-CN'], i]));
const PERSONA: Record<string, number> = { EI: 0.7, SN: 0.6, TF: -0.6, JP: -0.7, Se: 0.8, Fi: 0.6, Ni: -0.6 };

test('production web build from a sub-path: full quick test, reload, offline-only, no AI', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== origin) foreign.push(r.url());
  });

  await page.goto('./');
  // Strict policy: the page may only talk to its own origin.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'self'/);

  await page.getByTestId('onboarding-start').click();
  await page.getByPlaceholder('例如：我自己、小王').fill('发布测试');
  await page.getByTestId('profile-submit').click();
  await expect(page.getByRole('heading', { name: '你好，发布测试' })).toBeVisible();

  await page.goto('./#/assess');
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('start-test').click();
  for (let n = 1; n <= 40; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 40 题`);
    const item = byText.get((await page.getByTestId('question-text').textContent())!.trim())!;
    await page.keyboard.press(String(Math.min(7, Math.max(1, Math.round(4 + 3 * item.key * (PERSONA[item.target] ?? 0))))));
  }
  await page.getByTestId('submit-test').click();
  await page.getByRole('button', { name: '确认提交' }).last().click();
  await expect(page.getByTestId('type-code')).toHaveText('ESFP');

  // Survives a reload (stored in the browser's private file system).
  await page.reload();
  await expect(page.getByTestId('type-code')).toHaveText('ESFP');
  await page.goto('./#/');
  await expect(page.getByTestId('stat-completed').locator('.stat-value')).toHaveText('1');

  // The real web build has no AI and explains why.
  await page.goto('./#/ai');
  await expect(page.getByTestId('ai-web-unavailable')).toBeVisible();

  expect(foreign, 'requests to other origins').toEqual([]);
});
