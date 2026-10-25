/**
 * Screenshots for docs/用户使用说明.md. Skipped unless DOCS_SHOTS=1:
 *   DOCS_SHOTS=1 npx playwright test e2e/docs-screenshots.spec.ts
 * The people and results are created by the test itself (demo data).
 */
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { INTJ, checkIn, onboard, openProfile, quickTest } from './helpers';

const OUT = fileURLToPath(new URL('../../../docs/images/', import.meta.url));
test.skip(!process.env.DOCS_SHOTS, 'only when generating documentation screenshots');
test.use({ viewport: { width: 1280, height: 800 } });

test('user guide screenshots', async ({ page }) => {
  test.setTimeout(180_000);
  await onboard(page, '示例用户');
  await quickTest(page, '示例用户', INTJ);
  await checkIn(page, '示例用户', 'phq9', 'PHQ9', [1, 1, 0, 1, 0, 0, 0, 0, 0]);
  await checkIn(page, '示例用户', 'phq9', 'PHQ9', [0, 1, 0, 0, 0, 0, 0, 0, 0]);

  await page.goto('/#/');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}home.png` });

  await page.goto('/#/assess');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}assess.png` });

  await page.getByTestId('mode-normal').click();
  await page.getByTestId('start-test').click();
  for (const k of ['5', '3', '6']) await page.keyboard.press(k);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}test.png` });

  await page.goto('/#/history');
  await page.waitForTimeout(300);
  await page.locator('a[href*="/results/"]').first().click();
  await expect(page.getByTestId('type-code')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}result.png` });

  await openProfile(page, '示例用户');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}profile.png`, fullPage: true });

  await page.goto('/#/assess');
  await page.getByTestId('kind-wellbeing').click();
  await page.getByTestId('scale-gad7').click();
  await page.getByTestId('start-test').click();
  await page.getByTestId('opt-GAD7-01-1').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}check.png` });

  await page.goto('/#/history');
  await page.getByTestId('wb-row').first().getByRole('button', { name: '查看' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}check-result.png` });
  await page.getByRole('button', { name: '导出报告' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}report.png` });

  await page.goto('/#/data');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}data.png` });
});
