export type PosFeeMode = 'included' | 'separate'
export type PosCardFeeBaseMode = 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
/** 주문 합계에 누적되는 % 항목(카드비 제외) */
export type PosFeeStackKey = 'vat' | 'service' | 'other'
/** parallel=각각 기준금액에 독립, sequential=순서로 누적 */
export type PosFeeStackMode = 'parallel' | 'sequential'
/**
 * 결제·영수증 최종 합계 정수 바트 처리.
 * - round: 반올림 (기본, 기존 Math.round)
 * - floor: 반내림 (소수 버림)
 * - none: 그대로 (소수 2자리 유지)
 */
export type PosPaymentTotalRoundingMode = 'round' | 'floor' | 'none'

export const DEFAULT_FEE_STACK_ORDER: readonly PosFeeStackKey[] = ['service', 'vat', 'other'] as const

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
  /** 미설정 시 parallel(기존 동작 유지) */
  feeStackMode?: PosFeeStackMode
  /** sequential일 때 위에서 아래 적용 순서. 미설정 시 service→vat→other */
  feeStackOrder?: PosFeeStackKey[]
  /**
   * 결제·영수증·EDC 합계 정수 바트 처리 방식.
   * 미설정 시 round(반올림). `roundPaymentTotalToWholeBaht: false`면 none.
   */
  paymentTotalRoundingMode?: PosPaymentTotalRoundingMode
  /**
   * @deprecated `paymentTotalRoundingMode` 사용. false면 none, true/미설정은 round.
   */
  roundPaymentTotalToWholeBaht?: boolean
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

/** POS 결제·영수증 최종 합계 — 정수 바트(태국 1฿ 단위) 반올림 */
export function roundPosPaymentTotalBaht(n: number): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.round(v)
}

/** POS 결제·영수증 최종 합계 — 정수 바트 반내림 */
export function floorPosPaymentTotalBaht(n: number): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return 0
  // 81.999999 → 82로 보이는 부동소수 오차 완화 후 버림
  const cents = Math.round(v * 100)
  return Math.floor(cents / 100)
}

export function normalizePaymentTotalRoundingMode(
  raw: unknown,
  legacyRoundWholeBaht?: boolean
): PosPaymentTotalRoundingMode {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'floor' || s === 'down' || s === 'trunc') return 'floor'
  if (s === 'none' || s === 'off' || s === 'keep' || s === 'as_is' || s === 'asis') return 'none'
  if (s === 'round' || s === 'nearest' || s === 'half_up') return 'round'
  if (legacyRoundWholeBaht === false) return 'none'
  return 'round'
}

export function resolvePaymentTotalRoundingMode(
  adjustments?: PosPricingAdjustments
): PosPaymentTotalRoundingMode {
  if (adjustments?.paymentTotalRoundingMode != null) {
    return normalizePaymentTotalRoundingMode(adjustments.paymentTotalRoundingMode)
  }
  return normalizePaymentTotalRoundingMode(undefined, adjustments?.roundPaymentTotalToWholeBaht)
}

/** 결제 합계에 매장 반올림 모드 적용 */
export function applyPosPaymentTotalRounding(
  n: number,
  mode: PosPaymentTotalRoundingMode
): number {
  if (mode === 'none') return round2(Math.max(0, Number(n) || 0))
  if (mode === 'floor') return floorPosPaymentTotalBaht(n)
  return roundPosPaymentTotalBaht(n)
}

function shouldApplyPaymentTotalRounding(adjustments?: PosPricingAdjustments): boolean {
  return resolvePaymentTotalRoundingMode(adjustments) !== 'none'
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

export function normalizeFeeStackMode(v: unknown): PosFeeStackMode {
  return String(v || 'parallel') === 'sequential' ? 'sequential' : 'parallel'
}

/** 프린터/매장 설정 → 결제·영수증 재인쇄용 요금 조정 (터미널·메인기기와 동일 규칙) */
export function posPricingAdjustmentsFromPrinterSettings(
  settings:
    | {
        vatRate?: number | null
        vatMode?: string | null
        serviceRate?: number | null
        serviceMode?: string | null
        cardRate?: number | null
        cardMode?: string | null
        cardBaseMode?: string | null
        otherRate?: number | null
        otherMode?: string | null
        feeStackMode?: string | null
        feeStackOrder?: unknown
        paymentTotalRoundingMode?: string | null
        roundPaymentTotalToWholeBaht?: boolean | null
      }
    | null
    | undefined
): PosPricingAdjustments {
  const s = settings ?? {}
  const cardBase = String(s.cardBaseMode ?? '').trim().toLowerCase()
  return {
    vatRate: Math.max(0, Number(s.vatRate ?? 7)),
    vatMode: s.vatMode === 'separate' ? 'separate' : 'included',
    serviceRate: Math.max(0, Number(s.serviceRate ?? 0)),
    serviceMode: s.serviceMode === 'included' ? 'included' : 'separate',
    cardRate: Math.max(0, Number(s.cardRate ?? 0)),
    cardMode: s.cardMode === 'included' ? 'included' : 'separate',
    cardBaseMode:
      cardBase === 'card_plus_vat'
        ? 'card_plus_vat'
        : cardBase === 'card_plus_vat_service'
          ? 'card_plus_vat_service'
          : 'card_only',
    otherRate: Math.max(0, Number(s.otherRate ?? 0)),
    otherMode: s.otherMode === 'included' ? 'included' : 'separate',
    feeStackMode: normalizeFeeStackMode(s.feeStackMode),
    feeStackOrder: normalizeFeeStackOrder(s.feeStackOrder),
    paymentTotalRoundingMode: normalizePaymentTotalRoundingMode(
      s.paymentTotalRoundingMode,
      s.roundPaymentTotalToWholeBaht === false ? false : undefined
    ),
  }
}

export function normalizeFeeStackOrder(v: unknown): PosFeeStackKey[] {
  const allowed = new Set<PosFeeStackKey>(['vat', 'service', 'other'])
  let raw: unknown[] = []
  if (Array.isArray(v)) {
    raw = v
  } else if (typeof v === 'string') {
    const s = v.trim()
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s) as unknown
        if (Array.isArray(parsed)) raw = parsed
      } catch {
        raw = []
      }
    } else if (s) {
      raw = s.split(/[,|]/).map((x) => x.trim()).filter(Boolean)
    }
  }
  const seen = new Set<PosFeeStackKey>()
  const out: PosFeeStackKey[] = []
  for (const item of raw) {
    const k = String(item || '').trim() as PosFeeStackKey
    if (!allowed.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  for (const k of DEFAULT_FEE_STACK_ORDER) {
    if (!seen.has(k)) out.push(k)
  }
  return out
}

function calcFeeAmount(baseTotal: number, rate: number, mode: PosFeeMode): number {
  if (rate <= 0 || baseTotal <= 0) return 0
  if (mode === 'included') return round2(baseTotal * (rate / (100 + rate)))
  return round2(baseTotal * (rate / 100))
}

/** 카드비 기준액: VAT/서비스 포함 시 누적 순서 반영 */
function calcCardFeeBaseAmount(params: {
  cardPaymentAmount: number
  cardBaseMode: PosCardFeeBaseMode
  feeStackMode: PosFeeStackMode
  feeStackOrder: PosFeeStackKey[]
  vatRate: number
  vatMode: PosFeeMode
  serviceRate: number
  serviceMode: PosFeeMode
}): number {
  const {
    cardPaymentAmount,
    cardBaseMode,
    feeStackMode,
    feeStackOrder,
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
  } = params
  if (cardPaymentAmount <= 0 || cardBaseMode === 'card_only') return cardPaymentAmount

  const includeVat = cardBaseMode === 'card_plus_vat' || cardBaseMode === 'card_plus_vat_service'
  const includeService = cardBaseMode === 'card_plus_vat_service'

  if (feeStackMode === 'sequential' && includeService) {
    let running = cardPaymentAmount
    for (const key of feeStackOrder) {
      if (key === 'vat' && includeVat) {
        running = round2(running + calcFeeAmount(running, vatRate, vatMode))
      } else if (key === 'service' && includeService) {
        running = round2(running + calcFeeAmount(running, serviceRate, serviceMode))
      }
    }
    return running
  }

  const cardVatPart = includeVat ? calcFeeAmount(cardPaymentAmount, vatRate, vatMode) : 0
  const cardServicePart = includeService ? calcFeeAmount(cardPaymentAmount, serviceRate, serviceMode) : 0
  return round2(cardPaymentAmount + cardVatPart + cardServicePart)
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
  discountAmt?: number
  deliveryFee?: number
  packagingFee?: number
  vatFeeMode?: PosFeeMode
  receiptExclusiveSubtotalDisplay?: number
  receiptTaxableGrossForDisplay?: number
}): number {
  if (
    r.vatFeeMode === 'included' &&
    typeof r.receiptExclusiveSubtotalDisplay === 'number' &&
    typeof r.receiptTaxableGrossForDisplay === 'number'
  ) {
    const discountAmt = Math.max(0, Number(r.discountAmt ?? 0) || 0)
    const separateFees =
      Math.max(0, Number(r.deliveryFee ?? 0) || 0) + Math.max(0, Number(r.packagingFee ?? 0) || 0)
    const subtotalMatchesTaxableBase = Math.abs(r.subtotal - r.receiptTaxableGrossForDisplay) < 0.02
    if (
      separateFees <= 0.001 &&
      (discountAmt <= 0.001 || subtotalMatchesTaxableBase)
    ) {
      return r.receiptExclusiveSubtotalDisplay
    }
  }
  return r.subtotal
}

/** ใบกำกับภาษี(Tax Invoice): ยอดรวมย่อย = ราคาก่อน VAT (합계 − VAT) */
export function resolveTaxInvoiceSubtotalBeforeVatForPrint(total: number, vatPrint: number): number | null {
  const gross = Math.max(0, Number(total) || 0)
  const vat = Math.max(0, Number(vatPrint) || 0)
  if (gross <= 0.0001 || vat <= 0.0001) return null
  return round2(gross - vat)
}

/** VAT 포함 합계에서 공급가·세액 분해 (태국 POS 세금계산서 기본 7%) */
export function splitThaiVatInclusiveGrossForReceipt(
  gross: number,
  vatRatePercent = 7
): { exclusive: number; vat: number } | null {
  const rate = Math.max(0, Number(vatRatePercent) || 0)
  const g = Math.max(0, Number(gross) || 0)
  if (g <= 0.0001 || rate <= 0) return null
  const vat = round2((g * rate) / (100 + rate))
  return { exclusive: round2(g - vat), vat }
}

/**
 * 세금계산서 영수증: 공급가·VAT·합계 분해.
 * 영수증 데이터에 VAT가 없으면 합계(VAT 포함)에서 7% 역산.
 */
export function resolveTaxInvoiceReceiptVatBreakdown(params: {
  total: number
  vatFeeAmt?: number
  receiptVatDisplayAmt?: number
  vatRatePercent?: number
}): { subtotalBeforeVat: number; vat: number } | null {
  const total = Math.max(0, Number(params.total) || 0)
  if (total <= 0.0001) return null

  const existingVat = resolveReceiptVatPrintAmount({
    vatFeeAmt: params.vatFeeAmt,
    receiptVatDisplayAmt: params.receiptVatDisplayAmt,
  })
  if (existingVat > 0.0001) {
    const subtotalBeforeVat = resolveTaxInvoiceSubtotalBeforeVatForPrint(total, existingVat)
    if (subtotalBeforeVat != null) return { subtotalBeforeVat, vat: existingVat }
  }

  const split = splitThaiVatInclusiveGrossForReceipt(total, params.vatRatePercent ?? 7)
  if (!split) return null
  return { subtotalBeforeVat: split.exclusive, vat: split.vat }
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
  const feeStackMode = normalizeFeeStackMode(params.adjustments?.feeStackMode)
  const feeStackOrder = normalizeFeeStackOrder(params.adjustments?.feeStackOrder)

  const cardPaymentAmount = toNonNegative(params.cardPaymentAmount)
  const cardFeeBase = calcCardFeeBaseAmount({
    cardPaymentAmount,
    cardBaseMode,
    feeStackMode,
    feeStackOrder,
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
  })

  let vatFeeAmt = 0
  let serviceFeeAmt = 0
  let otherFeeAmt = 0

  // 포함(included): 기준금액에서 분해만 (합계에 더하지 않음)
  if (vatMode === 'included') vatFeeAmt = calcFeeAmount(baseTotal, vatRate, 'included')
  if (serviceMode === 'included') serviceFeeAmt = calcFeeAmount(baseTotal, serviceRate, 'included')
  if (otherMode === 'included') otherFeeAmt = calcFeeAmount(baseTotal, otherRate, 'included')

  if (feeStackMode === 'sequential') {
    let running = baseTotal
    for (const key of feeStackOrder) {
      if (key === 'vat' && vatMode === 'separate') {
        vatFeeAmt = calcFeeAmount(running, vatRate, 'separate')
        running = round2(running + vatFeeAmt)
      } else if (key === 'service' && serviceMode === 'separate') {
        serviceFeeAmt = calcFeeAmount(running, serviceRate, 'separate')
        running = round2(running + serviceFeeAmt)
      } else if (key === 'other' && otherMode === 'separate') {
        otherFeeAmt = calcFeeAmount(running, otherRate, 'separate')
        running = round2(running + otherFeeAmt)
      }
    }
  } else {
    if (vatMode === 'separate') vatFeeAmt = calcFeeAmount(baseTotal, vatRate, 'separate')
    if (serviceMode === 'separate') serviceFeeAmt = calcFeeAmount(baseTotal, serviceRate, 'separate')
    if (otherMode === 'separate') otherFeeAmt = calcFeeAmount(baseTotal, otherRate, 'separate')
  }

  const cardFeeAmt = calcFeeAmount(cardFeeBase, cardRate, cardMode)

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
  let finalTotal = round2(baseTotal + separateTotal)

  let receiptExclusiveSubtotalDisplay: number | undefined
  let receiptVatDisplayAmt: number | undefined
  const vatDisplayAnchor = (anchorBaht: number) => {
    if (vatMode !== 'included' || vatRate <= 0) return
    const split = splitVatInclusiveBahtForReceipt(anchorBaht, vatRate)
    if (split) {
      receiptExclusiveSubtotalDisplay = split.exclusive
      receiptVatDisplayAmt = split.vat
    }
  }
  vatDisplayAnchor(baseTotal)

  const roundingMode = resolvePaymentTotalRoundingMode(params.adjustments)
  if (shouldApplyPaymentTotalRounding(params.adjustments)) {
    const roundedTotal = applyPosPaymentTotalRounding(finalTotal, roundingMode)
    if (Math.abs(roundedTotal - finalTotal) > 0.0001) {
      finalTotal = roundedTotal
      vatDisplayAnchor(finalTotal)
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
