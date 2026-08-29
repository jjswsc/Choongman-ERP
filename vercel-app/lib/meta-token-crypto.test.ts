import { describe, expect, it } from "vitest"
import { decryptMetaToken, encryptMetaToken } from "./meta-token-crypto"

describe("meta token crypto", () => {
  it("round-trips a page token", () => {
    const plain = "EAABpage-token-example"
    expect(decryptMetaToken(encryptMetaToken(plain))).toBe(plain)
  })

  it("returns empty for empty input", () => {
    expect(encryptMetaToken("")).toBe("")
    expect(decryptMetaToken("")).toBe("")
    expect(decryptMetaToken("not-base64!!!")).toBe("")
  })
})
