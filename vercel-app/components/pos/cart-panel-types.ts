import type { PosAppliedCoupon } from '@/lib/api-client'
import type { PosExistingOrderCheckoutDiscount } from '@/lib/pos-existing-order-checkout-discount'
import type { PosExistingOrderCheckoutMember } from '@/lib/pos-existing-order-checkout-member'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'

export type CartOrderType = 'dine-in' | 'delivery' | 'takeout'
export type CartDeliveryApp = 'grab' | 'lineman' | 'shopee' | (string & {})

/** printReceiptNow 첫 인자와 동일 스냅샷 (결제 모달 직전 홀 주문서 자동 인쇄 등) */
export type CartPanelBeforePaymentReceiptPayload = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  items: { id: string; name: string; price: number; qty: number; note?: string; isAddon?: boolean }[]
  subtotal: number
  discountAmt: number
  total: number
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay?: number
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  vatRate?: number
  serviceRate?: number
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  guestCount?: number
}

export type CartPanelPaymentPayload = {
  paymentCash: number
  paymentCard: number
  paymentQr: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD' | 'EDC'
  /** true = KBank API로 QR 생성 후 EDC 단말 표시 우선 (고객 모니터 없는 매장) */
  paymentQrShowOnEdc?: boolean
  paymentOther: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  paymentCrypto?: number
  paymentCryptoMeta?: Record<string, unknown> | null
  paymentCashTendered?: number
}

export type CartPanelOrderLinePayload = {
  id: string
  name: string
  price: number
  quantity: number
  note?: string
  menuId?: string
  optionId?: string
}

export type CartPanelSplitReceiptPayload = {
  key: string
  label: string
  items: CartPanelOrderLinePayload[]
  subtotal: number
  discountAmt: number
  total: number
  payment?: CartPanelPaymentPayload
}

export type CartPanelAddItemPayload = {
  id: string
  name: string
  price: number
  note?: string
  menuId?: string
  /** 반반 맛1·맛2 (부모 menuId와 별도) */
  menuId1?: string
  menuId2?: string
  optionId?: string | null
  optionCode?: string | null
  promoId?: string
  promoCode?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    quantity: number
    optionName?: string | null
  }[]
}

export type CartPanelOrderCompleteResult = boolean | Promise<boolean>

export interface CartPanelHandle {
  addItem: (item: CartPanelAddItemPayload) => void
  clearCart: () => void
  openDineInPaymentFromOrder: (payload: {
    tableName: string
    orderNo?: string
    existingOrderId?: number | null
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string; menuId1?: string }[]
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
    orderMemo?: string
    depositAmt?: number
  }) => void
  openTakeoutPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string; menuId1?: string }[]
    existingOrderId?: number | null
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
    orderMemo?: string
    depositAmt?: number
  }) => void
  openDeliveryPaymentFromOrder: (payload: {
    orderLabel: string
    items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string; menuId1?: string }[]
    existingOrderId?: number | null
    orderDiscount?: PosExistingOrderCheckoutDiscount
    orderMember?: PosExistingOrderCheckoutMember
    orderMemo?: string
    depositAmt?: number
  }) => void
}
