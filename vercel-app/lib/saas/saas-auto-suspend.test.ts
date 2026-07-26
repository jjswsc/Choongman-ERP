import { describe, expect, it } from "vitest"
import { shouldAutoSuspendTenant } from "@/lib/saas/saas-auto-suspend-server"

describe("shouldAutoSuspendTenant", () => {
  it("does not suspend already inactive", () => {
    expect(
      shouldAutoSuspendTenant({
        isActive: false,
        nextBillingYmd: "2020-01-01",
        overdueGraceDays: 0,
        autoSuspendOnOverdue: true,
        nowBangkokYmd: "2026-07-26",
      })
    ).toBe(false)
  })

  it("suspends when past billing + grace and autoSuspend on", () => {
    expect(
      shouldAutoSuspendTenant({
        isActive: true,
        subscriptionStatus: "active",
        nextBillingYmd: "2026-01-01",
        overdueGraceDays: 3,
        autoSuspendOnOverdue: true,
        nowBangkokYmd: "2026-07-26",
      })
    ).toBe(true)
  })

  it("stays grace within grace window", () => {
    expect(
      shouldAutoSuspendTenant({
        isActive: true,
        subscriptionStatus: "active",
        nextBillingYmd: "2026-07-20",
        overdueGraceDays: 10,
        autoSuspendOnOverdue: true,
        nowBangkokYmd: "2026-07-25",
      })
    ).toBe(false)
  })

  it("does not suspend when autoSuspend off", () => {
    expect(
      shouldAutoSuspendTenant({
        isActive: true,
        subscriptionStatus: "active",
        nextBillingYmd: "2020-01-01",
        overdueGraceDays: 0,
        autoSuspendOnOverdue: false,
        nowBangkokYmd: "2026-07-26",
      })
    ).toBe(false)
  })
})
