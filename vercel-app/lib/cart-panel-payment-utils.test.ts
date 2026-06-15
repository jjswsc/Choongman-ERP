import { describe, expect, it } from "vitest"
import {
  capCartPanelPaymentSnapshot,
  mergeCartPanelPaymentSnapshots,
  mergeSplitOrderPaymentForSubmit,
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

  it("caps split capture to guest due amount", () => {
    const capped = capCartPanelPaymentSnapshot(
      { paymentCash: 0, paymentCard: 0, paymentQr: 389, paymentOther: 0 },
      269
    )
    expect(capped.paymentQr).toBe(269)
    expect(sumCartPanelPaymentSnapshot(capped)).toBe(269)
  })

  it("does not double-count current input when captures already match order total", () => {
    const merged = mergeSplitOrderPaymentForSubmit({
      captures: [
        { paymentCash: 0, paymentCard: 0, paymentQr: 269, paymentOther: 0 },
        { paymentCash: 0, paymentCard: 0, paymentQr: 120, paymentOther: 0 },
      ],
      current: { paymentCash: 0, paymentCard: 0, paymentQr: 120, paymentOther: 0 },
      orderTotal: 389,
    })
    expect(sumCartPanelPaymentSnapshot(merged)).toBe(389)
  })

  it("adds current input when captures are still short of order total", () => {
    const merged = mergeSplitOrderPaymentForSubmit({
      captures: [{ paymentCash: 0, paymentCard: 0, paymentQr: 269, paymentOther: 0 }],
      current: { paymentCash: 0, paymentCard: 0, paymentQr: 120, paymentOther: 0 },
      orderTotal: 389,
    })
    expect(sumCartPanelPaymentSnapshot(merged)).toBe(389)
  })
})
