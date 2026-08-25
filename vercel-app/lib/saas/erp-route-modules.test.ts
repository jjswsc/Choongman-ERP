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

  it("maps store ops paths to store_ops, not pos_base", () => {
    expect(resolveAdminPathSaasModule("/admin/store-ops")).toBe("store_ops")
    expect(resolveAdminPathSaasModule("/admin/store-check")).toBe("store_ops")
    expect(resolveAdminPathSaasModule("/admin/complaints")).toBe("store_ops")
  })

  it("keeps employee accounts on pos_base for POS-only tenants", () => {
    expect(resolveAdminPathSaasModule("/admin/employees")).toBe("pos_base")
    expect(resolveAdminPathSaasModule("/admin/attendance")).toBe("attendance")
    expect(resolveAdminPathSaasModule("/admin/hr")).toBe("attendance")
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
    expect(resolveApiPathSaasModule("/api/attachPosOrderMember")).toBe("pos_base")
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

  it("maps store-ops APIs away from pos_base", () => {
    expect(resolveApiPathSaasModule("/api/getStoreCheck")).toBe("store_ops")
    expect(resolveApiPathSaasModule("/api/getStoreOpsAlertSummary")).toBe("store_ops")
    expect(resolveApiPathSaasModule("/api/getAdminEmployee")).toBe("pos_base")
  })

  it("exempts login and saas admin APIs", () => {
    expect(resolveApiPathSaasModule("/api/loginCheck")).toBeNull()
    expect(resolveApiPathSaasModule("/api/saas/enabled-modules")).toBeNull()
  })
})
