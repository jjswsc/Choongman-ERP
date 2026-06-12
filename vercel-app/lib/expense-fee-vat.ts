/** 지출 등록 — 배달앱·카드 수수료 등 금액 입력 시 VAT 포함/별도 구분 */

/** 배달앱·카드 수수료 — 세금계산서 VAT는 항상 존재(포함가 vs 공급가+VAT) */
export type ExpenseFeeVatMode = 'included' | 'separate'

export const DELIVERY_CARD_FEE_VENDOR_CODES = new Set([
  'GRAB_FEE',
  'LINEMAN_FEE',
  'SHOPEE_FEE',
  'ROBINHOOD_FEE',
  'CARD_FEE',
  'CARD_INSTALLMENT_FEE',
])

export function roundExpenseBaht(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function splitVatFromInclusiveGross(gross: number): { net: number; vat: number; gross: number } {
  const g = Math.max(0, Number(gross) || 0)
  if (g <= 0) return { net: 0, vat: 0, gross: 0 }
  const vat = roundExpenseBaht((g * 7) / 107)
  const net = roundExpenseBaht(g - vat)
  return { net, vat, gross: g }
}

export function addVatToNetAmount(net: number): { net: number; vat: number; gross: number } {
  const n = Math.max(0, Number(net) || 0)
  if (n <= 0) return { net: 0, vat: 0, gross: 0 }
  const vat = roundExpenseBaht(n * 0.07)
  const gross = roundExpenseBaht(n + vat)
  return { net: n, vat, gross }
}

export function resolveExpenseFeeAmounts(
  inputAmount: number,
  mode: ExpenseFeeVatMode
): { gross: number; vat: number; net: number; invoiceReceived: boolean } {
  const input = Math.max(0, Number(inputAmount) || 0)
  if (input <= 0) {
    return { gross: 0, vat: 0, net: 0, invoiceReceived: false }
  }
  if (mode === 'separate') {
    const { net, vat, gross } = addVatToNetAmount(input)
    return { gross, vat, net, invoiceReceived: true }
  }
  const { net, vat, gross } = splitVatFromInclusiveGross(input)
  return { gross, vat, net, invoiceReceived: true }
}

export function isFeeVendorCode(code: string | undefined | null): boolean {
  return DELIVERY_CARD_FEE_VENDOR_CODES.has(String(code || '').trim().toUpperCase())
}
