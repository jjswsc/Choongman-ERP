/**
 * 출고 이력(stock_logs) ↔ 주문 cart_json 매칭·단가 (getCombinedOutboundHistory 와 공통)
 */
export type OrderCartLine = { code?: string; name?: string; spec?: string; qty?: number; price?: number }

const TZ_BANGKOK = 'Asia/Bangkok'

export function formatDateBangkok(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ_BANGKOK })
}

export function formatDateHourMinBangkok(d: Date): string {
  const date = d.toLocaleDateString('en-CA', { timeZone: TZ_BANGKOK })
  const t = d.toLocaleTimeString('en-GB', {
    timeZone: TZ_BANGKOK,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date} ${t}`
}

export function normLineName(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function findReceivedCartLineIndex(
  cart: OrderCartLine[],
  receivedIndices: number[],
  code: string,
  itemName: string
): number {
  const cTrim = String(code || '').trim()
  const rawName = String(itemName || '').trim()
  const nNorm = normLineName(itemName)
  if (!cTrim || !cart.length || !receivedIndices.length) return -1

  for (const ci of receivedIndices) {
    const line = cart[ci]
    if (!line || String(line.code || '').trim() !== cTrim) continue
    if (String(line.name || '').trim() === rawName) return ci
  }
  for (const ci of receivedIndices) {
    const line = cart[ci]
    if (!line || String(line.code || '').trim() !== cTrim) continue
    if (normLineName(String(line.name || '')) === nNorm) return ci
  }
  const byCode = receivedIndices.filter((ci) => {
    const line = cart[ci]
    return line && String(line.code || '').trim() === cTrim
  })
  if (byCode.length === 1) return byCode[0]
  return -1
}

/** stock_logs.invoice_unit_price 가 있으면 그 값(출고 확정 시 스냅샷) */
export function frozenInvoiceUnitPriceFromLog(row: {
  invoice_unit_price?: number | string | null
}): number | undefined {
  const raw = row.invoice_unit_price
  if (raw == null || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/** 출고 로그 줄 단가: 스냅샷 우선, 없으면 cart → 마스터 */
export function unitPriceFromOutboundLogSnapshot(
  row: { invoice_unit_price?: number | string | null },
  cart: OrderCartLine[] | undefined,
  code: string,
  itemName: string,
  masterPrice: number
): number {
  const f = frozenInvoiceUnitPriceFromLog(row)
  if (f != null) return f
  return unitPriceFromOrderCart(cart, code, itemName, masterPrice)
}

export function unitPriceFromOrderCart(
  cart: OrderCartLine[] | undefined,
  code: string,
  itemName: string,
  masterPrice: number
): number {
  const cTrim = String(code || '').trim()
  const rawName = String(itemName || '').trim()
  const nNorm = normLineName(itemName)
  if (!cTrim || !cart?.length) return masterPrice
  for (const line of cart) {
    if (String(line.code || '').trim() !== cTrim) continue
    if (rawName && String(line.name || '').trim() !== rawName) continue
    const p = Number(line.price)
    return Number.isFinite(p) ? p : masterPrice
  }
  for (const line of cart) {
    if (String(line.code || '').trim() !== cTrim) continue
    if (rawName && normLineName(String(line.name || '')) !== nNorm) continue
    const p = Number(line.price)
    return Number.isFinite(p) ? p : masterPrice
  }
  for (const line of cart) {
    if (String(line.code || '').trim() === cTrim) {
      const p = Number(line.price)
      return Number.isFinite(p) ? p : masterPrice
    }
  }
  return masterPrice
}
