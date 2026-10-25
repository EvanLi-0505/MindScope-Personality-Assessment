/**
 * AI screens, run against the test build's local stand-in provider (no
 * network). The desktop shell's real HTTP client is covered by Rust tests and
 * the desktop smoke test.
 */
import { expect, test, type Page } from '@playwright/test';
import { INTJ, SHOTS, checkIn, onboard, openProfile, quickTest } from './helpers';

const KEY = 'sk-e2e-0123456789-wxyz';

/** Turns AI on (accepting the explanation), sets a model and a session key. */
async function enableAi(page: Page, model = 'qwen-plus') {
  await page.goto('/#/ai');
  await expect(page.getByTestId('ai-status')).toHaveText(/AI 已关闭/);
  await page.getByTestId('ai-enable').click();
  await expect(page.getByText('开启 AI 功能前请了解')).toBeVisible();
  await page.getByRole('button', { name: '我已了解，开启' }).click();
  await expect(page.getByTestId('ai-status')).toHaveText(/还没有填写 API Key/);
  await setModel(page, model);
  await page.getByTestId('ai-key-input').locator('input').fill(KEY);
  await page.getByTestId('ai-key-session').click();
  await page.getByTestId('ai-key-save').click();
  await expect(page.getByTestId('ai-key-status')).toHaveText(/只在本次运行中使用（••••wxyz）/);
  await expect(page.getByTestId('ai-status')).toHaveText(/可以使用/);
}

async function setModel(page: Page, model: string) {
  await page.goto('/#/ai');
  const input = page.getByTestId('ai-model').locator('input');
  await input.fill(model);
  await page.keyboard.press('Escape');
  if (await page.getByTestId('ai-save').isEnabled()) await page.getByTestId('ai-save').click();
  await expect(page.getByTestId('ai-save')).toBeDisabled();
}

test('AI is off by default: the person card only links to settings and nothing is sent', async ({ page }) => {
  await onboard(page, '小明');
  await quickTest(page, '小明', INTJ);
  await openProfile(page, '小明');
  await expect(page.getByTestId('ai-setup')).toBeVisible();
  await expect(page.getByTestId('ai-task-history')).toHaveCount(0);
  await page.goto('/#/data');
  await expect(page.getByTestId('network-status')).toHaveText('本软件没有发起过任何网络请求。');
});

test('settings: consent, key never shown again, connection test is recorded', async ({ page }) => {
  await onboard(page, '小明');
  await enableAi(page);
  // The full key never appears on the page.
  expect(await page.content()).not.toContain(KEY);

  await page.getByTestId('ai-test').click();
  await expect(page.getByText(/不包含任何个人数据/)).toBeVisible();
  await page.getByRole('button', { name: '发送测试' }).click();
  await expect(page.getByTestId('ai-test-result')).toContainText('连接成功');
  await expect(page.getByTestId('ai-usage')).toContainText('共 1 次请求，成功 1 次');

  // Address rules match the desktop shell.
  await page.getByTestId('ai-base-url').locator('input').fill('http://example.com/v1');
  await expect(page.getByText('只有本机地址可以使用 http')).toBeVisible();

  await page.goto('/#/data');
  await expect(page.getByTestId('network-row')).toHaveCount(1);
  await expect(page.getByTestId('network-row')).toContainText('连接测试');
  await expect(page.getByTestId('network-row')).toContainText('不含个人数据');
  expect(await page.content()).not.toContain(KEY);

  // Turning AI off blocks requests again.
  await page.goto('/#/ai');
  await page.getByTestId('ai-enable').click();
  await expect(page.getByTestId('ai-status')).toHaveText(/AI 已关闭/);
  await expect(page.getByTestId('ai-test')).toBeDisabled();
});

test('history analysis: preview shows exactly what is sent, wellbeing is opt-in, answer is labelled and saved', async ({ page }) => {
  await onboard(page, '小明');
  await quickTest(page, '小明', INTJ);
  // PHQ-9 with item 9 = 1
  await checkIn(page, '小明', 'phq9', 'PHQ9', [1, 1, 1, 0, 0, 0, 0, 0, 1]);
  await openProfile(page, '小明');
  await page.getByTestId('growth-add').click();
  await page.getByTestId('growth-text').locator('textarea').fill('这个月开始学吉他');
  await page.getByTestId('growth-save').click();
  await expect(page.getByTestId('growth-note')).toHaveCount(1);
  await enableAi(page);

  await openProfile(page, '小明');
  await page.getByTestId('ai-task-history').click();
  const dlg = page.getByTestId('ai-send-dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId('ai-send-host')).toHaveText('dashscope.aliyuncs.com');
  await dlg.getByTestId('ai-preview-toggle').click();
  const preview = dlg.getByTestId('ai-preview');
  await expect(preview).toContainText('personalityResults');
  await expect(preview).not.toContainText('小明');
  await expect(preview).not.toContainText('吉他');
  await expect(preview).not.toContainText('PHQ-9');

  // Opt in to wellbeing: warning, data and the crisis instruction appear.
  await dlg.getByTestId('ai-cat-wellbeing').click();
  await expect(dlg.getByTestId('ai-cat-wellbeing')).toHaveClass(/n-checkbox--checked/);
  await expect(dlg.getByTestId('ai-cat-personality')).toHaveClass(/n-checkbox--disabled/);
  await expect(dlg.getByText('心理状态分数属于健康信息')).toBeVisible();
  await expect(preview).toContainText('PHQ-9');
  await expect(preview).toContainText('selfHarmThoughtsReported');
  await expect(preview).toContainText('12356');
  await expect(preview).not.toContainText('小明');
  await page.screenshot({ path: `${SHOTS}ai-send-dialog.png` });

  await dlg.getByTestId('ai-send').click();
  const note = page.getByTestId('ai-section').getByTestId('ai-note').last();
  await expect(note.getByTestId('ai-badge')).toHaveText('AI 生成 · 仅供参考');
  await expect(note.getByTestId('ai-basis')).toContainText('1 次人格测评');
  await expect(note.getByTestId('ai-basis')).toContainText('1 次心理状态自评（PHQ-9）');
  await expect(note.getByTestId('safety-card')).toBeVisible();
  await expect(note.getByTestId('ai-content')).toContainText('局限与提醒');
  // HTML from the model is shown as text, never run.
  await expect(note.getByTestId('ai-content').locator('img, a, script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await page.getByTestId('ai-section').screenshot({ path: `${SHOTS}ai-section.png` });

  // Saved: still there after reload (session key is gone, the note is not).
  await page.reload();
  await expect(page.getByTestId('ai-section').getByTestId('ai-note')).toHaveCount(1);

  // Printable report.
  await page.getByRole('button', { name: '打印 / 导出 PDF' }).click();
  await expect(page.getByTestId('report-title')).toHaveText('AI 分析记录');
  await expect(page.getByTestId('report-ai').getByTestId('safety-card')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `${SHOTS}report-ai-print.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // Network record lists the data kinds sent, not the content.
  await page.goto('/#/data');
  await expect(page.getByTestId('network-row').first()).toContainText('人格历史分析');
  await expect(page.getByTestId('network-row').first()).toContainText('心理状态自评分数');
  expect(await page.content()).not.toContain('吉他');
});

test('growth summary needs growth notes; advice never sends wellbeing', async ({ page }) => {
  await onboard(page, '阿青');
  await quickTest(page, '阿青', INTJ);
  await enableAi(page);
  await openProfile(page, '阿青');
  await page.getByTestId('ai-task-growth').click();
  await expect(page.getByTestId('ai-send-missing')).toContainText('成长记录');
  await expect(page.getByTestId('ai-send')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.getByTestId('ai-task-advice').click();
  await expect(page.getByTestId('ai-cat-wellbeing')).toHaveCount(0);
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-section').getByTestId('ai-note')).toHaveCount(1);
  await page.getByTestId('ai-note-delete').click();
  await page.getByRole('button', { name: '删除' }).last().click();
  await expect(page.getByTestId('ai-section').getByTestId('ai-note')).toHaveCount(0);
});

test('errors are explained without the key, and a running request can be stopped', async ({ page }) => {
  await onboard(page, '小周');
  await quickTest(page, '小周', INTJ);
  await enableAi(page, 'mock-401');
  await openProfile(page, '小周');
  await page.getByTestId('ai-task-advice').click();
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-error')).toContainText('API Key 无效');
  await expect(page.getByTestId('ai-error')).toContainText('HTTP 401');
  await expect(page.getByTestId('ai-error')).not.toContainText(KEY);
  await expect(page.getByTestId('ai-section').getByTestId('ai-note')).toHaveCount(0);

  await setModel(page, 'mock-slow');
  await openProfile(page, '小周');
  await page.getByTestId('ai-task-advice').click();
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-running')).toBeVisible();
  await page.getByTestId('ai-stop').click();
  await expect(page.getByText('已停止，这次的内容没有保存。')).toBeVisible();
  await expect(page.getByTestId('ai-section').getByTestId('ai-note')).toHaveCount(0);

  await page.goto('/#/data');
  await expect(page.getByTestId('network-row')).toHaveCount(2);
  await expect(page.getByTestId('network-row').first()).toContainText('cancelled');
  await expect(page.getByTestId('network-row').last()).toContainText('invalid_key (401)');
});

test('home overview cards open the matching pages', async ({ page }) => {
  await onboard(page, '小李');
  // Nothing to open yet: these cards are not links.
  await expect(page.getByTestId('stat-completed')).not.toHaveAttribute('href', /.*/);
  await expect(page.getByTestId('stat-last')).not.toHaveAttribute('href', /.*/);
  await page.getByTestId('stat-profiles').click();
  await expect(page).toHaveURL(/#\/profiles$/);

  await quickTest(page, '小李', INTJ);
  await page.goto('/');
  await page.getByTestId('stat-completed').click();
  await expect(page).toHaveURL(/#\/history$/);
  await page.goto('/');
  await page.getByTestId('stat-last').click();
  await expect(page.getByTestId('type-code')).toHaveText('INTJ');

  await checkIn(page, '小李', 'gad7', 'GAD7', [0, 0, 0, 0, 0, 0, 0]);
  await page.goto('/');
  await page.getByTestId('stat-last').click();
  await expect(page).toHaveURL(/#\/wellbeing\//);

  // An unfinished test makes that card a link to the assess page.
  await page.goto('/#/assess');
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('start-test').click();
  await page.keyboard.press('4');
  await page.goto('/');
  await page.getByTestId('stat-in-progress').click();
  await expect(page).toHaveURL(/#\/assess/);
  await expect(page.getByTestId('unfinished-row')).toHaveCount(1);
});
