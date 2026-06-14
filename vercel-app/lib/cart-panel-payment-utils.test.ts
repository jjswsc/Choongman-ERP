import { describe, expect, it } from "vitest"
import {
  mergeCartPanelPaymentSnapshots,
  sumCartPanelPaymentSnapshot,
} from "@/lib/cart-panel-payment-utils"

describe("cart-panel-payment-utils", () => {
  it("sums payment snapshot fields", () => {
    expect(
      sumCartPanelPaymentSnapshot({
        paymentCash: 100,
        paymentCard: 50,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 25,
      })
    ).toBe(175)
  })

  it("merges split payment snapshots", () => {
    const merged = mergeCartPanelPaymentSnapshots([
      { paymentCash: 100, paymentCard: 0, paymentQr: 0, paymentOther: 0 },
      { paymentCash: 0, paymentCard: 40, paymentQr: 0, paymentOther: 0, paymentDeliveryApp: 10 },
    ])
    expect(merged.paymentCash).toBe(100)
    expect(merged.paymentCard).toBe(40)
    expect(merged.paymentDeliveryApp).toBe(10)
  })
})
