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

test('A13：缺少门禁时只显示合法目标，并禁用推进动作', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('标题').fill(`E2E Gate Required ${Date.now()}`);
  await page.getByRole('button', { name: '创建 LoopRun' }).click();

  await expect(page.getByRole('button', { name: '推进到 design' })).toBeVisible();
  await expect(page.getByRole('button', { name: '推进到 code' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '推进到 design' })).toBeDisabled();
  await expect(page.getByText('推进需最新 passed 门禁')).toBeVisible();
  await expect(page.getByRole('region', { name: 'LoopRun 详情' }).getByText('当前阶段：spec')).toBeVisible();
});

test('R5：阶段前进但缺少历史 GateRecord 时标出来源未验证', async ({ page }) => {
  const run = {
    id: 'seeded-run',
    title: '可能由旧 seed 直写 phase 的运行',
    description: null,
    phase: 'review',
    created_at: '2026-07-03T00:00:00Z',
    updated_at: '2026-07-03T00:00:00Z',
    f_id: null,
    source_issue_url: null,
  };

  await page.route('**/api/loop-runs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [run] });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/loop-runs/seeded-run/gates', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/loop-runs/seeded-run/executions', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto('/');

  await expect(page.getByText('阶段来源未验证')).toBeVisible();
  await expect(page.getByText('可能来自旧 seed / fixture 直写')).toBeVisible();
  await expect(page.getByText('数据来源')).toBeVisible();
  await expect(page.getByText('phase ← GET /api/loop-runs.phase')).toHaveCount(2);
});

test('R5：后端 API 不可用时给出可操作错误提示', async ({ page }) => {
  await page.route('**/api/loop-runs', async (route) => {
    await route.fulfill({ status: 500, body: '' });
  });

  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText('后端 API 不可用');
  await expect(page.getByRole('alert')).toContainText('127.0.0.1:8000');
});
