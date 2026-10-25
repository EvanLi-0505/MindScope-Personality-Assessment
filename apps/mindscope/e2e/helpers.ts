import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

type Item = { id: string; target: string; key: number; text: Record<string, string> };
const bank = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/banks/ms16/bank-0.1.0.json', import.meta.url)), 'utf-8'),
) as { items: Item[] };
const byText = new Map(bank.items.map((i) => [i.text['zh-CN'], i]));

export type Persona = Record<string, number>;
export const INTJ: Persona = { EI: -0.7, SN: -0.7, TF: 0.6, JP: 0.6, Ni: 0.8, Te: 0.6, Fi: 0.1, Se: -0.6 };
export const INFJ: Persona = { EI: -0.6, SN: -0.7, TF: -0.6, JP: 0.5, Ni: 0.7, Fe: 0.6, Ti: 0.1, Se: -0.5 };
export const ESFP: Persona = { EI: 0.7, SN: 0.6, TF: -0.6, JP: -0.7, Se: 0.8, Fi: 0.6, Ni: -0.6 };

export const SHOTS = fileURLToPath(new URL('../test-results/shots/', import.meta.url));

export async function onboard(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('onboarding-start').click();
  await page.getByPlaceholder('例如：我自己、小王').fill(name);
  await page.getByTestId('profile-submit').click();
  await expect(page.getByRole('heading', { name: `你好，${name}` })).toBeVisible();
}

export async function addProfile(page: Page, name: string) {
  await page.goto('/#/profiles/new');
  await page.getByPlaceholder('例如：我自己、小王').fill(name);
  await page.getByTestId('profile-submit').click();
  await expect(page).toHaveURL(/#\/profiles$/);
}

/** Runs a complete quick test for `person` and returns the type code shown. */
export async function quickTest(page: Page, person: string, persona: Persona) {
  await page.goto('/#/assess');
  await page.getByTestId('pick-profile').filter({ hasText: person }).click();
  await page.getByTestId('mode-quick').click();
  await page.getByTestId('start-test').click();
  for (let n = 1; n <= 40; n++) {
    await expect(page.getByTestId('question-of')).toHaveText(`第 ${n} / 40 题`);
    const text = (await page.getByTestId('question-text').textContent())!.trim();
    const item = byText.get(text)!;
    const v = Math.min(7, Math.max(1, Math.round(4 + 3 * item.key * (persona[item.target] ?? 0))));
    await page.keyboard.press(String(v));
  }
  await page.getByTestId('submit-test').click();
  await page.getByRole('button', { name: '确认提交' }).last().click();
  await expect(page.getByTestId('type-code')).toBeVisible();
  return (await page.getByTestId('type-code').textContent())!.trim();
}

export async function openProfile(page: Page, name: string) {
  await page.goto('/#/profiles');
  await page.getByTestId('open-profile').filter({ hasText: name }).click();
  await expect(page.getByTestId('detail-name')).toHaveText(name);
}

/** Starts a check-in from the assess page and answers it; values are option values in item order. */
export async function checkIn(page: Page, person: string, instrument: string, prefix: string, values: number[], opts: { expectSafety?: boolean } = {}) {
  await page.goto('/#/assess');
  await page.getByTestId('kind-wellbeing').click();
  await page.getByTestId('pick-profile').filter({ hasText: person }).click();
  await page.getByTestId(`scale-${instrument}`).click();
  await page.getByTestId('start-test').click();
  await expect(page.getByTestId('check-item')).toHaveCount(values.length);
  for (const [i, v] of values.entries()) {
    await page.getByTestId(`opt-${prefix}-${String(i + 1).padStart(2, '0')}-${v}`).click();
  }
  await expect(page.getByTestId('check-progress')).toHaveText(`已答 ${values.length} / ${values.length} 题`);
  if (opts.expectSafety) await expect(page.getByTestId('safety-card')).toBeVisible();
  await page.getByTestId('check-submit').click();
  await page.getByRole('button', { name: '提交' }).last().click();
  await expect(page).toHaveURL(/#\/wellbeing\//);
}
