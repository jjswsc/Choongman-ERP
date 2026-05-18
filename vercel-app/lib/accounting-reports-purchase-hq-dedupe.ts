/** 매장 손익 매입 — 본사 창고 출고와 이중 집계 방지 (순수 함수, server-only 무관) */

export function partitionPurchaseVendorMapByHqCodes(
  byVendor: Record<string, number>,
  hqVendorCodes: Set<string>
): { kept: Record<string, number>; excluded: { key: string; amount: number }[] } {
  const kept: Record<string, number> = {}
  const excluded: { key: string; amount: number }[] = []
  for (const [k, v] of Object.entries(byVendor)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    const norm = String(k).trim().toLowerCase()
    if (hqVendorCodes.has(norm)) {
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
  excludeFromHqInbound: boolean
): boolean {
  const vendor = String(vendorTarget || '').trim()
  const ref = String(referenceNo || '').trim()
  if (excludeFromHqInbound && vendor === 'From HQ') return true
  if (vendor === 'From HQ' && !ref) return true
  return false
}
