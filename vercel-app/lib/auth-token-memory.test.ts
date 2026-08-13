import { afterEach, describe, expect, it } from "vitest"
import { getMemoryAuthToken, setMemoryAuthToken } from "@/lib/auth-token-memory"

describe("auth-token-memory", () => {
  afterEach(() => {
    setMemoryAuthToken(null)
  })

  it("stores and clears the in-memory JWT", () => {
    setMemoryAuthToken("abc.def.ghi")
    expect(getMemoryAuthToken()).toBe("abc.def.ghi")
    setMemoryAuthToken("  ")
    expect(getMemoryAuthToken()).toBeNull()
    setMemoryAuthToken(undefined)
    expect(getMemoryAuthToken()).toBeNull()
  })
})
