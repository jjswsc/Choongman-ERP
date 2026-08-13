/**
 * 원가율·이론원가 분석용 VAT 기준.
 * 품목 원가(items.cost)는 공급가(부가세 제외). 판매가·주문 total은 보통 VAT 포함.
 * 원가율 분모는 화면에서 VAT 포함/제외를 고를 수 있다(손익과 동일). 분자(원가)는 항상 공급가.
 */

import {
  resolveTaxInvoiceSubtotalBeforeVatForPrint,
  splitThaiVatInclusiveGrossForReceipt,
} from '@/lib/pos-pricing'
import { calculateExclVat } from '@/lib/cost-data'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 원가율 분모 보기 — 손익 `vatDisplayMode`와 같은 의미 */
export type PosCostVatView = 'included' | 'excluded'

export const POS_COST_VAT_VIEW_STORAGE_KEY = 'cm-pos-cost-vat-view'
export const DEFAULT_POS_COST_VAT_VIEW: PosCostVatView = 'included'

export function parsePosCostVatView(raw: unknown): PosCostVatView {
  return raw === 'excluded' ? 'excluded' : 'included'
}

export function readPosCostVatView(): PosCostVatView {
  if (typeof localStorage === 'undefined') return DEFAULT_POS_COST_VAT_VIEW
  try {
    return parsePosCostVatView(localStorage.getItem(POS_COST_VAT_VIEW_STORAGE_KEY))
  } catch {
    return DEFAULT_POS_COST_VAT_VIEW
  }
}

export function writePosCostVatView(view: PosCostVatView) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(POS_COST_VAT_VIEW_STORAGE_KEY, view)
  } catch {
    /* ignore quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cm-pos-cost-vat-view-changed'))
  }
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
 * 원가율·마진 분모. 원가(분자)는 바꾸지 않는다.
 * - excluded: 공급가 (기존 목록·계산기)
 * - included: 표시 판매가(VAT 포함). 메뉴가 이미 VAT 제외 가격이면 7%를 더한다.
 */
export function toPosCostSalesDenom(
  amount: number,
  priceVatIncluded: boolean = true,
  view: PosCostVatView = 'excluded'
): number {
  if (view === 'included') {
    const n = Math.max(0, Number(amount) || 0)
    if (n <= 0) return 0
    if (priceVatIncluded === false) return round2(n * 1.07)
    return round2(n)
  }
  return toPosCostSalesExclVat(amount, priceVatIncluded)
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
