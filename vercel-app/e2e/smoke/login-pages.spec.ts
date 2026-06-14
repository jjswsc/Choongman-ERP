import { test, expect } from '@playwright/test'

test.describe('public login shells', () => {
  test('ERP admin login renders password field', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30_000 })
  })

  test('SaaS admin login renders password field', async ({ page }) => {
    await page.goto('/saas-admin/login')
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30_000 })
  })

  test('POS login renders password field', async ({ page }) => {
    await page.goto('/pos/login')
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 30_000 })
  })
})
