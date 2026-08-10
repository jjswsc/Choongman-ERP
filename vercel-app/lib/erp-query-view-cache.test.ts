import { describe, expect, it } from "vitest"
import { createErpQueryViewCache } from "./erp-query-view-cache"

describe("createErpQueryViewCache", () => {
  it("saves reads and clears", () => {
    const cache = createErpQueryViewCache<{ n: number }>()
    expect(cache.read()).toBeNull()
    cache.save({ n: 7 })
    expect(cache.read()?.n).toBe(7)
    cache.clear()
    expect(cache.read()).toBeNull()
  })
})
