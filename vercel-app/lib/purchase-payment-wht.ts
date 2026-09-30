/** 매입 실지급(순액)에서 부가세 포함 총액·원천세를 역산. 기본은 부가세 7%, 원천세는 부가세 제외 금액 기준. */

function roundMoney2(n: number): number {
  const rounded = Math.round(n * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

/** 부가세 포함 금액을 사탕 정수로 나눈 뒤 부가세 제외 금액을 반올림한다. */
function exVatBaseFromGross(gross: number, vatRate: number): number {
  const satang = Math.round(gross * 100)
  const divisor = Math.round((1 + vatRate) * 100)
  if (divisor <= 0) return roundMoney2(gross)
  return Math.round((satang / divisor) * 100) / 100
}

export function suggestPurchaseWhtFromNetPayment(
  netPaid: number,
  ratePercent = 3,
  vatRate = 0.07
): number {
  const net = Math.abs(Number(netPaid) || 0)
  const rate = Math.max(0, Number(ratePercent) || 0) / 100
  const vat = Math.max(0, Number(vatRate) || 0)
  if (net <= 0 || rate <= 0 || 1 + vat <= rate) return 0
  const gross = (net * (1 + vat)) / (1 + vat - rate)
  return roundMoney2(Math.max(0, gross - net))
}

/** 세금계산서 총액(부가세 포함)의 부가세 제외 금액 × 세율 */
export function purchaseWhtFromGrossInvoice(grossInclVat: number, ratePercent = 3, vatRate = 0.07): number {
  const gross = Math.abs(Number(grossInclVat) || 0)
  const rate = Math.max(0, Number(ratePercent) || 0) / 100
  const vat = Math.max(0, Number(vatRate) || 0)
  if (gross <= 0 || rate <= 0) return 0
  const base = vat > 0 ? exVatBaseFromGross(gross, vat) : roundMoney2(gross)
  return roundMoney2(base * rate)
}
