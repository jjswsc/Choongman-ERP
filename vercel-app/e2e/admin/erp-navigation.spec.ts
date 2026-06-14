import { test, expect } from "@playwright/test"
import { hasE2EAdminLoginEnv, readE2EAdminLoginEnv } from "../helpers/login-env"

async function loginAdmin(page: import("@playwright/test").Page) {
  const creds = readE2EAdminLoginEnv()
  if (!creds) return false
  await page.goto("/admin/login")
  await page.getByTestId("login-select-store").click()
  await page.getByRole("option", { name: creds.store, exact: false }).click()
  await page.getByTestId("login-select-user").click()
  await page.getByRole("option", { name: creds.user, exact: true }).click()
  await page.getByTestId("login-password").fill(creds.password)
  await page.getByTestId("login-submit").click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 })
  return true
}

test.describe("ERP navigation (keep-alive + URL tabs)", () => {
  test.skip(!hasE2EAdminLoginEnv(), "Set E2E_ADMIN_STORE, E2E_ADMIN_USER, E2E_ADMIN_PASSWORD")

  test("header back restores previous page with tab query", async ({ page }) => {
    const ok = await loginAdmin(page)
    if (!ok) {
      test.skip()
      return
    }

    await page.goto("/admin/leave?tab=stats")
    await expect(page).toHaveURL(/tab=stats/)

    await page.goto("/admin/vendors")
    await expect(page).toHaveURL(/\/admin\/vendors/)

    await page.getByTitle(/뒤로가기|Back/i).first().click()
    await expect(page).toHaveURL(/tab=stats/, { timeout: 30_000 })
  })

  test("close screen returns to dashboard", async ({ page }) => {
    const ok = await loginAdmin(page)
    if (!ok) {
      test.skip()
      return
    }

    await page.goto("/admin/vendors")
    await page.getByTitle(/화면 닫기|Close screen/i).click()
    await page.waitForURL((url) => url.pathname === "/admin" || url.pathname === "/admin/", {
      timeout: 30_000,
    })
  })
})
