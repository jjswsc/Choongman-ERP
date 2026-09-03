import { describe, expect, it } from "vitest"
import {
  CHUNK_RECOVERY_QUERY_PARAM,
  LOGIN_HARD_REFRESH_PARAM,
  isLoginHardRefreshUrl,
  loginNativeRefreshHref,
  withLoginHardRefreshParam,
} from "./login-hard-refresh"

describe("loginNativeRefreshHref", () => {
  it("adds a stable refresh query the browser can follow without React", () => {
    expect(loginNativeRefreshHref("/pos/login")).toBe(`/pos/login?${LOGIN_HARD_REFRESH_PARAM}=1`)
    expect(loginNativeRefreshHref("/pos/login/")).toBe(`/pos/login?${LOGIN_HARD_REFRESH_PARAM}=1`)
  })
})

describe("isLoginHardRefreshUrl", () => {
  it("detects refresh and chunk-recovery queries", () => {
    expect(isLoginHardRefreshUrl(new URL("https://x.example/pos/login"))).toBe(false)
    expect(isLoginHardRefreshUrl(new URL(`https://x.example/pos/login?${LOGIN_HARD_REFRESH_PARAM}=1`))).toBe(
      true
    )
    expect(isLoginHardRefreshUrl(new URL(`https://x.example/pos/login?${CHUNK_RECOVERY_QUERY_PARAM}=9`))).toBe(
      true
    )
  })
})

describe("withLoginHardRefreshParam", () => {
  it("stamps a unique refresh query onto the current path", () => {
    expect(withLoginHardRefreshParam("https://x.example/pos/login", 99)).toBe(
      `/pos/login?${LOGIN_HARD_REFRESH_PARAM}=99`
    )
  })
})
