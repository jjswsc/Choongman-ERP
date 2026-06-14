import type { CartPanelPaymentPayload } from '@/components/pos/cart-panel-types'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'

export type CartPanelPaymentMethodTab = 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'

export function paymentTabTourTarget(tab: CartPanelPaymentMethodTab): string {
  switch (tab) {
    case 'cash':
      return 'pos-tour-payment-tab-cash'
    case 'card':
      return 'pos-tour-payment-tab-card'
    case 'qr':
      return 'pos-tour-payment-tab-qr'
    case 'delivery_app':
      return 'pos-tour-payment-tab-delivery-app'
    case 'other':
      return 'pos-tour-payment-tab-other'
    default:
      return 'pos-tour-payment-tab-cash'
  }
}

export function sumCartPanelPaymentSnapshot(snap: CartPanelPaymentPayload): number {
  return (
    (snap.paymentCash || 0) +
    (snap.paymentCard || 0) +
    (snap.paymentQr || 0) +
    (snap.paymentOther || 0) +
    (snap.paymentDeliveryApp ?? 0)
  )
}

export function mergeCartPanelPaymentSnapshots(snaps: CartPanelPaymentPayload[]): CartPanelPaymentPayload {
  const merged: CartPanelPaymentPayload = {
    paymentCash: 0,
    paymentCard: 0,
    paymentQr: 0,
    paymentQrType: 'THAI_QR',
    paymentOther: 0,
    paymentDeliveryApp: 0,
    deliveryPaymentChannel: null,
    paymentCashTendered: 0,
  }
  for (const snap of snaps) {
    merged.paymentCash += snap.paymentCash || 0
    merged.paymentCard += snap.paymentCard || 0
    merged.paymentQr += snap.paymentQr || 0
    if (snap.paymentQrType) merged.paymentQrType = snap.paymentQrType
    merged.paymentOther += snap.paymentOther || 0
    merged.paymentDeliveryApp = (merged.paymentDeliveryApp || 0) + (snap.paymentDeliveryApp ?? 0)
    if (snap.deliveryPaymentChannel) merged.deliveryPaymentChannel = snap.deliveryPaymentChannel
    merged.paymentCashTendered = (merged.paymentCashTendered || 0) + (snap.paymentCashTendered || 0)
  }
  return merged
}

export function buildPaymentPayloadForOrderSubmit(params: {
  base: CartPanelPaymentPayload
  paymentOther: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown
  deliveryPayPart: Pick<CartPanelPaymentPayload, 'paymentDeliveryApp' | 'deliveryPaymentChannel'>
}): CartPanelPaymentPayload {
  return {
    ...params.base,
    paymentOther: params.paymentOther,
    ...(params.paymentOtherBreakdown ? { paymentOtherBreakdown: params.paymentOtherBreakdown } : {}),
    ...params.deliveryPayPart,
  }
}
