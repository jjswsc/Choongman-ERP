export type PosFeeMode = 'included' | 'separate'
export type PosCardFeeBaseMode = 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'

export interface PosPricingAdjustments {
  vatRate?: number
  vatMode?: PosFeeMode
  serviceRate?: number
  serviceMode?: PosFeeMode
  cardRate?: number
  cardMode?: PosFeeMode
  cardBaseMode?: PosCardFeeBaseMode
  otherRate?: number
  otherMode?: PosFeeMode
}

export interface PosPricingResult {
  subtotal: number
  discountAmt: number
  deliveryFee: number
  packagingFee: number
  baseTotal: number
  /**
   * VAT 포함(included)일 때 영수증 소계 행에 쓸 공급가액(바트 정수).
   * 품목 합·할인 등으로 `subtotal !== baseTotal`이면 영수증에서는 원시 subtotal을 유지하고 이 값은 참고용만 채움.
   */
  receiptExclusiveSubtotalDisplay?: number
  /** VAT 포함일 때 영수증 부가세 행(바트 정수). 미포함·세율 0이면 미설정. */
  receiptVatDisplayAmt?: number
  vatFeeAmt: number
  vatFeeMode: PosFeeMode
  serviceFeeAmt: number
  serviceFeeMode: PosFeeMode
  cardFeeAmt: number
  cardFeeMode: PosFeeMode
  otherFeeAmt: number
  otherFeeMode: PosFeeMode
  includedTotal: number
  separateTotal: number
  finalTotal: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toNonNegative(n: unknown): number {
  return Math.max(0, Number(n ?? 0) || 0)
}

function normalizeMode(v: unknown): PosFeeMode {
  return String(v || 'separate') === 'included' ? 'included' : 'separate'
}

function normalizeCardBaseMode(v: unknown): PosCardFeeBaseMode {
  const m = String(v || 'card_only')
  if (m === 'card_plus_vat') return 'card_plus_vat'
  if (m === 'card_plus_vat_service') return 'card_plus_vat_service'
  return 'card_only'
}

function calcFeeAmount(baseTotal: number, rate: number, mode: PosFeeMode): number {
  if (rate <= 0 || baseTotal <= 0) return 0
  if (mode === 'included') return round2(baseTotal * (rate / (100 + rate)))
  return round2(baseTotal * (rate / 100))
}

/** VAT 포함 합계(정수 바트 앵커)를 공급가액·세액 정수로 나눔 — 합계 = 앵커 */
export function splitVatInclusiveBahtForReceipt(anchorBaht: number, vatRatePercent: number): { exclusive: number; vat: number } | null {
  const rate = Number(vatRatePercent)
  if (!Number.isFinite(rate) || rate <= 0) return null
  const t = Math.round(round2(Math.max(0, anchorBaht)))
  if (t <= 0) return null
  const rawVat = (t * rate) / (100 + rate)
  const vat = Math.round(rawVat)
  const exclusive = t - vat
  return { exclusive, vat }
}

/** 결제 영수증: 소계 금액(첫 행) */
export function resolveReceiptSubtotalPrintAmount(r: {
  subtotal: number
  vatFeeMode?: PosFeeMode
  receiptExclusiveSubtotalDisplay?: number
  receiptTaxableGrossForDisplay?: number
}): number {
  if (
    r.vatFeeMode === 'included' &&
    typeof r.receiptExclusiveSubtotalDisplay === 'number' &&
    typeof r.receiptTaxableGrossForDisplay === 'number' &&
    Math.abs(r.subtotal - r.receiptTaxableGrossForDisplay) < 0.02
  ) {
    return r.receiptExclusiveSubtotalDisplay
  }
  return r.subtotal
}

/** 결제 영수증: 부가세 금액 */
export function resolveReceiptVatPrintAmount(r: { vatFeeAmt?: number; receiptVatDisplayAmt?: number }): number {
  return typeof r.receiptVatDisplayAmt === 'number' ? r.receiptVatDisplayAmt : Math.max(0, Number(r.vatFeeAmt ?? 0) || 0)
}

/** `ReceiptModalData` 등에 그대로 펼쳐 넣을 VAT 표시용 필드 */
export function receiptTaxDisplayFieldsFromPricing(pricing: PosPricingResult): {
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay: number
} {
  return {
    ...(typeof pricing.receiptExclusiveSubtotalDisplay === 'number'
      ? { receiptExclusiveSubtotalDisplay: pricing.receiptExclusiveSubtotalDisplay }
      : {}),
    ...(typeof pricing.receiptVatDisplayAmt === 'number' ? { receiptVatDisplayAmt: pricing.receiptVatDisplayAmt } : {}),
    receiptTaxableGrossForDisplay: pricing.baseTotal,
  }
}

export function computePosPricing(params: {
  subtotal?: number
  discountAmt?: number
  deliveryFee?: number
  packagingFee?: number
  cardPaymentAmount?: number
  adjustments?: PosPricingAdjustments
}): PosPricingResult {
  const subtotal = toNonNegative(params.subtotal)
  const discountAmt = toNonNegative(params.discountAmt)
  const deliveryFee = toNonNegative(params.deliveryFee)
  const packagingFee = toNonNegative(params.packagingFee)
  const baseTotal = round2(Math.max(0, subtotal - discountAmt) + deliveryFee + packagingFee)

  const vatRate = toNonNegative(params.adjustments?.vatRate)
  const serviceRate = toNonNegative(params.adjustments?.serviceRate)
  const cardRate = toNonNegative(params.adjustments?.cardRate)
  const otherRate = toNonNegative(params.adjustments?.otherRate)
  const vatMode = normalizeMode(params.adjustments?.vatMode)
  const serviceMode = normalizeMode(params.adjustments?.serviceMode)
  const cardMode = normalizeMode(params.adjustments?.cardMode)
  const cardBaseMode = normalizeCardBaseMode(params.adjustments?.cardBaseMode)
  const otherMode = normalizeMode(params.adjustments?.otherMode)

  const cardPaymentAmount = toNonNegative(params.cardPaymentAmount)
  const cardVatPart =
    cardBaseMode === 'card_plus_vat' || cardBaseMode === 'card_plus_vat_service'
      ? calcFeeAmount(cardPaymentAmount, vatRate, vatMode)
      : 0
  const cardServicePart =
    cardBaseMode === 'card_plus_vat_service'
      ? calcFeeAmount(cardPaymentAmount, serviceRate, serviceMode)
      : 0
  const cardFeeBase = round2(cardPaymentAmount + cardVatPart + cardServicePart)

  const vatFeeAmt = calcFeeAmount(baseTotal, vatRate, vatMode)
  const serviceFeeAmt = calcFeeAmount(baseTotal, serviceRate, serviceMode)
  const cardFeeAmt = calcFeeAmount(cardFeeBase, cardRate, cardMode)
  const otherFeeAmt = calcFeeAmount(baseTotal, otherRate, otherMode)

  const includedTotal = round2(
    (vatMode === 'included' ? vatFeeAmt : 0) +
    (serviceMode === 'included' ? serviceFeeAmt : 0) +
    (cardMode === 'included' ? cardFeeAmt : 0) +
    (otherMode === 'included' ? otherFeeAmt : 0)
  )
  const separateTotal = round2(
    (vatMode === 'separate' ? vatFeeAmt : 0) +
    (serviceMode === 'separate' ? serviceFeeAmt : 0) +
    (cardMode === 'separate' ? cardFeeAmt : 0) +
    (otherMode === 'separate' ? otherFeeAmt : 0)
  )
  const finalTotal = round2(baseTotal + separateTotal)

  let receiptExclusiveSubtotalDisplay: number | undefined
  let receiptVatDisplayAmt: number | undefined
  if (vatMode === 'included' && vatRate > 0) {
    const split = splitVatInclusiveBahtForReceipt(baseTotal, vatRate)
    if (split) {
      receiptExclusiveSubtotalDisplay = split.exclusive
      receiptVatDisplayAmt = split.vat
    }
  }

  return {
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    baseTotal,
    receiptExclusiveSubtotalDisplay,
    receiptVatDisplayAmt,
    vatFeeAmt,
    vatFeeMode: vatMode,
    serviceFeeAmt,
    serviceFeeMode: serviceMode,
    cardFeeAmt,
    cardFeeMode: cardMode,
    otherFeeAmt,
    otherFeeMode: otherMode,
    includedTotal,
    separateTotal,
    finalTotal,
  }
}
