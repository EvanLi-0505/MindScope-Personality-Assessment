import { expect, test } from '@playwright/test';
import { ESFP, INFJ, INTJ, SHOTS, addProfile, onboard, openProfile, quickTest } from './helpers';

test.describe.configure({ timeout: 120_000 });

test('person detail: empty state without invented data', async ({ page }) => {
  await onboard(page, '新人');
  await openProfile(page, '新人');
  await expect(page.getByTestId('detail-count')).toHaveText('0');
  await expect(page.getByText('还没有测评记录')).toBeVisible();
  await expect(page.locator('.echart')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}detail-empty.png`, fullPage: true });
});

test('person detail: count, latest type, getting along, trends, compare two results', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await onboard(page, '我自己');
  expect(await quickTest(page, '我自己', INTJ)).toBe('INTJ');
  await openProfile(page, '我自己');
  await expect(page.getByTestId('need-two')).toBeVisible(); // one result → no trend yet

  expect(await quickTest(page, '我自己', INFJ)).toBe('INFJ');
  await openProfile(page, '我自己');
  await expect(page.getByTestId('detail-count')).toHaveText('2');
  await expect(page.getByTestId('detail-latest-type')).toHaveText('INFJ');
  await expect(page.getByTestId('get-along')).toContainText('真诚地交流');
  await expect(page.getByTestId('need-two')).toHaveCount(0);
  await expect(page.getByTestId('result-row')).toHaveCount(2);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}detail-two.png`, fullPage: true });

  // Compare both results.
  for (const box of await page.getByTestId('result-row').locator('.n-checkbox').all()) await box.click();
  await page.getByTestId('compare-selected').click();
  await expect(page).toHaveURL(/#\/compare\?ids=/);
  await expect(page.getByTestId('comparable')).toBeVisible();
  await expect(page.getByTestId('compare-summary')).toHaveText('在 T/F 上倾向不同。');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}compare-self.png`, fullPage: true });
});

test('history: filters, cross-person comparison and deleting one record', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await onboard(page, '甲');
  await addProfile(page, '乙');
  expect(await quickTest(page, '甲', INTJ)).toBe('INTJ');
  expect(await quickTest(page, '乙', ESFP)).toBe('ESFP'); // picking 乙 must stick

  await page.goto('/#/history');
  await expect(page.getByTestId('history-total')).toHaveText('共 2 次测评');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}history.png`, fullPage: true });

  // Filter to one person.
  await page.getByTestId('filter-people').click();
  await page.locator('.n-base-select-option').filter({ hasText: '乙' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('history-total')).toHaveText('共 1 次测评');
  await expect(page.getByTestId('result-row')).toContainText('ESFP');
  await page.getByRole('button', { name: '重置' }).click();
  await expect(page.getByTestId('history-total')).toHaveText('共 2 次测评');

  // Compare two different people.
  for (const box of await page.getByTestId('result-row').locator('.n-checkbox').all()) await box.click();
  await page.getByTestId('compare-selected').click();
  await expect(page.getByTestId('note-different_people')).toBeVisible();
  await expect(page.getByText('和 甲 相处时')).toBeVisible();
  await expect(page.getByText('和 乙 相处时')).toBeVisible();
  await expect(page.getByTestId('compare-summary')).toContainText('E/I');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}compare-people.png`, fullPage: true });

  // Delete 乙's record from the history list.
  await page.goto('/#/history');
  await page.getByTestId('result-row').filter({ hasText: 'ESFP' }).getByLabel('删除这次记录').click();
  await page.getByRole('button', { name: '删除' }).last().click();
  await expect(page.getByTestId('history-total')).toHaveText('共 1 次测评');
  await openProfile(page, '甲');
  await expect(page.getByTestId('detail-count')).toHaveText('1'); // the other person is untouched
});

test('avatar picture: upload, persist, reject non-images', async ({ page }) => {
  await onboard(page, '头像');
  await page.goto('/#/profiles');
  await page.getByTestId('profile-card').getByLabel('编辑').click();

  // A 400×300 PNG generated in the page, so the test needs no fixture file.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5B4FE0';
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#2BA88F';
    g.fillRect(100, 50, 200, 200);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByTestId('avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.avatar-picker img')).toBeVisible();
  await page.getByTestId('profile-submit').click();
  await expect(page).toHaveURL(/#\/profiles$/);
  await page.reload();
  await expect(page.getByTestId('profile-card').locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);

  await page.getByTestId('profile-card').getByLabel('编辑').click();
  await page.getByTestId('avatar-file').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('请选择 PNG、JPG 或 WebP 图片。')).toBeVisible();
});
