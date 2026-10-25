import { expect, test } from '@playwright/test';
import { SHOTS, checkIn, onboard, openProfile, quickTest, INTJ } from './helpers';

test('PHQ-9: item 9 above zero shows crisis resources on the form, result and report', async ({ page }) => {
  await onboard(page, '小林');
  // 2+2+1×6 + item 9 = 1 → 11 (moderate, seek help)
  await checkIn(page, '小林', 'phq9', 'PHQ9', [2, 2, 1, 1, 1, 1, 1, 1, 1], { expectSafety: true });
  await expect(page.getByTestId('wb-score')).toHaveText('11 / 27');
  await expect(page.getByTestId('wb-band')).toHaveText('中度');
  await expect(page.getByTestId('safety-card')).toBeVisible();
  await expect(page.getByTestId('safety-card')).toContainText('12356');
  await expect(page.getByTestId('wb-need-two')).toBeVisible();

  await page.getByRole('button', { name: '导出报告' }).click();
  await expect(page).toHaveURL(/#\/report\/wellbeing\//);
  await expect(page.getByTestId('report-title')).toHaveText('心理状态自评报告');
  await expect(page.getByTestId('report-person')).toHaveText('小林');
  await expect(page.getByTestId('report-score')).toHaveText('11 / 27');
  await expect(page.getByTestId('safety-card')).toBeVisible();
  await expect(page.getByTestId('report-answers').locator('tr')).toHaveCount(9);
  await expect(page.getByTestId('report-source')).toContainText('Kroenke');
  // Answers are optional; source and safety information are not.
  await page.getByTestId('toggle-answers').click();
  await expect(page.getByTestId('report-answers')).toHaveCount(0);
  await expect(page.getByTestId('report-source')).toBeVisible();
  await page.getByTestId('toggle-answers').click();
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `${SHOTS}report-phq9-print.png`, fullPage: true });
});

test('PHQ-9 without item 9: no crisis card, mild band', async ({ page }) => {
  await onboard(page, '小周');
  await checkIn(page, '小周', 'phq9', 'PHQ9', [1, 1, 1, 1, 1, 1, 0, 0, 0]);
  await expect(page.getByTestId('wb-score')).toHaveText('6 / 27');
  await expect(page.getByTestId('wb-band')).toHaveText('轻度');
  await expect(page.getByTestId('safety-card')).toHaveCount(0);
  await expect(page.getByTestId('seek-help')).toHaveCount(0);
});

test('a check-in cannot be submitted half done, and can be resumed later', async ({ page }) => {
  await onboard(page, '小吴');
  await page.goto('/#/assess');
  await page.getByTestId('kind-wellbeing').click();
  await page.getByTestId('scale-gad7').click();
  await page.getByTestId('start-test').click();
  for (const n of [1, 2, 3]) await page.getByTestId(`opt-GAD7-0${n}-2`).click();
  await page.getByTestId('check-submit').click();
  await expect(page.getByText('请回答全部题目后再提交')).toBeVisible();
  await expect(page).toHaveURL(/#\/check\//);

  await page.goto('/');
  await page.getByTestId('resume-row').filter({ hasText: '心理状态自评' }).click();
  await expect(page).toHaveURL(/#\/check\//);
  await expect(page.getByTestId('check-progress')).toHaveText('已答 3 / 7 题');
  for (const n of [4, 5, 6, 7]) await page.getByTestId(`opt-GAD7-0${n}-0`).click();
  await page.getByTestId('check-submit').click();
  await page.getByRole('button', { name: '提交' }).last().click();
  await expect(page.getByTestId('wb-score')).toHaveText('6 / 21');
});

test('GAD-7, WHO-5 (×4) and the stress check score as documented', async ({ page }) => {
  await onboard(page, '阿青');
  await checkIn(page, '阿青', 'gad7', 'GAD7', [3, 3, 3, 3, 3, 3, 3]);
  await expect(page.getByTestId('wb-score')).toHaveText('21 / 21');
  await expect(page.getByTestId('wb-band')).toHaveText('重度');
  await expect(page.getByTestId('seek-help')).toBeVisible();

  // WHO-5: every answer "3" → raw 15 → 60 / 100, at or above the reference line
  await checkIn(page, '阿青', 'who5', 'WHO5', [3, 3, 3, 3, 3]);
  await expect(page.getByTestId('wb-score')).toHaveText('60 / 100');
  await expect(page.getByTestId('wb-band')).toHaveText('达到参考线');

  // Stress: 7 × 2 + 3 reversed (4 − 2) × 2 = 20 → medium
  await checkIn(page, '阿青', 'ms-stress', 'STR', [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  await expect(page.getByTestId('wb-score')).toHaveText('20 / 40');
  await expect(page.getByTestId('wb-band')).toHaveText('压力感中等');
});

test('person card shows wellbeing records and trends apart from personality; history lists and deletes them', async ({ page }) => {
  await onboard(page, '老陈');
  await quickTest(page, '老陈', INTJ);
  await checkIn(page, '老陈', 'phq9', 'PHQ9', [2, 2, 2, 2, 1, 1, 1, 1, 0]);
  await checkIn(page, '老陈', 'phq9', 'PHQ9', [1, 1, 0, 0, 1, 0, 0, 0, 0]);
  await checkIn(page, '老陈', 'who5', 'WHO5', [4, 4, 3, 3, 4]);

  await openProfile(page, '老陈');
  const wb = page.getByTestId('wb-section');
  await expect(wb.getByTestId('wb-latest-phq9')).toContainText('3');
  await expect(wb.getByTestId('wb-latest-phq9')).toContainText('极轻微');
  await expect(wb.getByTestId('wb-latest-who5')).toContainText('72');
  await expect(wb.locator('.echart')).toHaveCount(1); // only PHQ-9 has two results
  await wb.screenshot({ path: `${SHOTS}profile-wellbeing.png` });

  await page.goto('/#/history');
  await expect(page.getByTestId('history-total')).toHaveText('共 4 次测评');
  await expect(page.getByTestId('wb-row')).toHaveCount(3);
  await page.getByTestId('wb-row').first().locator('button').last().click();
  await page.getByRole('button', { name: '删除' }).last().click();
  await expect(page.getByTestId('wb-row')).toHaveCount(2);
  await expect(page.getByTestId('history-total')).toHaveText('共 3 次测评');
});

test('personality report: formal header, optional answers appendix', async ({ page }) => {
  await onboard(page, '报告人');
  await quickTest(page, '报告人', INTJ);
  await page.getByTestId('open-report').click();
  await expect(page).toHaveURL(/#\/report\/mbti\//);
  await expect(page.getByTestId('report-title')).toHaveText('人格偏好测评报告');
  await expect(page.getByTestId('report-type')).toHaveText('INTJ');
  await expect(page.getByTestId('report-answers')).toHaveCount(0);
  await page.getByTestId('toggle-answers').click();
  await expect(page.getByTestId('report-answers').locator('tr')).toHaveCount(40);
  await page.getByTestId('toggle-answers').click();
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `${SHOTS}report-mbti-print.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // Going straight from one report to another must load the new one.
  const mbtiReport = page.url();
  await checkIn(page, '报告人', 'gad7', 'GAD7', [1, 1, 1, 1, 1, 1, 1]);
  const wbId = page.url().split('/').pop()!;
  await page.goto(mbtiReport);
  await expect(page.getByTestId('report-type')).toHaveText('INTJ');
  await page.evaluate((id) => (location.hash = `#/report/wellbeing/${id}`), wbId);
  await expect(page.getByTestId('report-title')).toHaveText('心理状态自评报告');
  await expect(page.getByTestId('report-score')).toHaveText('7 / 21');
});
