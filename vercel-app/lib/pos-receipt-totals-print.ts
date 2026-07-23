/**
 * 결제·홀 주문서 공통 — 소계/서비스/부가세 전 금액/VAT/합계 표시 모델
 *
 * Amount Before VAT 항등식(인쇄 합계가 맞도록):
 *   Amount Before VAT + VAT + (별도 카드비) + (별도 기타) = TOTAL
 * 포함(included) 서비스/VAT는 합계에 더해지지 않으므로 Before VAT에 가산하지 않는다.
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
  /** 서비스 % 추정 분모(보통 소계) */
  serviceBaseAmt?: number
  /** VAT % 추정 분모(보통 Amount Before VAT) */
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
  if (params.isTaxInvoice) {
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
  const vatPrint = resolveReceiptVatPrintAmount({
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
  return { subtotalPrint, vatPrint, showVatRow: vatPrint > 0.0001 }
}

/**
 * Amount Before VAT = TOTAL − VAT − (별도 카드) − (별도 기타)
 * → 어떤 포함/별도·병렬/순차 조합이든 Before VAT + VAT (+별도 카드/기타) = TOTAL
 */
export function resolvePosReceiptAmountBeforeVat(params: {
  total: number
  vatPrint: number
  cardFeeAmt?: number
  cardFeeMode?: PosFeeMode
  otherFeeAmt?: number
  otherFeeMode?: PosFeeMode
}): number {
  const total = Number(params.total)
  const vat = Math.max(0, Number(params.vatPrint) || 0)
  const card =
    params.cardFeeMode === 'separate' ? Math.max(0, Number(params.cardFeeAmt ?? 0) || 0) : 0
  const other =
    params.otherFeeMode === 'separate' ? Math.max(0, Number(params.otherFeeAmt ?? 0) || 0) : 0
  if (!Number.isFinite(total)) return 0
  // void 등 음수 합계도 부호 유지
  const sign = total < 0 ? -1 : 1
  const absBefore = Math.max(0, Math.abs(total) - vat - card - other)
  return round2(sign * absBefore)
}

/** 별도(service)일 때만 Sub Total 가산에 사용. 포함이면 0(이미 소계·합계에 녹아 있음). */
export function resolvePosReceiptSeparateServiceAmtForPrint(params: {
  serviceFeeAmt?: number
  serviceFeeMode?: PosFeeMode
}): number {
  if (String(params.serviceFeeMode ?? 'separate') === 'included') return 0
  return Math.max(0, Number(params.serviceFeeAmt ?? 0) || 0)
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
      ? `${vatWithRate}${tr('posVatIncludedInTotalReceiptHint', ' (VAT incl. in total)')}`
      : vatWithRate
  const totalRaw = tr('posTotal', 'TOTAL')
  const totalLabel = /^[A-Za-z]/.test(totalRaw.trim()) ? totalRaw.trim().toUpperCase() : totalRaw
  return { subtotalLabel, serviceLabel, amountBeforeVatLabel, vatLabel, totalLabel }
}
