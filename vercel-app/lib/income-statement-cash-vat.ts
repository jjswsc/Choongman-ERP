/**
 * 손익 VAT 제외 — 통장·패티·지급예정 명시 VAT만 차감 (추정 금지).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export type PlCashVatSplit = {
  gross: number
  vat: number
  net: number
}

/**
 * 명시 vat_amount만 인정. vat<=0 또는 vat>=gross 이면 차감하지 않음.
 * 7%/107 추정 없음.
 */
export function safePlCashVat(amount: number, vatAmount: number | null | undefined): PlCashVatSplit {
  const gross = Math.max(0, Math.abs(Number(amount) || 0))
  if (gross <= 0) return { gross: 0, vat: 0, net: 0 }
  const vatRaw = Math.max(0, Math.abs(Number(vatAmount) || 0))
  if (vatRaw <= 0 || vatRaw >= gross) {
    return { gross, vat: 0, net: gross }
  }
  const vat = round2(vatRaw)
  return { gross, vat, net: round2(gross - vat) }
}

/**
 * 통장에 vat가 없고 지출등록에만 있을 때 — 부분지급 비례.
 * bankVat가 있으면 통장 값만 사용.
 */
export function resolveBankPlCashVat(params: {
  bankAmount: number
  bankVatAmount: number | null | undefined
  accrualGross?: number | null
  accrualVat?: number | null
}): PlCashVatSplit {
  const bankGross = Math.max(0, Math.abs(Number(params.bankAmount) || 0))
  const fromBank = safePlCashVat(bankGross, params.bankVatAmount)
  if (fromBank.vat > 0) return fromBank

  const accrualGross = Math.max(0, Math.abs(Number(params.accrualGross) || 0))
  const accrualVat = Math.max(0, Math.abs(Number(params.accrualVat) || 0))
  if (bankGross <= 0 || accrualGross <= 0 || accrualVat <= 0 || accrualVat >= accrualGross) {
    return { gross: bankGross, vat: 0, net: bankGross }
  }
  const scaled = round2(Math.min(accrualVat, bankGross) * (bankGross / accrualGross))
  return safePlCashVat(bankGross, scaled)
}
