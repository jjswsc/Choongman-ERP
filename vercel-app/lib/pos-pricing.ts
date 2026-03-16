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

  return {
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    baseTotal,
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
