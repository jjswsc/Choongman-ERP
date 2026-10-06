/** 매장 손익 매입 — 본사 창고 출고와 이중 집계 방지 (순수 함수, server-only 무관) */

export type HqVendorMatchIndex = {
  codes: Set<string>
  names: Set<string>
}

export type VendorRowForHqMatch = {
  code?: string
  name?: string
  gps_name?: string | null
  type?: string
}

/** 거래처 마스터 한 행이 본사(법인)인지 — type 누락·purchase 덮어쓰기 대비 */
export function vendorRowIsHeadOffice(r: VendorRowForHqMatch): boolean {
  const c = String(r.code || '').trim().toLowerCase()
  const t = String(r.type || '').trim().toLowerCase()
  if (c === 'hq') return true
  if (t === '본사' || t === 'head office' || t === 'hq') return true
  if (t.includes('본사') || t.includes('head office')) return true
  const nameBlob = `${r.name || ''} ${r.gps_name || ''}`.toLowerCase()
  if (/\(head office\)|\(본사\)/.test(nameBlob)) return true
  return false
}

export function buildHqVendorMatchIndex(rows: VendorRowForHqMatch[]): HqVendorMatchIndex {
  const codes = new Set<string>()
  const names = new Set<string>()
  for (const r of rows) {
    if (!vendorRowIsHeadOffice(r)) continue
    const c = String(r.code || '').trim().toLowerCase()
    if (c) codes.add(c)
    for (const n of [r.name, r.gps_name]) {
      const name = String(n || '').trim().toLowerCase()
      if (name) names.add(name)
    }
  }
  return { codes, names }
}

/** stock_logs.vendor_target·통장 vendor_code 등 집계 키가 본사 거래처인지 */
export function isHqVendorPurchaseKey(key: string, index: HqVendorMatchIndex): boolean {
  const norm = String(key || '').trim().toLowerCase()
  if (!norm) return false
  if (norm === 'from hq') return true
  if (index.codes.has(norm) || index.names.has(norm)) return true
  if (/\(head office\)|\(본사\)/.test(norm)) return true
  return false
}

export function partitionPurchaseVendorMapByHqCodes(
  byVendor: Record<string, number>,
  hqIndex: HqVendorMatchIndex
): { kept: Record<string, number>; excluded: { key: string; amount: number }[] } {
  const kept: Record<string, number> = {}
  const excluded: { key: string; amount: number }[] = []
  for (const [k, v] of Object.entries(byVendor)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    if (isHqVendorPurchaseKey(k, hqIndex)) {
      excluded.push({ key: k, amount: amt })
      continue
    }
    kept[k] = amt
  }
  return { kept, excluded }
}

export function shouldSkipStoreInboundForHqPurchase(
  vendorTarget: string,
  referenceNo: string,
  excludeFromHqInbound: boolean,
  hqIndex?: HqVendorMatchIndex
): boolean {
  const vendor = String(vendorTarget || '').trim()
  const ref = String(referenceNo || '').trim()
  if (excludeFromHqInbound && vendor === 'From HQ') return true
  if (vendor === 'From HQ' && !ref) return true
  if (excludeFromHqInbound && hqIndex && isHqVendorPurchaseKey(vendor, hqIndex)) return true
  return false
}

export function isFromHqInboundVendor(vendorTarget: string): boolean {
  return String(vendorTarget || '').trim().toLowerCase() === 'from hq'
}

/**
 * 직접정산(지두방) 수령 입고 단가.
 * 출고 스냅샷(invoice)이 있으면 그 값. 없으면 본사→매장 판매가(items.price).
 * 집계가 품목 원가(items.cost)로 떨어진 경우에만 판매가로 바꾼다.
 */
export function directSettlementStoreUnitPrice(params: {
  invoiceUnitPrice?: number | null
  aggregatedUnit?: number | null
  masterPrice: number
  masterCost: number
}): number {
  const invoice = Number(params.invoiceUnitPrice)
  if (Number.isFinite(invoice) && invoice > 0) return invoice
  const unit = Number(params.aggregatedUnit)
  const price = Number(params.masterPrice) || 0
  const cost = Number(params.masterCost) || 0
  const unitOk = Number.isFinite(unit) && unit > 0
  if (unitOk && price > 0 && cost > 0 && Math.abs(unit - cost) <= 0.05 && Math.abs(price - cost) > 0.05) {
    return price
  }
  if (unitOk && !(cost > 0 && Math.abs(unit - cost) <= 0.05 && price > 0)) return unit
  return price > 0 ? price : unitOk ? unit : 0
}
