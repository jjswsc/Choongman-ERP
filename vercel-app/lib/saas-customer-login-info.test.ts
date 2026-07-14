import { describe, expect, it } from "vitest"
import { pickSaasCustomerLoginAccounts, buildCustomerAdminLoginHref } from "@/lib/saas-customer-login-info"
import { isSaasPlatformInternalTenantId } from "@/lib/saas-platform-internal-tenant"

describe("saas-platform-internal-tenant", () => {
  it("detects omnifoodtech-demo", () => {
    expect(isSaasPlatformInternalTenantId("omnifoodtech-demo")).toBe(true)
    expect(isSaasPlatformInternalTenantId("customer-a")).toBe(false)
  })
})

describe("saas-customer-login-info", () => {
  it("picks active manager accounts", () => {
    const rows = pickSaasCustomerLoginAccounts(
      [
        { id: 1, company: "Acme", store: "S1", name: "Boss", role: "Manager" },
        { id: 2, company: "Acme", store: "S1", name: "Staff", role: "Staff", resignDate: "" },
        { id: 3, company: "Acme", store: "S1", name: "Old", role: "Manager", resignDate: "2025-01-01" },
      ],
      "Acme"
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe("Boss")
  })

  it("builds admin login href with query params", () => {
    const href = buildCustomerAdminLoginHref({ company: "Acme", store: "Bangkok", name: "Admin" })
    expect(href).toContain("company=Acme")
    expect(href).toContain("store=Bangkok")
    expect(href).toContain("user=Admin")
  })
})
