import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { INTJ, SHOTS, onboard, openProfile, quickTest } from './helpers';

type Entry = { item: string; domain: string; facet?: string; key: number };
const bank = JSON.parse(readFileSync(fileURLToPath(new URL('../../../packages/banks/bigfive/ipip-b5-0.1.0.json', import.meta.url)), 'utf-8')) as {
  items: { id: string; text: Record<string, string> }[];
  forms: Record<string, { entries: Entry[] }>;
};
const idByZh = new Map(bank.items.map((i) => [i.text['zh-CN'], i.id]));

/** Trait direction per domain: +1 high, −1 low, 0 middle. */
type Persona = Partial<Record<'O' | 'C' | 'E' | 'A' | 'N', number>>;

function answerFor(form: string, text: string, persona: Persona) {
  const id = idByZh.get(text);
  expect(id, `unknown item: ${text}`).toBeDefined();
  const e = bank.forms[form]!.entries.find((x) => x.item === id)!;
  const t = persona[e.domain as keyof Persona] ?? 0;
  if (t === 0) return 3;
  const keyed = t > 0 ? 5 : 1;
  return e.key > 0 ? keyed : 6 - keyed;
}

async function startBigFive(page: Page, person: string, form: 'quick' | 'normal' | 'senior') {
  await page.goto('/#/assess');
  await page.getByTestId('kind-bigfive').click();
  await page.getByTestId('pick-profile').filter({ hasText: person }).click();
  await page.getByTestId(`b5-form-${form}`).click();
  await page.getByTestId('start-test').click();
  await expect(page.getByTestId('question-text')).toBeVisible();
}

async function answerAll(page: Page, form: 'quick' | 'normal' | 'senior', persona: Persona, from = 1) {
  const total = bank.forms[form]!.entries.length;
  for (let n = from; n <= total; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / ${total} 题`);
    const text = (await page.getByTestId('question-text').textContent())!.trim();
    await page.keyboard.press(String(answerFor(form, text, persona)));
  }
}

async function submit(page: Page) {
  await page.getByTestId('submit-test').click();
  await page.getByRole('button', { name: '确认提交' }).last().click();
  await expect(page).toHaveURL(/#\/b5\//);
}

test('quick Big Five: 20 items on the shared answering page, scored as answered', async ({ page }) => {
  await onboard(page, '五维');
  await startBigFive(page, '五维', 'quick');
  // The answering page does not reveal which trait an item measures.
  await expect(page.locator('.pill')).toHaveText('大五人格 · 先行版');
  await expect(page.locator('.likert button, .likert [role=radio]')).toHaveCount(5);
  await answerAll(page, 'quick', { E: 1, N: -1 });
  await expect(page.locator('.review-list li')).toHaveCount(20);
  await submit(page);

  await expect(page.getByTestId('b5-title')).toHaveText('大五人格结果');
  await expect(page.getByTestId('b5-preview-note')).toContainText('尚未经过验证');
  const row = (d: string) => page.getByTestId(`b5-domain-${d}`);
  await expect(row('E')).toContainText('100');
  await expect(row('E').getByTestId('b5-band')).toHaveText('偏高');
  await expect(row('N')).toContainText('0');
  await expect(row('N').getByTestId('b5-band')).toHaveText('偏低');
  for (const d of ['O', 'C', 'A']) await expect(row(d).getByTestId('b5-band')).toHaveText('中等');
  // Chips must be visible, not just present.
  expect((await row('O').getByTestId('b5-band').boundingBox())!.width).toBeGreaterThan(16);
  await expect(page.getByTestId('b5-get-along')).toContainText('外向性偏高');
  await expect(page.getByTestId('b5-get-along')).toContainText('情绪敏感性偏低');
  await expect(page.getByTestId('b5-facets')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}b5-result.png`, fullPage: true });

  // Report
  await page.getByTestId('b5-open-report').click();
  await expect(page.getByTestId('report-title')).toHaveText('大五人格报告（先行版）');
  await expect(page.getByTestId('report-b5-radar')).toBeVisible();
  await expect(page.getByTestId('report-source')).toContainText('IPIP');
  await page.getByTestId('toggle-answers').click();
  await expect(page.getByTestId('report-answers').locator('tr')).toHaveCount(20);
});

test('Big Five is kept apart from the 16-type views; person card, history and home know it', async ({ page }) => {
  await onboard(page, '双测');
  await quickTest(page, '双测', INTJ);
  await startBigFive(page, '双测', 'quick');
  await answerAll(page, 'quick', { O: 1, C: 1 });
  await submit(page);

  await openProfile(page, '双测');
  // 16-type numbers on the card ignore the Big Five result.
  await expect(page.getByTestId('detail-latest-type')).toContainText('INTJ');
  await expect(page.getByTestId('detail-count')).toHaveText('1');
  await expect(page.getByTestId('b5-section').getByTestId('b5-latest')).toContainText('快速');
  await page.getByTestId('b5-section').screenshot({ path: `${SHOTS}b5-profile.png` });

  await page.goto('/#/history');
  await expect(page.getByTestId('history-total')).toHaveText('共 2 次测评');
  await expect(page.getByTestId('b5-row')).toHaveCount(1);
  // The 16-type list holds only the 16-type result.
  await expect(page.locator('.ms-card').filter({ has: page.getByRole('heading', { name: '记录', exact: true }) }).locator('tbody tr')).toHaveCount(1);

  await page.goto('/');
  await page.getByTestId('stat-last').click();
  await expect(page).toHaveURL(/#\/b5\//);

  // Deleting the Big Five result from history.
  await page.goto('/#/history');
  await page.getByTestId('b5-row').locator('button').last().click();
  await page.getByRole('button', { name: '删除' }).last().click();
  await expect(page.getByTestId('b5-row')).toHaveCount(0);
});

test('a Big Five test can be left and resumed', async ({ page }) => {
  await onboard(page, '续答');
  await startBigFive(page, '续答', 'normal');
  for (let n = 1; n <= 3; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 50 题`);
    await page.keyboard.press('3');
  }
  await expect(page.getByTestId('question-of')).toHaveText('第 4 / 50 题');
  await page.goto('/');
  await expect(page.getByTestId('resume-row')).toContainText('大五人格 · 普通');
  await page.getByTestId('resume-row').click();
  await answerAll(page, 'normal', {}, 4);
  await submit(page);
  for (const d of ['O', 'C', 'E', 'A', 'N']) await expect(page.getByTestId(`b5-domain-${d}`)).toContainText('50');
});

test('senior form: 120 items with 30 facets and the adapted-item note', async ({ page }) => {
  test.setTimeout(150_000);
  await onboard(page, '资深');
  await startBigFive(page, '资深', 'senior');
  await answerAll(page, 'senior', { A: 1 });
  await submit(page);
  await expect(page.getByTestId('b5-facets').locator('.frow')).toHaveCount(30);
  await expect(page.getByTestId('b5-domain-A').getByTestId('b5-band')).toHaveText('偏高');
  await page.getByText('题目来源与许可').click();
  await expect(page.getByText(/原版有两题询问投票倾向/)).toBeVisible();
});

test('two fast "next" presses move two questions, even past an unanswered one', async ({ page }) => {
  await onboard(page, '快按');
  await startBigFive(page, '快按', 'quick');
  await page.keyboard.press('3'); // answers 1, moves to 2
  await expect(page.getByTestId('question-of')).toHaveText('第 2 / 20 题');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('question-of')).toHaveText('第 1 / 20 题');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('question-of')).toHaveText('第 3 / 20 题');
});

test('skipped questions: submit warns with the count; too few answers in a domain asks for more', async ({ page }) => {
  await onboard(page, '跳题');
  await startBigFive(page, '跳题', 'quick');
  // Skip question 1, answer the other 19.
  await page.getByTestId('next').click();
  await answerAll(page, 'quick', {}, 2);
  await expect(page.getByText('1 题未作答')).toBeVisible();
  await page.getByTestId('submit-test').click();
  await expect(page.getByText('还有 1 题没有作答')).toBeVisible();
  await page.getByRole('button', { name: '确认提交' }).last().click();
  await expect(page).toHaveURL(/#\/b5\//);
  // 3 of 4 answered in the skipped item's domain: still scored.
  await expect(page.getByTestId('b5-domain-E').getByTestId('b5-band')).toHaveText('中等');

  // Now leave two questions of the same domain (items 1 and 6 are both Extraversion) unanswered.
  await startBigFive(page, '跳题', 'quick');
  for (let n = 1; n <= 20; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 20 题`);
    if (n === 1 || n === 6) await page.getByTestId('next').click();
    else await page.keyboard.press('3');
  }
  await page.getByTestId('submit-test').click();
  await expect(page.getByText('还有 2 题没有作答')).toBeVisible();
  await page.getByRole('button', { name: '确认提交' }).last().click();
  await expect(page.getByText(/作答不足四分之三/)).toBeVisible();
  await expect(page).toHaveURL(/#\/test\//);
});
