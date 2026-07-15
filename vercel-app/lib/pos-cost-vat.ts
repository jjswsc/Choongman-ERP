/**
 * 원가율·이론원가 분석용 VAT 기준.
 * 품목 원가(items.cost)는 공급가(부가세 제외)이고, POS 판매가·주문 total은 보통 VAT 포함이므로
 * 원가율 분모는 부가세 제외 매출로 맞춘다(원가 계산기와 동일).
 */

import {
  resolveTaxInvoiceSubtotalBeforeVatForPrint,
  splitThaiVatInclusiveGrossForReceipt,
} from '@/lib/pos-pricing'
import { calculateExclVat } from '@/lib/cost-data'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** VAT 포함 금액 → 공급가 (태국 7%). vatIncluded=false면 그대로. */
export function toPosCostSalesExclVat(
  amount: number,
  vatIncluded: boolean = true
): number {
  const n = Math.max(0, Number(amount) || 0)
  if (n <= 0) return 0
  if (vatIncluded === false) return round2(n)
  return round2(calculateExclVat(n))
}

/**
 * 완료 주문 결제액 → 부가세 제외 순매출.
 * vat 컬럼이 있으면 total−vat, 없으면 VAT 포함(7%) 역산.
 */
export function resolvePosOrderSalesExclVat(order: {
  total?: number | null
  vat?: number | null
}): number {
  const total = Math.max(0, Number(order.total) || 0)
  if (total <= 0) return 0
  const vat = Math.max(0, Number(order.vat) || 0)
  if (vat > 0.0001) {
    const excl = resolveTaxInvoiceSubtotalBeforeVatForPrint(total, vat)
    if (excl != null) return excl
  }
  const split = splitThaiVatInclusiveGrossForReceipt(total, 7)
  return split?.exclusive ?? round2(total)
}

/**
 * 라인·할인 배분용: 주문에 VAT가 있으면 (total−vat)/total, 없으면 7% 역산 계수.
 * 라인 단가가 VAT 포함인 태국 POS 기본과 맞춤.
 */
export function resolvePosOrderVatExclFactor(order: {
  total?: number | null
  vat?: number | null
}): number {
  const total = Math.max(0, Number(order.total) || 0)
  const vat = Math.max(0, Number(order.vat) || 0)
  if (total > 0.0001 && vat > 0.0001 && total + 0.01 >= vat) {
    return Math.max(0, (total - vat) / total)
  }
  return 100 / 107
}
