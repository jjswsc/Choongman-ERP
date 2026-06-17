import { describe, expect, it } from "vitest"
import { resolvePoInvoiceBillToVendor } from "@/lib/po-invoice-bill-to"

describe("resolvePoInvoiceBillToVendor", () => {
  it("uses PO vendor_name (Pepsi) not receivable store_name (branch label)", () => {
    const billTo = resolvePoInvoiceBillToVendor(
      {
        vendor_code: "PEPSI",
        vendor_name: "Pepsi",
        cart_json: JSON.stringify({
          meta: { relatedStore: "สาขาซื้อเอง" },
          items: [{ name: "Promo", qty: 1, price: 100, store: "สาขาซื้อเอง" }],
        }),
      },
      [
        {
          code: "PEPSI",
          name: "Pepsi",
          address: "123 Bangkok",
          taxId: "0999999999999",
          phone: "02-000-0000",
        },
      ]
    )
    expect(billTo.vendorName).toBe("Pepsi")
    expect(billTo.taxId).toBe("0999999999999")
    expect(billTo.relatedStore).toBe("สาขาซื้อเอง")
  })

  it("falls back to vendor matched by relatedStore when PO vendor fields are empty", () => {
    const billTo = resolvePoInvoiceBillToVendor(
      {
        cart_json: JSON.stringify({
          meta: { relatedStore: "CM Rama 9" },
          items: [],
        }),
      },
      [
        {
          code: "FR01",
          name: "Franchise Co",
          salesOutlet: "CM Rama 9",
          taxId: "0100000000000",
        },
      ]
    )
    expect(billTo.vendorName).toBe("Franchise Co")
    expect(billTo.taxId).toBe("0100000000000")
  })
})
