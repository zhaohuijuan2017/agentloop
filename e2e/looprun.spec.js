import { expect, test } from '@playwright/test';

test('A12：创建 LoopRun、运行门禁、推进阶段并看到变化', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('标题').fill(`E2E LoopRun ${Date.now()}`);
  await page.getByRole('button', { name: '创建 LoopRun' }).click();

  const detail = page.getByRole('region', { name: 'LoopRun 详情' });
  await expect(detail.getByText('当前阶段：spec')).toBeVisible();
  await expect(page.getByRole('button', { name: '推进到 design' })).toBeVisible();
  await expect(page.getByRole('button', { name: '推进到 code' })).toHaveCount(0);

  await page.getByRole('button', { name: '运行门禁' }).click();
  await expect(page.getByText('spec_check', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推进到 design' }).click();

  await expect(detail.getByText('当前阶段：design')).toBeVisible();
});

test('A13：缺少门禁时只显示合法目标，并展示 gate_required 错误', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('标题').fill(`E2E Gate Required ${Date.now()}`);
  await page.getByRole('button', { name: '创建 LoopRun' }).click();

  await expect(page.getByRole('button', { name: '推进到 design' })).toBeVisible();
  await expect(page.getByRole('button', { name: '推进到 code' })).toHaveCount(0);

  await page.getByRole('button', { name: '推进到 design' }).click();

  await expect(page.getByRole('alert')).toContainText('gate_required');
  await expect(page.getByRole('region', { name: 'LoopRun 详情' }).getByText('当前阶段：spec')).toBeVisible();
});
