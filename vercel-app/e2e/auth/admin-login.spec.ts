import { test, expect } from '@playwright/test'
import { hasE2EAdminLoginEnv, readE2EAdminLoginEnv } from '../helpers/login-env'

test.describe('admin login (env credentials)', () => {
  test.skip(!hasE2EAdminLoginEnv(), 'Set E2E_ADMIN_STORE, E2E_ADMIN_USER, E2E_ADMIN_PASSWORD')

  test('ERP admin login redirects after submit', async ({ page }) => {
    const creds = readE2EAdminLoginEnv()
    if (!creds) {
      test.skip()
      return
    }

    await page.goto('/admin/login')
    await expect(page.getByTestId('login-password')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('login-select-store').click()
    await page.getByRole('option', { name: creds.store, exact: false }).click()

    await page.getByTestId('login-select-user').click()
    await page.getByRole('option', { name: creds.user, exact: true }).click()

    await page.getByTestId('login-password').fill(creds.password)
    await page.getByTestId('login-submit').click()

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 })
    expect(page.url()).not.toContain('/admin/login')
  })
})
