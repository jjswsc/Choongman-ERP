/** 손익 매입 — stock_logs 거래처명·통장 vendor_code를 동일 거래처 키로 맞춤 */

export type VendorPurchaseKeyIndex = {
  aliasToCode: Map<string, string>
}

export type VendorRowForPurchaseKey = {
  code?: string
  name?: string
  gps_name?: string | null
}

function normAlias(s: string): string {
  return String(s || '').trim().toLowerCase()
}

export function buildVendorPurchaseKeyIndex(rows: VendorRowForPurchaseKey[]): VendorPurchaseKeyIndex {
  const aliasToCode = new Map<string, string>()
  for (const r of rows) {
    const code = String(r.code || '').trim()
    if (!code) continue
    for (const raw of [code, r.name, r.gps_name]) {
      const alias = normAlias(String(raw || ''))
      if (alias) aliasToCode.set(alias, code)
    }
  }
  return { aliasToCode }
}

export function resolvePurchaseVendorKey(raw: string, index: VendorPurchaseKeyIndex): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return '__pl_vendor_unknown__'
  return index.aliasToCode.get(normAlias(trimmed)) || trimmed
}

export function normalizeVendorAmountMap(
  byVendor: Record<string, number>,
  index: VendorPurchaseKeyIndex
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(byVendor)) {
    const amt = Number(v) || 0
    if (amt <= 0) continue
    const key = resolvePurchaseVendorKey(k, index)
    out[key] = (out[key] || 0) + amt
  }
  return out
}

/** 같은 기간 직접입고가 있으면 통장 매입지급은 미지급 정산 — 손익 매입에서 제외 */
export function excludeBankPurchasesWhenDirectInboundPresent(
  inboundByVendor: Record<string, number>,
  bankByVendor: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(bankByVendor)) {
    const bankAmt = Number(v) || 0
    if (bankAmt <= 0) continue
    if ((Number(inboundByVendor[k]) || 0) > 0) continue
    out[k] = bankAmt
  }
  return out
}

export function purchaseVendorKeyMatchesRaw(
  vendorKey: string,
  raw: string | null | undefined,
  index: VendorPurchaseKeyIndex
): boolean {
  const trimmed = String(raw || '').trim()
  if (vendorKey === '__pl_vendor_unknown__') return !trimmed
  if (!trimmed) return false
  return resolvePurchaseVendorKey(vendorKey, index) === resolvePurchaseVendorKey(trimmed, index)
}
