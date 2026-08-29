import { describe, expect, it } from "vitest"
import { splitStoreQuantities, storeDispatchQuantity } from "./marketing-store-qty"

describe("splitStoreQuantities", () => {
  it("puts remainder on the first stores", () => {
    expect(splitStoreQuantities(10, 3)).toEqual([4, 3, 3])
    expect(splitStoreQuantities(5, 5)).toEqual([1, 1, 1, 1, 1])
    expect(splitStoreQuantities(0, 2)).toEqual([0, 0])
    expect(splitStoreQuantities(8, 0)).toEqual([])
  })
})

describe("storeDispatchQuantity", () => {
  it("prefers the recorded store quantity", () => {
    expect(
      storeDispatchQuantity({
        checkQuantity: 7,
        materialQuantity: 10,
        storeCount: 2,
        storeIndex: 0,
      })
    ).toEqual({ qty: 7, estimated: false })
  })

  it("falls back to an even split of the item total", () => {
    expect(
      storeDispatchQuantity({
        checkQuantity: null,
        materialQuantity: 10,
        storeCount: 2,
        storeIndex: 1,
      })
    ).toEqual({ qty: 5, estimated: true })
  })
})
