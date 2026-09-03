import { describe, expect, it } from "vitest"
import { canAccessSaasAdmin } from "@/lib/permissions"

describe("canAccessSaasAdmin", () => {
  it("allows office and accounting roles", () => {
    expect(canAccessSaasAdmin("Director")).toBe(true)
    expect(canAccessSaasAdmin("Officer")).toBe(true)
    expect(canAccessSaasAdmin("Accounting")).toBe(true)
  })

  it("denies franchise manager and franchisee", () => {
    expect(canAccessSaasAdmin("Manager")).toBe(false)
    expect(canAccessSaasAdmin("Franchisee")).toBe(false)
  })

  it("still denies Omni ERP-elevated manager", () => {
    expect(canAccessSaasAdmin("Manager")).toBe(false)
  })
})
