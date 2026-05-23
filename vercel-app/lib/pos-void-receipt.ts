import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import type { PosOrder } from '@/lib/api-client'
import {
  receiptModalDataFromPosOrderReprint,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'

/** 취소·void 영수증에 표시할 금액(음수) */
export function negatePosReceiptMoney(n: number | null | undefined): number {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v) || Math.abs(v) < 0.0001) return 0
  return -Math.abs(v)
}

export function buildReceiptVoidBannerHtml(tr: (key: string, fallback: string) => string): string {
  const label = tr('posReceiptVoided', 'Voided')
  return (
    '<div class="receipt-void-banner-wrap"><span class="receipt-void-banner">' +
    label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</span></div>'
  )
}

export const POS_RECEIPT_VOID_EXTRA_STYLES = `
  .receipt-void-banner-wrap { text-align: center; margin: 10px 0 12px; }
  .receipt-void-banner {
    display: inline-block;
    border: 2px solid #c00;
    color: #c00;
    padding: 4px 18px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.1em;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`

export function receiptModalDataForVoidReceipt(
  order: PosOrder,
  opts?: PosOrderReceiptLineOptions
): ReceiptModalData {
  const base = receiptModalDataFromPosOrderReprint(order, opts)
  const neg = negatePosReceiptMoney
  return {
    ...base,
    voidReceiptMode: true,
    receiptAutoPrintContext: 'payment',
    items: (base.items || []).map((it) => ({
      ...it,
      price: neg(it.price),
      ...(it.lineDiscountAmt != null && Math.abs(Number(it.lineDiscountAmt) || 0) > 0.0001
        ? { lineDiscountAmt: Math.abs(Number(it.lineDiscountAmt) || 0) }
        : {}),
    })),
    subtotal: neg(base.subtotal),
    discountAmt: Math.max(0, Number(base.discountAmt ?? 0) || 0),
    total: neg(base.total),
    ...(base.deliveryFee != null && Math.abs(Number(base.deliveryFee) || 0) > 0.0001
      ? { deliveryFee: neg(base.deliveryFee) }
      : {}),
    ...(base.packagingFee != null && Math.abs(Number(base.packagingFee) || 0) > 0.0001
      ? { packagingFee: neg(base.packagingFee) }
      : {}),
    ...(base.vatFeeAmt != null && Math.abs(Number(base.vatFeeAmt) || 0) > 0.0001
      ? {
          vatFeeAmt: neg(base.vatFeeAmt),
          ...(base.receiptExclusiveSubtotalDisplay != null
            ? { receiptExclusiveSubtotalDisplay: neg(base.receiptExclusiveSubtotalDisplay) }
            : {}),
          ...(base.receiptVatDisplayAmt != null
            ? { receiptVatDisplayAmt: neg(base.receiptVatDisplayAmt) }
            : {}),
          ...(base.receiptTaxableGrossForDisplay != null
            ? { receiptTaxableGrossForDisplay: neg(base.receiptTaxableGrossForDisplay) }
            : {}),
        }
      : {}),
    ...(base.serviceFeeAmt != null && Math.abs(Number(base.serviceFeeAmt) || 0) > 0.0001
      ? { serviceFeeAmt: neg(base.serviceFeeAmt) }
      : {}),
    ...(base.cardFeeAmt != null && Math.abs(Number(base.cardFeeAmt) || 0) > 0.0001
      ? { cardFeeAmt: neg(base.cardFeeAmt) }
      : {}),
    ...(base.otherFeeAmt != null && Math.abs(Number(base.otherFeeAmt) || 0) > 0.0001
      ? { otherFeeAmt: neg(base.otherFeeAmt) }
      : {}),
    ...(base.paymentCash != null && Math.abs(Number(base.paymentCash) || 0) > 0.0001
      ? { paymentCash: neg(base.paymentCash) }
      : {}),
    ...(base.paymentCashTendered != null && Math.abs(Number(base.paymentCashTendered) || 0) > 0.0001
      ? { paymentCashTendered: neg(base.paymentCashTendered) }
      : {}),
    ...(base.paymentCard != null && Math.abs(Number(base.paymentCard) || 0) > 0.0001
      ? { paymentCard: neg(base.paymentCard) }
      : {}),
    ...(base.paymentQr != null && Math.abs(Number(base.paymentQr) || 0) > 0.0001
      ? { paymentQr: neg(base.paymentQr) }
      : {}),
    ...(base.paymentOther != null && Math.abs(Number(base.paymentOther) || 0) > 0.0001
      ? { paymentOther: neg(base.paymentOther) }
      : {}),
    ...(base.paymentDeliveryApp != null && Math.abs(Number(base.paymentDeliveryApp) || 0) > 0.0001
      ? { paymentDeliveryApp: neg(base.paymentDeliveryApp) }
      : {}),
  }
}
