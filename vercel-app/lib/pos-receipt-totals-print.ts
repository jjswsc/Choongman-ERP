/**
 * 결제·홀 주문서 공통 — 소계/서비스/부가세 전 금액/VAT/Rounding/합계 표시 모델
 *
 * 인쇄 항등식:
 *   Amount Before VAT + VAT + Rounding + (별도 카드) + (별도 기타) = TOTAL
 *
 * Amount Before VAT (VAT 별도) = Sub Total − 할인 + 배달/포장 + (별도 서비스만)
 * Amount Before VAT (VAT 포함) = 세전 공급가액.
 *   할인·배달 때문에 Sub Total이 세포함 품목합으로 남으면, 포함가 순액에서 VAT를 뺀다.
 *   (안 그러면 Rounding이 VAT 전체를 상쇄함: 199−99, VAT 7.00 → Rounding −7.00)
 * Rounding = TOTAL − (Before VAT + VAT + 별도 카드/기타) — 정수 바트 맞춤 잔차만.
 */

import type { PosFeeMode } from '@/lib/pos-pricing'
import {
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  resolveTaxInvoiceReceiptVatBreakdown,
} from '@/lib/pos-pricing'

export const POS_RECEIPT_TOTAL_EQ_RULE = '================================'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 영수증 요율 표기: ` (10%)` — 0 이하면 빈 문자열 */
export function formatPosReceiptFeeRateSuffix(rate: number | undefined | null): string {
  const n = Number(rate)
  if (!Number.isFinite(n) || n <= 0) return ''
  const rounded = Math.round(n * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return ` (${text}%)`
}

export function appendPosReceiptFeeRateLabel(baseLabel: string, rate: number | undefined | null): string {
  return `${baseLabel}${formatPosReceiptFeeRateSuffix(rate)}`
}

/** 금액 비율로 % 추정(설정 없을 때 인쇄용) */
export function inferPosReceiptFeePercent(part: number, base: number): number | undefined {
  const p = Math.max(0, Number(part) || 0)
  const b = Math.max(0, Number(base) || 0)
  if (p <= 0.01 || b <= 0.01) return undefined
  const raw = (p / b) * 100
  const nearestInt = Math.round(raw)
  if (Math.abs(raw - nearestInt) < 0.2) return nearestInt
  return Math.round(raw * 10) / 10
}

export function resolvePosReceiptPrintFeeRates(params: {
  vatRate?: number | null
  serviceRate?: number | null
  printerVatRate?: number | null
  printerServiceRate?: number | null
  showVatRow: boolean
  showServiceRow: boolean
  vatPrint?: number
  serviceAmt?: number
  serviceBaseAmt?: number
  vatBaseAmt?: number
}): { vatRate?: number; serviceRate?: number } {
  const pick = (raw: number | null | undefined): number | undefined => {
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  let vatRate =
    pick(params.vatRate) ?? pick(params.printerVatRate) ?? (params.showVatRow ? 7 : undefined)
  let serviceRate = pick(params.serviceRate) ?? pick(params.printerServiceRate)

  if (params.showServiceRow && serviceRate == null) {
    serviceRate = inferPosReceiptFeePercent(params.serviceAmt ?? 0, params.serviceBaseAmt ?? 0)
  }
  if (params.showVatRow && vatRate == null) {
    vatRate = inferPosReceiptFeePercent(params.vatPrint ?? 0, params.vatBaseAmt ?? 0) ?? 7
  }
  return { vatRate, serviceRate }
}

export function resolvePosReceiptSubtotalAndVatPrint(params: {
  isTaxInvoice?: boolean
  total: number
  subtotal: number
  discountAmt?: number
  deliveryFee?: number
  packagingFee?: number
  vatFeeAmt?: number
  vatFeeMode?: PosFeeMode
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay?: number
  vatRatePercent?: number
}): { subtotalPrint: number; vatPrint: number; showVatRow: boolean } {
  const vatPrintFromFees = resolveReceiptVatPrintAmount({
    vatFeeAmt: params.vatFeeAmt,
    receiptVatDisplayAmt: params.receiptVatDisplayAmt,
  })
  const subtotalPrint = resolveReceiptSubtotalPrintAmount({
    subtotal: params.subtotal,
    discountAmt: params.discountAmt,
    deliveryFee: params.deliveryFee,
    packagingFee: params.packagingFee,
    vatFeeMode: params.vatFeeMode,
    receiptExclusiveSubtotalDisplay: params.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: params.receiptTaxableGrossForDisplay,
  })
  /**
   * Tax Invoice도 결제 영수증과 동일하게 품목 Sub Total + 수수료 스냅샷을 쓴다.
   * `total − VAT` 분해는 정수 바트 Rounding을 Before VAT에 섞어
   * (예: 110.00 → 110.30) VAT/Rounding 행이 빠지거나 왜곡된다.
   */
  if (params.isTaxInvoice && vatPrintFromFees <= 0.0001) {
    const breakdown = resolveTaxInvoiceReceiptVatBreakdown({
      total: params.total,
      vatFeeAmt: params.vatFeeAmt,
      receiptVatDisplayAmt: params.receiptVatDisplayAmt,
      vatRatePercent: params.vatRatePercent,
    })
    if (breakdown) {
      return {
        subtotalPrint: breakdown.subtotalBeforeVat,
        vatPrint: breakdown.vat,
        showVatRow: breakdown.vat > 0.0001,
      }
    }
  }
  const vatPrint = vatPrintFromFees
  return { subtotalPrint, vatPrint, showVatRow: vatPrint > 0.0001 }
}

/** 별도(service)일 때만 Sub Total 가산에 사용. 포함이면 0. */
export function resolvePosReceiptSeparateServiceAmtForPrint(params: {
  serviceFeeAmt?: number
  serviceFeeMode?: PosFeeMode
}): number {
  if (String(params.serviceFeeMode ?? 'separate') === 'included') return 0
  return Math.max(0, Number(params.serviceFeeAmt ?? 0) || 0)
}

function separateFeeAmt(amt: number | undefined, mode: PosFeeMode | undefined): number {
  if (String(mode ?? 'separate') === 'included') return 0
  return Math.max(0, Number(amt ?? 0) || 0)
}

/**
 * Amount Before VAT — 반올림 제외.
 * Tax Invoice fallback(`total − VAT`)일 때만 subtotalPrint가 이미 세전 합계이므로 그대로 사용.
 * VAT 포함 + 할인/배달이면 Sub Total은 세포함 품목합을 유지하고, 이 값이 공급가액이 된다.
 */
export function resolvePosReceiptAmountBeforeVat(params: {
  subtotalPrint: number
  discountAmtForPrint?: number
  deliveryFee?: number
  packagingFee?: number
  serviceFeeAmt?: number
  serviceFeeMode?: PosFeeMode
  /** true: subtotalPrint가 이미 세전 합계(서비스 포함, Rounding 제외 실패 시 Rounding 포함 가능) */
  isTaxInvoice?: boolean
  vatFeeMode?: PosFeeMode
  vatPrint?: number
  receiptExclusiveSubtotalDisplay?: number
  receiptTaxableGrossForDisplay?: number
}): number {
  const sub = Math.max(0, Number(params.subtotalPrint) || 0)
  if (params.isTaxInvoice) return round2(sub)
  const discount = Math.max(0, Number(params.discountAmtForPrint ?? 0) || 0)
  const delivery = Math.max(0, Number(params.deliveryFee ?? 0) || 0)
  const packaging = Math.max(0, Number(params.packagingFee ?? 0) || 0)
  const service = resolvePosReceiptSeparateServiceAmtForPrint({
    serviceFeeAmt: params.serviceFeeAmt,
    serviceFeeMode: params.serviceFeeMode,
  })
  const vatPrint = Math.max(0, Number(params.vatPrint ?? 0) || 0)
  const exclusiveRaw = params.receiptExclusiveSubtotalDisplay
  const exclusive =
    typeof exclusiveRaw === 'number' && Number.isFinite(exclusiveRaw) ? exclusiveRaw : undefined
  const taxableRaw = params.receiptTaxableGrossForDisplay
  const taxableGross =
    typeof taxableRaw === 'number' && Number.isFinite(taxableRaw) ? taxableRaw : undefined
  const vatIncluded = String(params.vatFeeMode ?? '') === 'included'

  if (vatIncluded && vatPrint > 0.0001) {
    // Sub Total이 이미 공급가액(할인 없음 등 exclusive 치환)이면 기존 식 유지
    if (exclusive != null && Math.abs(sub - exclusive) < 0.02) {
      return round2(sub - discount + delivery + packaging + service)
    }
    const inclusiveNet = round2(sub - discount + delivery + packaging)
    if (exclusive != null) {
      const exclusivePlusVat = round2(exclusive + vatPrint)
      if (
        Math.abs(exclusivePlusVat - inclusiveNet) < 0.05 ||
        (taxableGross != null && Math.abs(inclusiveNet - taxableGross) < 0.05)
      ) {
        return round2(exclusive + service)
      }
    }
    return round2(Math.max(0, inclusiveNet - vatPrint) + service)
  }

  return round2(sub - discount + delivery + packaging + service)
}

/**
 * 정수 바트 등 TOTAL 맞추기 차액.
 * Rounding +0.30 = 올림, Rounding -0.21 = 내림.
 */
export function resolvePosReceiptRoundingAmt(params: {
  total: number
  amountBeforeVat: number
  vatPrint: number
  cardFeeAmt?: number
  cardFeeMode?: PosFeeMode
  otherFeeAmt?: number
  otherFeeMode?: PosFeeMode
}): number {
  const total = Number(params.total)
  if (!Number.isFinite(total)) return 0
  const before = Number(params.amountBeforeVat) || 0
  const vat = Math.max(0, Number(params.vatPrint) || 0)
  const card = separateFeeAmt(params.cardFeeAmt, params.cardFeeMode)
  const other = separateFeeAmt(params.otherFeeAmt, params.otherFeeMode)
  return round2(total - before - vat - card - other)
}

/**
 * 소계 대비 할인이 정수 % (10·20·30 등)이면 그 퍼센트.
 * 결제 모달 퍼센트 할인은 `Math.floor(소계 × % / 100)` 이라 내림값도 인정한다.
 */
export function inferPosReceiptDiscountPercent(discountAmt: number, subtotal: number): number | null {
  const discount = Math.max(0, Number(discountAmt) || 0)
  const base = Math.max(0, Number(subtotal) || 0)
  if (discount <= 0.02 || base <= 0.02 || discount + 0.02 >= base) return null
  const nearest = Math.round((discount / base) * 100)
  if (nearest < 1 || nearest > 99) return null
  const rawProduct = (base * nearest) / 100
  const exact = round2(rawProduct)
  if (Math.abs(discount - exact) <= 0.02) return nearest
  /** 결제 모달은 퍼센트를 내림한다. 0.5를 깎아 만든 99≠50% 같은 우연은 퍼센트로 보지 않는다. */
  const floored = Math.floor(rawProduct)
  if (Math.abs(discount - floored) <= 0.02 && rawProduct - floored < 0.02) return nearest
  return null
}

/** `Discount (10%)` — 정수 %가 아니면 기본 라벨만 */
export function formatPosReceiptDiscountLabel(
  baseLabel: string,
  discountAmt: number,
  subtotal: number
): string {
  const pct = inferPosReceiptDiscountPercent(discountAmt, subtotal)
  if (pct == null) return baseLabel
  return `${baseLabel} (${pct}%)`
}

/** Sub Total − 할인. 배달·봉사료를 더하기 전 금액 */
export function resolvePosReceiptAmountAfterDiscount(subtotalPrint: number, discountAmt: number): number {
  return round2(Math.max(0, Number(subtotalPrint) || 0) - Math.max(0, Number(discountAmt) || 0))
}

export function formatPosReceiptRoundingAmtText(rounding: number): string {
  const r = round2(rounding)
  if (Math.abs(r) < 0.005) return '0.00'
  const abs = Math.abs(r).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return r > 0 ? `+${abs}` : `-${abs}`
}

export function buildPosReceiptTotalsLabels(params: {
  tr: (key: string, fallback: string) => string
  vatFeeMode?: PosFeeMode
  serviceFeeMode?: PosFeeMode
  vatRate?: number
  serviceRate?: number
}): {
  subtotalLabel: string
  serviceLabel: string
  amountBeforeVatLabel: string
  vatLabel: string
  roundingLabel: string
  totalLabel: string
} {
  const { tr, vatFeeMode, serviceFeeMode, vatRate, serviceRate } = params
  const subtotalLabel = tr('posReceiptSubTotal', 'Sub Total')
  let serviceLabel = appendPosReceiptFeeRateLabel(
    tr('posReceiptServiceCharge', 'Service Charge'),
    serviceRate
  )
  if (serviceFeeMode === 'included') {
    serviceLabel = `${serviceLabel}${tr('posFeeIncludedInTotalReceiptHint', ' (incl. in total)')}`
  }
  const amountBeforeVatLabel = tr('posReceiptAmountBeforeVat', 'Amount Before VAT')
  const vatBase = tr('posVatReceiptShortLabel', 'VAT')
  const vatWithRate = appendPosReceiptFeeRateLabel(vatBase, vatRate)
  const vatLabel =
    vatFeeMode === 'included'
      ? `${vatWithRate}${tr('posVatIncludedInTotalReceiptHint', ' (VAT included)')}`
      : vatWithRate
  const roundingLabel = tr('posReceiptRounding', 'Rounding')
  const totalRaw = tr('posTotal', 'TOTAL')
  const totalLabel = /^[A-Za-z]/.test(totalRaw.trim()) ? totalRaw.trim().toUpperCase() : totalRaw
  return {
    subtotalLabel,
    serviceLabel,
    amountBeforeVatLabel,
    vatLabel,
    roundingLabel,
    totalLabel,
  }
}
