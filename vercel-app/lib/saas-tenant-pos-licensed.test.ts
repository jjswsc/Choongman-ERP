import { describe, expect, it } from "vitest"
import { licensedPosSlotsFromStoreSettings } from "./saas-tenant-pos-licensed"
import { DEFAULT_POS_DEVICE_ROLE_LIMITS } from "./pos-device-role-limits"
import { sumLicensedPosFromStoreRows } from "./saas-tenant-pos-licensed"

describe("saas-tenant-pos-licensed", () => {
  it("sums main and order slots per store", () => {
    expect(
      licensedPosSlotsFromStoreSettings({
        mainDeviceMaxCount: 2,
        orderDeviceMaxCount: 5,
        mainDeviceRoleLocked: true,
      })
    ).toBe(7)
  })

  it("aggregates across tenant stores", () => {
    const map = new Map<string, { main_device_max_count: number; order_device_max_count: number }>()
    map.set("s1", { main_device_max_count: 1, order_device_max_count: 3 })
    map.set("s2", { main_device_max_count: 2, order_device_max_count: 4 })
    expect(sumLicensedPosFromStoreRows(["s1", "s2"], map)).toBe(10)
    expect(sumLicensedPosFromStoreRows(["missing"], map)).toBe(
      DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceMaxCount + DEFAULT_POS_DEVICE_ROLE_LIMITS.orderDeviceMaxCount
    )
  })
})
