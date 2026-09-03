import { describe, expect, it } from "vitest"
import {
  canAccessSaasAdmin,
  canAccessSettings,
  isManagerRole,
  isNativeOfficeRole,
  isOfficeRole,
  isOmniManagerOfficeEquivalent,
} from "@/lib/permissions"

describe("Omni Manager = Officer (ERP only)", () => {
  it("treats Omni Manager as office, not store-manager", () => {
    expect(isOmniManagerOfficeEquivalent("Manager", "omnifoodtech")).toBe(true)
    expect(isOfficeRole("Manager", "omnifoodtech")).toBe(true)
    expect(isManagerRole("Manager", "omnifoodtech")).toBe(false)
    expect(canAccessSettings("Manager", "omnifoodtech")).toBe(true)
  })

  it("keeps Choongman Manager as store-manager", () => {
    expect(isOmniManagerOfficeEquivalent("Manager", "choongman")).toBe(false)
    expect(isOfficeRole("Manager", "choongman")).toBe(false)
    expect(isManagerRole("Manager", "choongman")).toBe(true)
    expect(canAccessSettings("Manager", "choongman")).toBe(false)
  })

  it("does not elevate Omni Franchisee", () => {
    expect(isOmniManagerOfficeEquivalent("Franchisee", "omnifoodtech")).toBe(false)
    expect(isOfficeRole("Franchisee", "omnifoodtech")).toBe(false)
    expect(isManagerRole("Franchisee", "omnifoodtech")).toBe(false)
  })

  it("does not grant SaaS control plane to Omni Manager", () => {
    expect(isNativeOfficeRole("Manager")).toBe(false)
    expect(canAccessSaasAdmin("Manager")).toBe(false)
    expect(canAccessSaasAdmin("Officer")).toBe(true)
  })
})
