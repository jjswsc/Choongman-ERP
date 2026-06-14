import { describe, expect, it } from "vitest"
import { evaluateSaasPosDeviceRegistrationBlock } from "@/lib/saas/saas-pos-device-limit-server"

describe("evaluateSaasPosDeviceRegistrationBlock", () => {
  it("allows when not enforcing (충만 legacy)", () => {
    expect(
      evaluateSaasPosDeviceRegistrationBlock({
        enforce: false,
        isNewDeviceForTenant: true,
        allowOverage: false,
        used: 99,
        maxPosDevices: 2,
      }).ok
    ).toBe(true)
  })

  it("blocks new device at limit", () => {
    const r = evaluateSaasPosDeviceRegistrationBlock({
      enforce: true,
      isNewDeviceForTenant: true,
      allowOverage: false,
      used: 4,
      maxPosDevices: 4,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe("saas_pos_device_limit")
  })

  it("allows overage when policy enabled", () => {
    expect(
      evaluateSaasPosDeviceRegistrationBlock({
        enforce: true,
        isNewDeviceForTenant: true,
        allowOverage: true,
        used: 20,
        maxPosDevices: 4,
      }).ok
    ).toBe(true)
  })
})
