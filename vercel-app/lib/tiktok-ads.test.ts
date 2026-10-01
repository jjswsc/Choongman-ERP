import { describe, expect, it } from "vitest"
import { decryptTikTokToken, encryptTikTokToken } from "./tiktok-token-crypto"
import { defaultTikTokReportRange } from "./tiktok-ads"

describe("tiktok token crypto", () => {
  it("round-trips an access token", () => {
    const plain = "tiktok-access-token-example"
    expect(decryptTikTokToken(encryptTikTokToken(plain))).toBe(plain)
  })

  it("returns empty for empty input", () => {
    expect(encryptTikTokToken("")).toBe("")
    expect(decryptTikTokToken("")).toBe("")
    expect(decryptTikTokToken("not-base64!!!")).toBe("")
  })
})

describe("tiktok report range", () => {
  it("uses explicit since/until when provided", () => {
    expect(defaultTikTokReportRange({ since: "2026-01-01", until: "2026-01-28" })).toEqual({
      since: "2026-01-01",
      until: "2026-01-28",
    })
  })

  it("defaults to 28 Bangkok calendar days", () => {
    const r = defaultTikTokReportRange()
    expect(r.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.until).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.preset).toBe("last_28d_bangkok")
  })
})
