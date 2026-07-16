import { parsePurchaseOrderCart } from "@/lib/purchase-order-cart"
import { vendorForSalesOutletStore, type PoVendorStoreRow } from "@/lib/po-vendor-store-match"

export type PoInvoiceBillToVendor = {
  vendorName: string
  address?: string
  taxId?: string
  phone?: string
  relatedStore?: string
}

export type PoInvoiceBillToVendorRow = PoVendorStoreRow

/**
 * 회계 PO·미수금 Tax Invoice BILL TO — 발주 인쇄(admin-purchase-order-history.printPo)와 동일 규칙.
 * 거래처명·Tax ID는 purchase_orders.vendor + vendors 마스터, 매장(relatedStore)은 보조 메타.
 */
export function resolvePoInvoiceBillToVendor(
  po: { vendor_code?: string; vendor_name?: string; cart_json?: unknown },
  vendors: PoInvoiceBillToVendorRow[]
): PoInvoiceBillToVendor {
  const { meta } = parsePurchaseOrderCart(po.cart_json)
  const relStore = String(meta?.relatedStore ?? "").trim()
  const vendorCode = String(po.vendor_code ?? "").trim()
  const vendorNameOnPo = String(po.vendor_name ?? "").trim()

  const vendor =
    vendors.find((v) => {
      const code = String(v.code ?? "").trim()
      const name = String(v.name ?? "").trim()
      return (vendorCode && code === vendorCode) || (vendorNameOnPo && name === vendorNameOnPo)
    }) ??
    (relStore && relStore !== "_none"
      ? vendorForSalesOutletStore(vendors, relStore)
      : undefined)

  return {
    vendorName: vendorNameOnPo || String(vendor?.name ?? "").trim() || "-",
    address: vendor?.address || undefined,
    taxId: vendor?.taxId || undefined,
    phone: vendor?.phone || undefined,
    relatedStore: relStore || undefined,
  }
}

export function mapDbVendorRowToPoBillTo(
  row: {
    code?: string
    name?: string
    addr?: string
    tax_id?: string
    phone?: string
    sales_outlet?: string
    gps_name?: string
  } | null
  | undefined
): PoInvoiceBillToVendorRow | null {
  if (!row?.code && !row?.name) return null
  return {
    code: String(row.code ?? "").trim() || undefined,
    name: String(row.name ?? "").trim() || undefined,
    address: String(row.addr ?? "").trim() || undefined,
    taxId: String(row.tax_id ?? "").trim() || undefined,
    phone: String(row.phone ?? "").trim() || undefined,
    salesOutlet: String(row.sales_outlet ?? "").trim() || null,
    gpsName: String(row.gps_name ?? "").trim() || null,
  }
}
