import { describe, expect, it } from "vitest"
import { canAuthManageAttendanceQrStore } from "@/lib/attendance-qr-device-server"

describe("canAuthManageAttendanceQrStore", () => {
  it("lets Omni Manager register their own store", () => {
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Branch A",
        authRole: "Manager",
        targetStore: "Branch A",
        brandKey: "omnifoodtech",
      })
    ).toBe(true)
  })

  it("blocks Omni Manager from another store", () => {
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Branch A",
        authRole: "Manager",
        targetStore: "Branch B",
        brandKey: "omnifoodtech",
      })
    ).toBe(false)
  })

  it("lets Omni Manager at Office register any store", () => {
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Office",
        authRole: "Manager",
        targetStore: "Branch A",
        brandKey: "omnifoodtech",
      })
    ).toBe(true)
  })

  it("lets Omni Officer (tenant admin) register any store even if assigned to first branch", () => {
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Branch A",
        authRole: "Officer",
        targetStore: "Branch B",
        brandKey: "omnifoodtech",
      })
    ).toBe(true)
  })

  it("lets Choongman Manager register only their store", () => {
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Branch A",
        authRole: "Manager",
        targetStore: "Branch A",
        brandKey: "choongman",
      })
    ).toBe(true)
    expect(
      canAuthManageAttendanceQrStore({
        authStore: "Branch A",
        authRole: "Manager",
        targetStore: "Branch B",
        brandKey: "choongman",
      })
    ).toBe(false)
  })
})
