export type PosPaymentTenderNormalizeInput = {
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: string | null
}

export type PosPaymentTenderNormalizeOutput = {
  paymentCard: number
  paymentQr: number
  usedCreditCardQr: boolean
}

function toNonNegativeAmount(v: unknown): number {
  return Math.max(0, Number(v || 0) || 0)
}

function normalizeQrType(v: unknown): 'THAI_QR' | 'CREDIT_CARD' | '' {
  const key = String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (!key) return ''
  if (key.includes('CREDIT') || key.includes('CARD') || key === 'QRCC') return 'CREDIT_CARD'
  if (key.includes('THAI') || key === 'THQR' || key === 'THAI_QR') return 'THAI_QR'
  return ''
}

/**
 * 카드 QR(CREDIT_CARD)은 UI 입력수단은 QR이지만 결산/회계 분류는 카드로 본다.
 * 저장 전 payment_qr 금액을 payment_card로 이관해 downstream 집계를 일관화한다.
 */
export function normalizePosPaymentTender(
  input: PosPaymentTenderNormalizeInput
): PosPaymentTenderNormalizeOutput {
  const paymentCard = toNonNegativeAmount(input.paymentCard)
  const paymentQr = toNonNegativeAmount(input.paymentQr)
  const qrType = normalizeQrType(input.paymentQrType)

  if (paymentQr > 0.005 && qrType === 'CREDIT_CARD') {
    return {
      paymentCard: paymentCard + paymentQr,
      paymentQr: 0,
      usedCreditCardQr: true,
    }
  }

  return {
    paymentCard,
    paymentQr,
    usedCreditCardQr: false,
  }
}
