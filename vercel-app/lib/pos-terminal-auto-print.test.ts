import { describe, expect, it } from "vitest"
import {
  coercePosOrderIdFromRealtime,
  isSessionNewOrder,
  mergeStoreAutoPrintFlags,
  storeAutoPrintFlagsFromSettings,
} from "@/lib/pos-terminal-auto-print"
import { extractAmountFromEmvQrPayload } from "@/lib/pos-terminal-kbank-helpers"

describe("pos-terminal-auto-print", () => {
  it("coerces realtime order id from string bigint", () => {
    expect(coercePosOrderIdFromRealtime("12345")).toBe(12345)
    expect(coercePosOrderIdFromRealtime("abc")).toBeNull()
  })

  it("merges store auto-print flags with OR semantics", () => {
    const base = storeAutoPrintFlagsFromSettings({
      autoPrintReceiptOnOrder: true,
      autoPrintKitchenSlipOnOrder: false,
    } as never)
    const merged = mergeStoreAutoPrintFlags(base, {
      receiptOnOrder: false,
      receiptOnAddOrder: false,
      receiptOnPayment: false,
      kitchenOnOrder: true,
    })
    expect(merged.receiptOnOrder).toBe(true)
    expect(merged.kitchenOnOrder).toBe(true)
  })

  it("detects session-new order within grace", () => {
    const now = Date.now()
    expect(isSessionNewOrder(new Date(now).toISOString(), now - 1000, 5000)).toBe(true)
    expect(isSessionNewOrder(new Date(now - 60_000).toISOString(), now, 5000)).toBe(false)
  })
})

describe("pos-terminal-kbank-helpers", () => {
  it("parses EMV tag 54 amount", () => {
    // TLV stub: tag 54 length 06 value 199.00
    const payload = "5406199.00"
    expect(extractAmountFromEmvQrPayload(payload)).toBe(199)
  })
})
