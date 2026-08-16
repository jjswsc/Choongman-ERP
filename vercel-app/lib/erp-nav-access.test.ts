import { describe, expect, it } from "vitest"
import { getAccessibleErpNavHrefs, isErpNavHrefAccessible, type ErpNavAccessContext } from "@/lib/erp-nav-access"
import { SAAS_MODULE_KEYS, type SaasModuleKey } from "@/lib/saas-module-pricing"
import type { SaasEnabledModulesMap } from "@/lib/use-saas-enabled-modules"

function modulesOn(on: SaasModuleKey[]): SaasEnabledModulesMap {
  const out = {} as SaasEnabledModulesMap
  for (const key of SAAS_MODULE_KEYS) out[key] = on.includes(key)
  return out
}

function officeCtx(on: SaasModuleKey[]): ErpNavAccessContext {
  return {
    role: "officer",
    store: "1001",
    saasModules: modulesOn(on),
    aiModuleEnabled: false,
  }
}

describe("POS-only ERP nav", () => {
  const posOnly = officeCtx(["pos_base", "pos_device"])

  it("keeps dashboard, sales, POS, settings, and employees", () => {
    expect(isErpNavHrefAccessible("/admin", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/settings", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/live-store-sales", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/ops-center", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/sales-management", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/pos", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/pos-menus", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/pos-settlement", posOnly)).toBe(true)
    expect(isErpNavHrefAccessible("/admin/employees", posOnly)).toBe(true)
  })

  it("hides ERP and HQ menus", () => {
    expect(isErpNavHrefAccessible("/admin/notices", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/company-documents", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/work-log", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/pos-cost-analysis", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/ai-center", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/crm", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/marketing", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/store-ops", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/store-check", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/complaints", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/attendance", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/items", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/bank-transactions", posOnly)).toBe(false)
    expect(isErpNavHrefAccessible("/admin/interior", posOnly)).toBe(false)
  })

  it("does not list hidden hrefs in the accessible set", () => {
    const hrefs = getAccessibleErpNavHrefs(posOnly)
    expect(hrefs).toContain("/admin/pos-menus")
    expect(hrefs).toContain("/admin/employees")
    expect(hrefs).not.toContain("/admin/store-check")
    expect(hrefs).not.toContain("/admin/notices")
    expect(hrefs).not.toContain("/admin/items")
  })
})
