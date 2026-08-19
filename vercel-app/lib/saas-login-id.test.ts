import {
  isSaasLoginId,
  normalizeSaasLoginId,
  saasLoginCompanyMatches,
  sanitizeSaasLoginIdTyping,
} from "./saas-login-id"

describe("saas-login-id", () => {
  it("normalizes display names to slug ids", () => {
    expect(normalizeSaasLoginId("JR Inter")).toBe("jrinter")
    expect(normalizeSaasLoginId("jr inter")).toBe("jrinter")
    expect(normalizeSaasLoginId("JR  Inter")).toBe("jrinter")
    expect(normalizeSaasLoginId(" jrinter ")).toBe("jrinter")
    expect(normalizeSaasLoginId("jr-inter")).toBe("jr-inter")
    expect(normalizeSaasLoginId("OmniFoodTech")).toBe("omnifoodtech")
  })

  it("strips spaces while typing", () => {
    expect(sanitizeSaasLoginIdTyping("JR Inter")).toBe("jrinter")
    expect(sanitizeSaasLoginIdTyping("admin")).toBe("admin")
  })

  it("accepts slug ids and rejects empty", () => {
    expect(isSaasLoginId("jrinter")).toBe(true)
    expect(isSaasLoginId("jr-inter")).toBe(true)
    expect(isSaasLoginId("admin")).toBe(true)
    expect(isSaasLoginId("JR Inter")).toBe(true)
    expect(isSaasLoginId("")).toBe(false)
    expect(isSaasLoginId("--")).toBe(false)
  })

  it("matches company with or without spaces", () => {
    expect(saasLoginCompanyMatches("JR Inter", "JR Inter")).toBe(true)
    expect(saasLoginCompanyMatches("jr inter", "JR Inter")).toBe(true)
    expect(saasLoginCompanyMatches("JR Inter", "jrinter")).toBe(true)
    expect(saasLoginCompanyMatches("jrinter", "JR Inter")).toBe(true)
    expect(saasLoginCompanyMatches("jr-inter", "jrinter")).toBe(true)
    expect(saasLoginCompanyMatches("omnifoodtech", "OmniFoodTech")).toBe(true)
    expect(saasLoginCompanyMatches("jrinter", "other")).toBe(false)
  })
})
