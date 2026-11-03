/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest"
import { getClientUiLang, getRuntimeUiString } from "@/lib/runtime-ui-strings"

describe("error boundary runtime strings", () => {
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it("uses Thai copy when UI lang is th", () => {
    expect(getRuntimeUiString("th", "appErrorTitle")).toContain("แอป")
    expect(getRuntimeUiString("th", "appErrorRetry")).toBe("ลองอีกครั้ง")
    expect(getRuntimeUiString("th", "appErrorBody")).toContain("โหลด")
  })

  it("prefers sessionStorage lang, then localStorage", () => {
    localStorage.setItem("cm_lang", "th")
    expect(getClientUiLang()).toBe("th")
    sessionStorage.setItem("cm_lang", "en")
    expect(getClientUiLang()).toBe("en")
  })
})
