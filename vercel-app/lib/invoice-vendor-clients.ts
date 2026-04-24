import { supabaseSelectFilter } from "@/lib/supabase-server"

/** getInvoiceData·e-Tax: 인보이스 BILL TO 매칭에 쓰는 vendor 행 (중복 type 병합) */
export type InvoiceVendorForClient = {
  id?: number
  name?: string
  addr?: string
  tax_id?: string
  phone?: string
  gps_name?: string
  sales_outlet?: string
}

const SALES_VENDOR_TYPE_FILTERS = [
  "type=eq.매출처",
  "type=eq.sales",
  "type=eq.both",
  "type=eq.둘 다",
  "type=eq.매출",
] as const

/**
 * DB에 매출처+매입처·둘다가 섞여 있어도 인보이스 clients 맵에 모두 올릴 수 있게
 * 예전 로직(매출처 → 없을 때만 sales → 없을 때만 both)이면, sales가 한 건이라도 있을 때
 * type=both 전부가 BILL TO에서 누락됨.
 */
export async function fetchSalesTypesVendorsForInvoice(): Promise<InvoiceVendorForClient[]> {
  const batches = (await Promise.all(
    SALES_VENDOR_TYPE_FILTERS.map((f) => supabaseSelectFilter("vendors", f, { limit: 500 }))
  )) as InvoiceVendorForClient[][]
  const byId = new Map<number, InvoiceVendorForClient>()
  for (const batch of batches) {
    for (const r of batch || []) {
      const id = Number((r as { id?: number }).id)
      if (Number.isFinite(id) && id > 0) {
        if (!byId.has(id)) byId.set(id, r)
      }
    }
  }
  return [...byId.values()]
}
