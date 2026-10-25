import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { INTJ, SHOTS, addProfile, onboard, quickTest } from './helpers';

test('web backup: download a .db file, change data, restore it, data is back to the backup', async ({ page }) => {
  await onboard(page, '备份者');
  await quickTest(page, '备份者', INTJ);

  // 1. Download a backup.
  await page.goto('/#/data');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-now').click()]);
  expect(download.suggestedFilename()).toMatch(/^mindscope-backup-\d{8}-\d{4}\.db$/);
  const file = join(SHOTS, '..', 'backup-test.db');
  await download.saveAs(file);

  // 2. Change the data afterwards.
  await addProfile(page, '后来加的人');
  await expect(page.getByTestId('open-profile')).toHaveCount(2);

  // 3. Restore. The app first downloads a safety backup of the current data.
  await page.goto('/#/data');
  const safety = page.waitForEvent('download');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText(/覆盖当前数据/)).toBeVisible();
  await page.getByRole('button', { name: '确认' }).last().click();
  expect((await safety).suggestedFilename()).toMatch(/before-restore\.db$/);
  await expect(page.getByText('已恢复，正在重新加载…')).toBeVisible();
  await page.waitForLoadState('load');

  // 4. Back to the backup: one person, with their result.
  await page.goto('/#/profiles');
  await expect(page.getByTestId('open-profile')).toHaveCount(1);
  await expect(page.getByTestId('open-profile')).toContainText('备份者');
  await page.goto('/#/history');
  await expect(page.getByTestId('history-total')).toHaveText('共 1 次测评');
});

test('web restore rejects a file that is not a MindScope database and keeps the data', async ({ page }) => {
  await onboard(page, '保留者');
  const bad = join(SHOTS, '..', 'not-a-db.db');
  writeFileSync(bad, 'hello, this is not sqlite');
  await page.goto('/#/data');
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('input[type=file]').setInputFiles(bad);
  await page.getByRole('button', { name: '确认' }).last().click();
  await expect(page.getByText('这不是有效的 MindScope 备份文件')).toBeVisible();
  // Rejected before anything changes, so no safety backup was needed.
  expect(downloads).toBe(0);
  await page.goto('/#/profiles');
  await expect(page.getByTestId('open-profile')).toContainText('保留者');
});
