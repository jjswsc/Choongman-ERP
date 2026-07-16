/** vendors.sales_outlet / gps_name ↔ POS·ERP 매장명 매칭 (회계 PO 공용) */

export type PoVendorStoreRow = {
  code?: string
  name?: string
  address?: string
  taxId?: string
  phone?: string
  salesOutlet?: string | null
  gpsName?: string | null
}

function stripCmPrefix(x: string): string {
  return x.replace(/^cm\s+/i, "").trim().toLowerCase()
}

export function vendorMatchesStoreName(v: PoVendorStoreRow, storeName: string): boolean {
  const s = String(storeName || "").trim()
  if (!s || s === "_none") return false
  const lower = s.toLowerCase()
  const sStripped = stripCmPrefix(s)
  const out = String(v.salesOutlet ?? "").trim()
  const gps = String(v.gpsName ?? "").trim()
  if (out && (out === s || out.toLowerCase() === lower)) return true
  if (gps && (gps === s || gps.toLowerCase() === lower)) return true
  if (out && stripCmPrefix(out) === sStripped) return true
  if (gps && stripCmPrefix(gps) === sStripped) return true
  return false
}

export function vendorForSalesOutletStore<T extends PoVendorStoreRow>(
  vendors: T[],
  storeName: string
): T | null {
  const s = String(storeName || "").trim()
  if (!s || s === "_none") return null
  for (const v of vendors) {
    if (vendorMatchesStoreName(v, s)) return v
  }
  return null
}
