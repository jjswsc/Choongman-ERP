import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { INBOUND_HQ_LOCATION, getStockLocationPatterns } from '@/lib/stock-location-patterns'

const STOCK_PURCHASE_FALLBACK_MAX_ROWS = 1_000_000

export type StockLogPurchaseAggRow = {
  item_code: string
  vendor_target: string
  reference_no: string
  location: string
  line_qty: number
  line_amount: number
}

function isOfficeLocation(loc: string): boolean {
  const n = String(loc || '').trim().toLowerCase()
  if (!n) return false
  if (n === INBOUND_HQ_LOCATION.toLowerCase()) return true
  return ['office', '본사', '오피스', '본점'].some((x) => n === x || n.includes(x))
}

function shouldFallbackStockLogPurchaseAgg(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('get_stock_logs_purchase_agg') ||
    msg.includes('42883') ||
    msg.includes('42703') ||
    msg.includes('reference_no') ||
    msg.includes('timeout') ||
    msg.includes('supabase rpc failed')
  )
}

async function fetchStockLogsPurchaseAggSelect(params: {
  logTypes: string[]
  startUtcIso: string
  endUtcExclusive: string
  locationPatterns: string[]
  vendorPatterns: string[] | null
  includeReferenceNo: boolean
}): Promise<StockLogPurchaseAggRow[]> {
  const typeList = params.logTypes.map((t) => encodeURIComponent(t)).join(',')
  let filter =
    `log_type=in.(${typeList})` +
    `&log_date=gte.${params.startUtcIso}&log_date=lt.${params.endUtcExclusive}`
  if (params.locationPatterns.length === 1) {
    filter += `&location=ilike.${encodeURIComponent(params.locationPatterns[0])}`
  } else if (params.locationPatterns.length > 1) {
    filter += `&or=(${params.locationPatterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
  }
  if (params.vendorPatterns && params.vendorPatterns.length === 1) {
    filter += `&vendor_target=ilike.${encodeURIComponent(params.vendorPatterns[0])}`
  } else if (params.vendorPatterns && params.vendorPatterns.length > 1) {
    filter += `&or=(${params.vendorPatterns.map((p) => `vendor_target.ilike.${encodeURIComponent(p)}`).join(',')})`
  }

  const selectCols = params.includeReferenceNo
    ? 'item_code,qty,unit_cost,invoice_unit_price,vendor_target,location,reference_no'
    : 'item_code,qty,unit_cost,invoice_unit_price,vendor_target,location'

  const rawRows = (await supabaseSelectFilterAllPages('stock_logs', filter, {
    select: selectCols,
    order: 'id.asc',
    pageSize: 8000,
    maxRows: STOCK_PURCHASE_FALLBACK_MAX_ROWS,
  })) as {
    item_code?: string
    qty?: number
    unit_cost?: number | null
    invoice_unit_price?: number | null
    vendor_target?: string
    location?: string
    reference_no?: string | null
  }[]

  const bucket = new Map<string, StockLogPurchaseAggRow>()
  for (const r of rawRows) {
    const item_code = String(r.item_code || '').trim()
    if (!item_code) continue
    const vendor_target = String(r.vendor_target || '').trim()
    const reference_no = params.includeReferenceNo ? String(r.reference_no || '').trim() : ''
    const location = String(r.location || '').trim()
    const key = `${item_code}\0${vendor_target}\0${reference_no}\0${location}`
    const qty = Math.abs(Number(r.qty) || 0)
    const unit = Number(r.invoice_unit_price ?? r.unit_cost ?? 0) || 0
    const amt = qty * unit
    const prev = bucket.get(key)
    if (prev) {
      prev.line_qty += qty
      prev.line_amount += amt
    } else {
      bucket.set(key, {
        item_code,
        vendor_target,
        reference_no,
        location,
        line_qty: qty,
        line_amount: amt,
      })
    }
  }
  return [...bucket.values()]
}

async function resolveDistinctNonOfficeLocationPatterns(): Promise<string[]> {
  try {
    const rows = (await supabaseRpc<{ location: string }[]>('get_distinct_stock_locations', {})) as
      | { location?: string }[]
      | null
    return (rows || [])
      .map((r) => String(r.location || '').trim())
      .filter((loc) => loc && !isOfficeLocation(loc))
  } catch {
    return []
  }
}

export async function fetchStockLogPurchaseAgg(params: {
  logTypes: string[]
  startUtcIso: string
  endUtcExclusive: string
  locationPatterns: string[]
  vendorPatterns?: string[] | null
}): Promise<{ rows: StockLogPurchaseAggRow[]; source: 'rpc' | 'select' }> {
  const vendorPatterns = params.vendorPatterns ?? null
  try {
    const raw = (await supabaseRpc<StockLogPurchaseAggRow[]>('get_stock_logs_purchase_agg', {
      p_log_types: params.logTypes,
      p_start_utc: params.startUtcIso,
      p_end_utc_exclusive: params.endUtcExclusive,
      p_location_patterns: params.locationPatterns,
      p_vendor_patterns: vendorPatterns,
    })) as StockLogPurchaseAggRow[] | null
    const rows = (raw || []).map((r) => ({
      item_code: String(r.item_code || '').trim(),
      vendor_target: String(r.vendor_target || '').trim(),
      reference_no: String(r.reference_no || '').trim(),
      location: String(r.location || '').trim(),
      line_qty: Number(r.line_qty) || 0,
      line_amount: Number(r.line_amount) || 0,
    }))
    return { rows, source: 'rpc' }
  } catch (e) {
    if (!shouldFallbackStockLogPurchaseAgg(e)) throw e
  }

  try {
    const rows = await fetchStockLogsPurchaseAggSelect({
      ...params,
      vendorPatterns,
      includeReferenceNo: true,
    })
    return { rows, source: 'select' }
  } catch (e2) {
    if (!shouldFallbackStockLogPurchaseAgg(e2)) throw e2
    const rows = await fetchStockLogsPurchaseAggSelect({
      ...params,
      vendorPatterns,
      includeReferenceNo: false,
    })
    return { rows, source: 'select' }
  }
}

/** 손익 입고 location 패턴 — 재고 화면과 동일 alias */
export async function resolvePurchaseLocationPatterns(
  locationFilter: string | null,
  excludeHqLocations: boolean
): Promise<string[]> {
  if (locationFilter) return getStockLocationPatterns(locationFilter)
  if (!excludeHqLocations) return []
  const patterns = await resolveDistinctNonOfficeLocationPatterns()
  // 빈 패턴이면 RPC가 전 location을 반환 → 본사 재고까지 매입에 섞임
  return patterns.length > 0 ? patterns : ['__pl_no_store_locations__']
}

export function resolvePurchaseVendorPatterns(storeFilter: string | null): string[] | null {
  if (!storeFilter || storeFilter === 'All') return null
  return getStockLocationPatterns(storeFilter)
}
