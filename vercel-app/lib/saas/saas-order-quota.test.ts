import { describe, expect, it } from "vitest"
import { evaluateSaasOrderQuotaBlock } from "@/lib/saas/saas-order-quota-server"

describe("evaluateSaasOrderQuotaBlock", () => {
  it("allows when not enforcing (충만 legacy)", () => {
    expect(
      evaluateSaasOrderQuotaBlock({
        enforce: false,
        allowOverage: false,
        used: 999999,
        monthlyOrderQuota: 10,
      }).ok
    ).toBe(true)
  })

  it("blocks at quota", () => {
    const r = evaluateSaasOrderQuotaBlock({
      enforce: true,
      allowOverage: false,
      used: 20000,
      monthlyOrderQuota: 20000,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_order_quota")
  })

  it("allows under quota", () => {
    expect(
      evaluateSaasOrderQuotaBlock({
        enforce: true,
        allowOverage: false,
        used: 19999,
        monthlyOrderQuota: 20000,
      }).ok
    ).toBe(true)
  })

  it("allows overage when policy enabled", () => {
    expect(
      evaluateSaasOrderQuotaBlock({
        enforce: true,
        allowOverage: true,
        used: 50000,
        monthlyOrderQuota: 20000,
      }).ok
    ).toBe(true)
  })

  it("fail-closed when limits unavailable", () => {
    const r = evaluateSaasOrderQuotaBlock({
      enforce: true,
      allowOverage: false,
      used: 0,
      monthlyOrderQuota: 20000,
      limitsUnavailable: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_order_quota_unavailable")
  })
})
