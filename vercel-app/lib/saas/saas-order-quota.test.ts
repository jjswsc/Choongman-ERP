import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const supabaseSelectFilter = vi.fn()
const supabaseCountFilter = vi.fn()

vi.mock("@/lib/supabase-server", () => ({
  supabaseSelectFilter: (...args: unknown[]) => supabaseSelectFilter(...args),
  supabaseCountFilter: (...args: unknown[]) => supabaseCountFilter(...args),
}))

import {
  assertSaasOrderQuotaAllowed,
  clearSaasOrderQuotaServerCaches,
  evaluateSaasOrderQuotaBlock,
} from "@/lib/saas/saas-order-quota-server"

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

describe("assertSaasOrderQuotaAllowed", () => {
  beforeEach(() => {
    clearSaasOrderQuotaServerCaches()
    supabaseSelectFilter.mockReset()
    supabaseCountFilter.mockReset()
  })

  afterEach(() => {
    clearSaasOrderQuotaServerCaches()
  })

  it("skips monthly COUNT when allowOverage is true", async () => {
    supabaseSelectFilter.mockResolvedValue([
      { monthly_order_quota: 1000, allow_overage: true },
    ])
    const r = await assertSaasOrderQuotaAllowed({ tenantId: "tenant-overage" })
    expect(r.ok).toBe(true)
    expect(supabaseCountFilter).not.toHaveBeenCalled()
  })

  it("counts when overage is disabled", async () => {
    supabaseSelectFilter.mockResolvedValue([
      { monthly_order_quota: 100, allow_overage: false },
    ])
    supabaseCountFilter.mockResolvedValue(10)
    const r = await assertSaasOrderQuotaAllowed({ tenantId: "tenant-strict" })
    expect(r.ok).toBe(true)
    expect(supabaseCountFilter).toHaveBeenCalledTimes(1)
  })

  it("reuses cached monthly COUNT within TTL", async () => {
    supabaseSelectFilter.mockResolvedValue([
      { monthly_order_quota: 100, allow_overage: false },
    ])
    supabaseCountFilter.mockResolvedValue(42)
    const a = await assertSaasOrderQuotaAllowed({ tenantId: "tenant-cache" })
    const b = await assertSaasOrderQuotaAllowed({ tenantId: "tenant-cache" })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(supabaseCountFilter).toHaveBeenCalledTimes(1)
  })

  it("blocks when cached usage reaches quota", async () => {
    supabaseSelectFilter.mockResolvedValue([
      { monthly_order_quota: 5, allow_overage: false },
    ])
    supabaseCountFilter.mockResolvedValue(5)
    const r = await assertSaasOrderQuotaAllowed({ tenantId: "tenant-full" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_order_quota")
  })
})
