import { describe, expect, it } from "vitest"
import {
  evaluateSaasManagerRegistrationBlock,
  roleCountsAsManagerSeat,
} from "@/lib/saas/saas-manager-limit-server"
import { evaluateSaasTabletRegistrationBlock } from "@/lib/saas/saas-tablet-limit-server"
import {
  ipMatchesAllowlist,
  normalizeIpAllowlist,
} from "@/lib/saas/saas-login-security"

describe("roleCountsAsManagerSeat", () => {
  it("counts manager and franchisee", () => {
    expect(roleCountsAsManagerSeat("Manager")).toBe(true)
    expect(roleCountsAsManagerSeat("Franchisee")).toBe(true)
    expect(roleCountsAsManagerSeat("Staff")).toBe(false)
  })
})

describe("evaluateSaasManagerRegistrationBlock", () => {
  it("blocks at limit", () => {
    const r = evaluateSaasManagerRegistrationBlock({
      enforce: true,
      addingManagerSeats: 1,
      allowOverage: false,
      used: 8,
      maxManagerAccounts: 8,
    })
    expect(r.ok).toBe(false)
  })
})

describe("evaluateSaasTabletRegistrationBlock", () => {
  it("allows existing tablet heartbeat", () => {
    expect(
      evaluateSaasTabletRegistrationBlock({
        enforce: true,
        isNewTablet: false,
        allowOverage: false,
        used: 99,
        maxTablets: 1,
      }).ok
    ).toBe(true)
  })
})

describe("saas-login-security", () => {
  it("normalizes allowlist", () => {
    expect(normalizeIpAllowlist("1.1.1.1, 2.2.2.2\n3.3.3.3")).toEqual([
      "1.1.1.1",
      "2.2.2.2",
      "3.3.3.3",
    ])
  })

  it("matches exact and cidr", () => {
    expect(ipMatchesAllowlist("10.0.0.5", ["10.0.0.0/24"])).toBe(true)
    expect(ipMatchesAllowlist("10.0.1.5", ["10.0.0.0/24"])).toBe(false)
    expect(ipMatchesAllowlist("8.8.8.8", ["8.8.8.8"])).toBe(true)
  })
})
