import { describe, expect, it } from "vitest"
import { resolveBillablePosDevices } from "./saas-module-billing"
import {
  cloneDefaultModulePrices,
  resolveModuleChargeAmount,
  syncModuleEnabledFromFeatures,
} from "./saas-module-pricing"
import { DEFAULT_FEATURE_FLAGS } from "./saas-admin-control-plane"

describe("syncModuleEnabledFromFeatures", () => {
  it("maps POS feature to pos_base and pos_device", () => {
    const modules = cloneDefaultModulePrices()
    modules.pos_base.isEnabled = false
    modules.pos_device.isEnabled = false
    const out = syncModuleEnabledFromFeatures(modules, { ...DEFAULT_FEATURE_FLAGS, pos: true })
    expect(out.pos_base.isEnabled).toBe(true)
    expect(out.pos_device.isEnabled).toBe(true)
  })

  it("keeps notices and documents always on", () => {
    const modules = cloneDefaultModulePrices()
    modules.notices.isEnabled = false
    modules.documents.isEnabled = false
    const out = syncModuleEnabledFromFeatures(modules, { ...DEFAULT_FEATURE_FLAGS, pos: false })
    expect(out.notices.isEnabled).toBe(true)
    expect(out.documents.isEnabled).toBe(true)
  })
})

describe("resolveModuleChargeAmount", () => {
  it("bills pos_device as usage × unit price", () => {
    const modules = cloneDefaultModulePrices()
    modules.pos_base.isEnabled = true
    modules.pos_device.isEnabled = true
    const result = resolveModuleChargeAmount(modules, "monthly", { posDevices: 3 })
    const deviceLine = result.lines.find((x) => x.key === "pos_device")
    expect(deviceLine?.lineTotal).toBe(300)
    expect(result.total).toBe(600)
  })

  it("excludes custom quote from total", () => {
    const modules = cloneDefaultModulePrices()
    modules.pos_base.isEnabled = true
    modules.ai_center.isEnabled = true
    const result = resolveModuleChargeAmount(modules, "monthly", { posDevices: 0 })
    expect(result.hasCustomQuote).toBe(true)
    expect(result.total).toBe(300)
  })
})

describe("resolveBillablePosDevices", () => {
  it("caps billable devices when over limit and overage disabled", () => {
    const pos = resolveBillablePosDevices({ posDevices: 8 }, { maxPosDevices: 4, allowOverage: false, posDeviceBillingBasis: "usage" })
    expect(pos.billable).toBe(4)
    expect(pos.capped).toBe(true)
    expect(pos.basis).toBe("usage")
  })

  it("allows full usage when overage enabled", () => {
    const pos = resolveBillablePosDevices({ posDevices: 8 }, { maxPosDevices: 4, allowOverage: true, posDeviceBillingBasis: "usage" })
    expect(pos.billable).toBe(8)
    expect(pos.capped).toBe(false)
  })

  it("uses SaaS limit for saas_limit basis", () => {
    const pos = resolveBillablePosDevices(
      { posDevices: 12, licensedPosDevices: 9 },
      { maxPosDevices: 5, posDeviceBillingBasis: "saas_limit", tenantId: "chungman", pricingMode: "module" }
    )
    expect(pos.billable).toBe(5)
    expect(pos.basis).toBe("saas_limit")
  })

  it("uses ERP admin sum for erp_admin basis", () => {
    const pos = resolveBillablePosDevices(
      { posDevices: 2, licensedPosDevices: 7 },
      { maxPosDevices: 4, posDeviceBillingBasis: "erp_admin", tenantId: "omni-demo", pricingMode: "module" }
    )
    expect(pos.billable).toBe(7)
    expect(pos.basis).toBe("erp_admin")
  })
})
