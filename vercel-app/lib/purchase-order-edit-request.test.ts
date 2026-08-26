import { afterEach, describe, expect, it } from "vitest"
import { isPoDraftEditableStatus } from "./purchase-order-cart"
import {
  consumePurchaseOrderEditRequest,
  requestPurchaseOrderEdit,
  subscribePurchaseOrderEditRequest,
} from "./purchase-order-edit-request"

describe("isPoDraftEditableStatus", () => {
  it("allows Draft and empty", () => {
    expect(isPoDraftEditableStatus("Draft")).toBe(true)
    expect(isPoDraftEditableStatus("draft")).toBe(true)
    expect(isPoDraftEditableStatus("")).toBe(true)
    expect(isPoDraftEditableStatus(undefined)).toBe(true)
  })

  it("blocks approved and cancelled", () => {
    expect(isPoDraftEditableStatus("Approved")).toBe(false)
    expect(isPoDraftEditableStatus("Cancelled")).toBe(false)
    expect(isPoDraftEditableStatus("canceled")).toBe(false)
  })
})

describe("purchase-order-edit-request", () => {
  afterEach(() => {
    consumePurchaseOrderEditRequest()
  })

  it("delivers the pending PO once", () => {
    requestPurchaseOrderEdit({ id: 7, po_no: "PO-7", status: "Draft" })
    expect(consumePurchaseOrderEditRequest()?.po_no).toBe("PO-7")
    expect(consumePurchaseOrderEditRequest()).toBeNull()
  })

  it("notifies subscribers", () => {
    let n = 0
    const unsub = subscribePurchaseOrderEditRequest(() => {
      n += 1
    })
    requestPurchaseOrderEdit({ id: 1, status: "Draft" })
    expect(n).toBe(1)
    unsub()
    requestPurchaseOrderEdit({ id: 2, status: "Draft" })
    expect(n).toBe(1)
  })
})
