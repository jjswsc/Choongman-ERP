import { describe, expect, it } from "vitest"
import { evaluateSaasStaffRegistrationBlock } from "@/lib/saas/saas-staff-limit-server"

describe("evaluateSaasStaffRegistrationBlock", () => {
  it("allows when not enforcing (충만 legacy)", () => {
    expect(
      evaluateSaasStaffRegistrationBlock({
        enforce: false,
        addingCount: 1,
        allowOverage: false,
        used: 999,
        maxStaffAccounts: 2,
      }).ok
    ).toBe(true)
  })

  it("blocks when used + adding exceeds max", () => {
    const r = evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: 1,
      allowOverage: false,
      used: 40,
      maxStaffAccounts: 40,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_staff_limit")
  })

  it("allows when under limit", () => {
    expect(
      evaluateSaasStaffRegistrationBlock({
        enforce: true,
        addingCount: 1,
        allowOverage: false,
        used: 39,
        maxStaffAccounts: 40,
      }).ok
    ).toBe(true)
  })

  it("allows overage when policy enabled", () => {
    expect(
      evaluateSaasStaffRegistrationBlock({
        enforce: true,
        addingCount: 5,
        allowOverage: true,
        used: 100,
        maxStaffAccounts: 40,
      }).ok
    ).toBe(true)
  })

  it("fail-closed when limits unavailable", () => {
    const r = evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: 1,
      allowOverage: false,
      used: 0,
      maxStaffAccounts: 40,
      limitsUnavailable: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_staff_limit_unavailable")
  })

  it("proposed replace total uses used=0 + addingCount", () => {
    const r = evaluateSaasStaffRegistrationBlock({
      enforce: true,
      addingCount: 41,
      allowOverage: false,
      used: 0,
      maxStaffAccounts: 40,
    })
    expect(r.ok).toBe(false)
  })
})
