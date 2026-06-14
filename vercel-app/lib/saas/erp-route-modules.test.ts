import { describe, expect, it } from "vitest"
import { resolveAdminPathSaasModule, resolveApiPathSaasModule } from "./erp-route-modules"

describe("erp-route-modules", () => {
  it("maps admin CRM paths to member_mgmt", () => {
    expect(resolveAdminPathSaasModule("/admin/members")).toBe("member_mgmt")
    expect(resolveAdminPathSaasModule("/admin/crm/coupons")).toBe("member_mgmt")
  })

  it("leaves dashboard ungated", () => {
    expect(resolveAdminPathSaasModule("/admin")).toBeNull()
    expect(resolveAdminPathSaasModule("/admin/settings")).toBeNull()
  })

  it("maps store ops paths to pos_base", () => {
    expect(resolveAdminPathSaasModule("/admin/store-ops")).toBe("pos_base")
    expect(resolveAdminPathSaasModule("/admin/store-check")).toBe("pos_base")
    expect(resolveAdminPathSaasModule("/admin/complaints")).toBe("pos_base")
  })

  it("maps interior and sales analytics paths", () => {
    expect(resolveAdminPathSaasModule("/admin/interior")).toBe("logistics")
    expect(resolveAdminPathSaasModule("/admin/live-store-sales")).toBe("pos_base")
    expect(resolveAdminPathSaasModule("/admin/sales-management")).toBe("pos_base")
  })

  it("maps cost analysis API", () => {
    expect(resolveApiPathSaasModule("/api/getPosMenuCostAnalysis")).toBe("cost_analysis")
  })

  it("maps POS catch-all prefixes", () => {
    expect(resolveApiPathSaasModule("/api/deletePosMenu")).toBe("pos_base")
    expect(resolveApiPathSaasModule("/api/getPosPrinterSettings")).toBe("pos_base")
  })

  it("maps marketing delete API", () => {
    expect(resolveApiPathSaasModule("/api/deleteMarketingCampaign")).toBe("marketing")
  })

  it("maps pos_device and accounting APIs", () => {
    expect(resolveApiPathSaasModule("/api/registerPosDevice")).toBe("pos_device")
    expect(resolveApiPathSaasModule("/api/saveKt20kSettings")).toBe("accounting")
  })

  it("exempts login and saas bootstrap APIs", () => {
    expect(resolveApiPathSaasModule("/api/loginCheck")).toBeNull()
    expect(resolveApiPathSaasModule("/api/saas/enabled-modules")).toBeNull()
  })

  it("maps kbank API to kbank module", () => {
    expect(resolveApiPathSaasModule("/api/pos/kbank/generate-qr")).toBe("kbank")
  })

  it("exempts login and saas admin APIs", () => {
    expect(resolveApiPathSaasModule("/api/loginCheck")).toBeNull()
    expect(resolveApiPathSaasModule("/api/saas/enabled-modules")).toBeNull()
  })
})
