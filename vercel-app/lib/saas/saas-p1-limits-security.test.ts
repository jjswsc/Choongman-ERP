import { describe, expect, it } from "vitest"
import {
  evaluateSaasManagerRegistrationBlock,
  roleCountsAsManagerSeat,
} from "@/lib/saas/saas-manager-limit-server"
import { evaluateSaasTabletRegistrationBlock } from "@/lib/saas/saas-tablet-limit-server"
import {
  generateTotpSecret,
  ipMatchesAllowlist,
  normalizeIpAllowlist,
  verifyTotpCode,
} from "@/lib/saas/saas-login-security"
import { createHmac } from "node:crypto"

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

  it("verifies totp for current step", () => {
    const secret = generateTotpSecret()
    // reimplement hotp briefly for expected code
    const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    const cleaned = secret.replace(/=+$/g, "")
    let bits = ""
    for (const c of cleaned) {
      const idx = BASE32.indexOf(c)
      if (idx >= 0) bits += idx.toString(2).padStart(5, "0")
    }
    const bytes: number[] = []
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
    const key = Buffer.from(bytes)
    const step = Math.floor(Date.now() / 1000 / 30)
    const buf = Buffer.alloc(8)
    buf.writeBigUInt64BE(BigInt(step))
    const hmac = createHmac("sha1", key).update(buf).digest()
    const offset = hmac[hmac.length - 1]! & 0xf
    const code =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff)
    const token = String(code % 1_000_000).padStart(6, "0")
    expect(verifyTotpCode(secret, token)).toBe(true)
    expect(verifyTotpCode(secret, "000000")).toBe(false)
  })
})
