import { describe, expect, it, afterEach } from "vitest"
import {
  getOfficeTestStoreCodes,
  isChungmanRiskFeatureEnabledForStore,
  isOfficeTestStore,
} from "./chungman-office-test-config"
import { shouldEnforceSaasForAuth } from "./saas-enforce"

describe("saas-enforce", () => {
  it("shouldEnforceSaasForAuth is false without tenantId (Chungman legacy)", () => {
    expect(shouldEnforceSaasForAuth(undefined)).toBe(false)
    expect(shouldEnforceSaasForAuth("")).toBe(false)
  })

  it("shouldEnforceSaasForAuth is true when tenantId present", () => {
    expect(shouldEnforceSaasForAuth("acme")).toBe(true)
  })
})

describe("chungman-office-test-config", () => {
  const prev = process.env.CM_OFFICE_TEST_STORE_CODES

  afterEach(() => {
    if (prev === undefined) delete process.env.CM_OFFICE_TEST_STORE_CODES
    else process.env.CM_OFFICE_TEST_STORE_CODES = prev
  })

  it("isOfficeTestStore matches env list", () => {
    process.env.CM_OFFICE_TEST_STORE_CODES = "Office,HQ-Test"
    expect(getOfficeTestStoreCodes()).toEqual(["Office", "HQ-Test"])
    expect(isOfficeTestStore("Office")).toBe(true)
    expect(isOfficeTestStore("HQ-Test")).toBe(true)
    expect(isOfficeTestStore("Other-Store")).toBe(false)
    expect(isChungmanRiskFeatureEnabledForStore("Office")).toBe(true)
    expect(isChungmanRiskFeatureEnabledForStore("Other")).toBe(false)
  })

  it("risk feature off when office list empty", () => {
    delete process.env.CM_OFFICE_TEST_STORE_CODES
    expect(isChungmanRiskFeatureEnabledForStore("Office")).toBe(false)
  })
})
