import type { CartPanelPaymentPayload } from '@/components/pos/cart-panel-types'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'

export type CartPanelPaymentMethodTab = 'cash' | 'card' | 'qr' | 'delivery_app' | 'other' | 'crypto'

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
    case 'crypto':
      return 'pos-tour-payment-tab-crypto'
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
    (snap.paymentDeliveryApp ?? 0) +
    (snap.paymentCrypto ?? 0)
  )
}

const roundPayment2 = (n: number) => Math.round(Math.max(0, n) * 100) / 100

/** 더치페이 인원별 확정 금액만큼 결제 스냅샷을 잘라 저장(초과 입력 이중 합산 방지) */
export function capCartPanelPaymentSnapshot(
  snap: CartPanelPaymentPayload,
  cap: number
): CartPanelPaymentPayload {
  const maxCap = roundPayment2(cap)
  const sum = sumCartPanelPaymentSnapshot(snap)
  if (maxCap <= 0.005 || sum <= maxCap + 0.005) return { ...snap }
  const channels: Array<{
    key: keyof Pick<
      CartPanelPaymentPayload,
      'paymentCash' | 'paymentCard' | 'paymentQr' | 'paymentOther' | 'paymentDeliveryApp' | 'paymentCrypto'
    >
  }> = [
    { key: 'paymentCash' },
    { key: 'paymentCard' },
    { key: 'paymentQr' },
    { key: 'paymentOther' },
    { key: 'paymentDeliveryApp' },
    { key: 'paymentCrypto' },
  ]
  let remaining = maxCap
  const out: CartPanelPaymentPayload = {
    ...snap,
    paymentCash: 0,
    paymentCard: 0,
    paymentQr: 0,
    paymentOther: 0,
    paymentDeliveryApp: 0,
    paymentCrypto: 0,
    paymentCashTendered: 0,
  }
  for (const { key } of channels) {
    const raw = Math.max(0, Number(snap[key] ?? 0))
    const take = roundPayment2(Math.min(raw, remaining))
    out[key] = take
    remaining = roundPayment2(remaining - take)
  }
  const cashPay = out.paymentCash || 0
  const tendered = Math.max(0, Number(snap.paymentCashTendered ?? 0))
  if (cashPay > 0.005 && tendered > 0.005) {
    out.paymentCashTendered = roundPayment2(Math.min(tendered, cashPay))
  }
  return out
}

/** 확정 스냅샷 + 현재 입력란 → 주문 제출용 합산(이미 합계가 맞으면 입력란 중복 합산 안 함) */
export function mergeSplitOrderPaymentForSubmit(params: {
  captures: CartPanelPaymentPayload[]
  current: CartPanelPaymentPayload
  orderTotal: number
}): CartPanelPaymentPayload {
  const snaps = params.captures.filter((s) => sumCartPanelPaymentSnapshot(s) > 0.005)
  const capturedSum = roundPayment2(
    snaps.reduce((s, snap) => s + sumCartPanelPaymentSnapshot(snap), 0)
  )
  const curSum = sumCartPanelPaymentSnapshot(params.current)
  const reconcile = (entered: number, due: number) =>
    Math.abs(roundPayment2(entered) - roundPayment2(due)) <= 0.02 ||
    Math.round(entered) === Math.round(due)
  if (curSum > 0.005 && (snaps.length === 0 || !reconcile(capturedSum, params.orderTotal))) {
    snaps.push(params.current)
  }
  return snaps.length > 0 ? mergeCartPanelPaymentSnapshots(snaps) : params.current
}

export function mergeCartPanelPaymentSnapshots(snaps: CartPanelPaymentPayload[]): CartPanelPaymentPayload {
  const merged: CartPanelPaymentPayload = {
    paymentCash: 0,
    paymentCard: 0,
    paymentQr: 0,
    paymentQrType: 'THAI_QR',
    paymentOther: 0,
    paymentDeliveryApp: 0,
    paymentCrypto: 0,
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
    merged.paymentCrypto = (merged.paymentCrypto || 0) + (snap.paymentCrypto ?? 0)
    if (snap.paymentCryptoMeta) merged.paymentCryptoMeta = snap.paymentCryptoMeta
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
