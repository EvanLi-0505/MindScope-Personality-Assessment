import { expect, test, type Page } from '@playwright/test';

/** Every request must stay on the app's own origin (offline-first rule). */
function trackForeignRequests(page: Page) {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) {
      foreign.push(r.url());
    }
  });
  return foreign;
}

async function createFirstProfile(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByText('欢迎使用 MindScope')).toBeVisible();
  await page.getByTestId('onboarding-start').click();
  await page.getByPlaceholder('例如：我自己、小王').fill(name);
  await page.getByTestId('profile-submit').click();
  await expect(page.getByRole('heading', { name: `你好，${name}` })).toBeVisible();
}

test('first run: onboarding → person card → survives reload, no foreign requests', async ({ page }) => {
  const foreign = trackForeignRequests(page);
  const cspErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) cspErrors.push(m.text());
  });

  await createFirstProfile(page, '测试员甲');
  await expect(page.getByTestId('stat-profiles').locator('.stat-value')).toHaveText('1');

  await page.reload();
  await page.goto('/#/profiles');
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
  await expect(page.getByTestId('profile-card')).toContainText('测试员甲');

  expect(foreign).toEqual([]);
  expect(cspErrors).toEqual([]);
});

test('pressing Enter in the name field creates exactly one person card', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-start').click();
  await page.getByPlaceholder('例如：我自己、小王').fill('回车测试');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '你好，回车测试' })).toBeVisible();
  await page.goto('/#/profiles');
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
});

test('empty name is rejected and nothing is saved', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('onboarding-start').click();
  await page.getByTestId('profile-submit').click();
  await expect(page.getByText('请填写名称')).toBeVisible();
  await expect(page).toHaveURL(/onboarding/);
});

test('tags: create, filter, and delete a person card', async ({ page }) => {
  await createFirstProfile(page, '自己');

  await page.goto('/#/profiles/new');
  await page.getByPlaceholder('例如：我自己、小王').fill('小王');
  await page.getByText('更多信息（可选）').click();
  await page.locator('.more .n-select').first().click();
  await page.keyboard.type('朋友');
  await page.keyboard.press('Enter');
  await page.getByTestId('profile-submit').click();

  await expect(page).toHaveURL(/#\/profiles$/);
  await expect(page.getByTestId('profile-card')).toHaveCount(2);

  // Filter by the new tag.
  await page.locator('.chips').getByText('朋友').click();
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
  await expect(page.getByTestId('profile-card')).toContainText('小王');

  // Delete with confirmation.
  await page.getByTestId('profile-card').getByLabel('删除').click();
  await page.getByRole('button', { name: '删除' }).last().click();
  await page.locator('.chips').getByText('全部').click();
  await expect(page.getByTestId('profile-card')).toHaveCount(1);
});

test('mobile layout uses the bottom tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createFirstProfile(page, '手机');
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.locator('.tabbar').getByText('我的').click();
  await page.locator('main').getByText('数据与存储').click();
  await expect(page.getByTestId('network-status')).toHaveText('本软件没有发起过任何网络请求。');
});
