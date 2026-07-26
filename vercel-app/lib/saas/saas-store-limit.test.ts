import { describe, expect, it } from "vitest"
import { evaluateSaasStoreRegistrationBlock } from "@/lib/saas/saas-store-limit-server"

describe("evaluateSaasStoreRegistrationBlock", () => {
  it("allows when not enforcing", () => {
    expect(
      evaluateSaasStoreRegistrationBlock({
        enforce: false,
        allowOverage: false,
        used: 99,
        maxStores: 1,
      }).ok
    ).toBe(true)
  })

  it("blocks at limit", () => {
    const r = evaluateSaasStoreRegistrationBlock({
      enforce: true,
      allowOverage: false,
      used: 3,
      maxStores: 3,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_store_limit")
  })

  it("fail-closed when unavailable", () => {
    const r = evaluateSaasStoreRegistrationBlock({
      enforce: true,
      allowOverage: false,
      used: 0,
      maxStores: 10,
      limitsUnavailable: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_store_limit_unavailable")
  })
})
