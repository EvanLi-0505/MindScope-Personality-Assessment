import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

type Item = { id: string; target: string; key: number; text: Record<string, string> };
const bank = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/banks/ms16/bank-0.1.0.json', import.meta.url)), 'utf-8'),
) as { items: Item[] };
const byText = new Map(bank.items.map((i) => [i.text['zh-CN'], i]));

/** A respondent with clear I, N, T, J preferences. */
const PERSONA: Record<string, number> = { EI: -0.7, SN: -0.7, TF: 0.6, JP: 0.6, Ni: 0.8, Te: 0.6, Fi: 0.1, Se: -0.6, Ne: -0.2, Ti: 0.2, Si: -0.3, Fe: -0.3 };

async function setup(page: Page) {
  await page.goto('/');
  await page.getByTestId('onboarding-start').click();
  await page.getByPlaceholder('例如：我自己、小王').fill('答题者');
  await page.getByTestId('profile-submit').click();
  await expect(page.getByRole('heading', { name: '你好，答题者' })).toBeVisible();
}

async function startTest(page: Page, mode: 'quick' | 'normal') {
  await page.getByTestId('home-start').click();
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId('start-test').click();
  await expect(page.getByTestId('question-text')).toBeVisible();
}

/** Answers the question on screen with the keyboard, following PERSONA. */
async function answerCurrent(page: Page) {
  const text = (await page.getByTestId('question-text').textContent())!.trim();
  const item = byText.get(text);
  expect(item, `unknown question: ${text}`).toBeDefined();
  const v = Math.min(7, Math.max(1, Math.round(4 + 3 * item!.key * PERSONA[item!.target]!)));
  await page.keyboard.press(String(v));
  return item!;
}

test('a full quick test: adaptive questions → review → INTJ result saved to the person card', async ({ page }) => {
  await setup(page);
  await startTest(page, 'quick');
  await expect(page.getByTestId('question-of')).toHaveText('第 1 / 40 题');

  const seen = new Set<string>();
  for (let n = 1; n <= 40; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 40 题`);
    const item = await answerCurrent(page);
    expect(seen.has(item.id), 'no question is asked twice').toBe(false);
    seen.add(item.id);
  }
  await expect(page.locator('.review-list li')).toHaveCount(40);
  await expect(page.getByText('0 题未作答')).toBeVisible();

  await page.getByTestId('submit-test').click();
  await page.getByRole('button', { name: '确认提交' }).last().click();

  await expect(page).toHaveURL(/#\/results\//);
  await expect(page.getByTestId('type-code')).toHaveText('INTJ');
  await expect(page.getByText('远景筹划者')).toBeVisible();
  await expect(page.getByText('快速测试题量较少')).toBeVisible();
  await expect(page.getByText('自编题库实验版')).toBeVisible();
  await expect(page.getByText('Ni › Te › Fi › Se')).toBeVisible();

  // The result survives a reload and shows on the person card.
  await page.reload();
  await expect(page.getByTestId('type-code')).toHaveText('INTJ');
  await page.goto('/#/profiles');
  await expect(page.getByTestId('latest-type')).toContainText('INTJ');
});

test('closing mid-test keeps answers and resumes on the same question', async ({ page }) => {
  await setup(page);
  await startTest(page, 'normal');
  for (let n = 1; n <= 5; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 80 题`);
    await answerCurrent(page);
  }
  await expect(page.getByTestId('question-of')).toHaveText('第 6 / 80 题');
  const sixth = await page.getByTestId('question-text').textContent();

  // Go back two questions, change nothing, then reload the whole page.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('question-of')).toHaveText('第 4 / 80 题');
  await page.reload();
  await expect(page.getByTestId('question-of')).toHaveText('第 4 / 80 题');

  // Moving forward does not redraw already drawn questions.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('question-text')).toHaveText(sixth!);
  await expect(page.locator('.cell.answered')).toHaveCount(5);

  // The home page offers to continue.
  await page.goto('/');
  await expect(page.getByTestId('resume-row')).toContainText('5 / 80');
});

test('a fast second key press during auto-advance does not overwrite the answer', async ({ page }) => {
  await setup(page);
  await startTest(page, 'quick');
  const first = (await page.getByTestId('question-text').textContent())!.trim();
  await page.keyboard.press('7');
  await page.keyboard.press('1'); // within the 260 ms auto-advance window
  await expect(page.getByTestId('question-of')).toHaveText('第 2 / 40 题');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('question-text')).toHaveText(first);
  await expect(page.getByTestId('likert-7')).toHaveAttribute('aria-checked', 'true');
});

test('"next" may skip a question; the skipped one stays unanswered in the grid', async ({ page }) => {
  await setup(page);
  await startTest(page, 'quick');
  await page.getByTestId('next').click();
  await expect(page.getByTestId('question-of')).toHaveText('第 2 / 40 题');
  await answerCurrent(page);
  await expect(page.getByTestId('question-of')).toHaveText('第 3 / 40 题');
  await expect(page.locator('.cell.answered')).toHaveCount(1);
  // Back to the skipped question through the grid, answer it later.
  await page.locator('.cell').first().click();
  await expect(page.getByTestId('question-of')).toHaveText('第 1 / 40 题');
});
