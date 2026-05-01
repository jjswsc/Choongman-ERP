import type { PosOrder } from '@/lib/api-client'
import { computePosPricing, type PosPricingAdjustments } from '@/lib/pos-pricing'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'

export function posOrderRowPaymentSum(row: Record<string, unknown>): number {
  return (
    Number(row.payment_cash ?? 0) +
    Number(row.payment_card ?? 0) +
    Number(row.payment_qr ?? 0) +
    Number(row.payment_other ?? 0) +
    Number((row as { payment_delivery_app?: unknown }).payment_delivery_app ?? 0)
  )
}

export function posOrderPaymentSum(order: PosOrder): number {
  return (
    Number(order.paymentCash ?? 0) +
    Number(order.paymentCard ?? 0) +
    Number(order.paymentQr ?? 0) +
    Number(order.paymentOther ?? 0) +
    Number(order.paymentDeliveryApp ?? 0)
  )
}

export function isPosOrderPaidLikeStatus(status: string): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'paid' || s === 'completed'
}

function posOrderItemsToReceiptLines(order: PosOrder) {
  return (order.items || []).map((it) => ({
    id: String(it.id ?? ''),
    name: String(it.name ?? ''),
    price: Number(it.price ?? 0),
    qty: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
    ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
    ...(Array.isArray(it.promoItems) && it.promoItems.length > 0 ? { promoItems: it.promoItems } : {}),
  }))
}

/** 영수증 관리 등: DB에 저장된 합계·부가세로 재인쇄 (당시 요금 재계산 없음) */
export function receiptModalDataFromPosOrderReprint(order: PosOrder): ReceiptModalData {
  const v = Number(order.vat ?? 0) || 0
  return {
    orderNo: order.orderNo ?? '',
    items: posOrderItemsToReceiptLines(order),
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee,
    packagingFee: order.packagingFee,
    total: order.total ?? 0,
    storeCode: order.storeCode,
    orderType: order.orderType,
    tableName: order.tableName,
    memo: order.memo,
    discountReason: order.discountReason,
    ...(v > 0.001 ? { vatFeeAmt: v, vatFeeMode: 'separate' as const } : {}),
    receiptAutoPrintContext: 'payment',
    suppressReceiptModalAutoPrint: true,
  }
}

/** 결제 완료 영수증 모달용 데이터 (메인 포스 Realtime·폴링에서 인쇄) */
export function receiptModalDataFromPosOrderForPayment(
  order: PosOrder,
  adjustments: PosPricingAdjustments
): ReceiptModalData {
  const pricing = computePosPricing({
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    packagingFee: order.packagingFee ?? 0,
    cardPaymentAmount: order.paymentCard ?? 0,
    adjustments,
  })
  return {
    orderNo: order.orderNo ?? '',
    items: posOrderItemsToReceiptLines(order),
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee,
    packagingFee: order.packagingFee,
    total: pricing.finalTotal,
    storeCode: order.storeCode,
    orderType: order.orderType,
    tableName: order.tableName,
    memo: order.memo,
    discountReason: order.discountReason,
    vatFeeAmt: pricing.vatFeeAmt,
    vatFeeMode: pricing.vatFeeMode,
    serviceFeeAmt: pricing.serviceFeeAmt,
    serviceFeeMode: pricing.serviceFeeMode,
    cardFeeAmt: pricing.cardFeeAmt,
    cardFeeMode: pricing.cardFeeMode,
    otherFeeAmt: pricing.otherFeeAmt,
    otherFeeMode: pricing.otherFeeMode,
    receiptAutoPrintContext: 'payment',
    suppressReceiptModalAutoPrint: false,
  }
}
