import type { LinkposPaymentSummary, PosOrder, PosOrderItem } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import { cartLinesToPosOrderItems, type CartLineForPosOrder } from '@/lib/pos-order-item-map'

export type DineInCloseStatus = 'paid' | 'completed'

export function resolveDineInCloseStatus(isPrepaid: boolean): DineInCloseStatus {
  return isPrepaid ? 'paid' : 'completed'
}

export function buildDineInOrderItems(lines: CartLineForPosOrder[]): PosOrderItem[] {
  return cartLinesToPosOrderItems(lines)
}

function mapOrderStatus(status: string): Order['status'] {
  const s = String(status || '').toLowerCase()
  if (s === 'ready') return 'ready'
  if (s === 'paid') return 'paid'
  if (s === 'completed') return 'completed'
  if (s === 'pending') return 'pending'
  return 'preparing'
}

export function mapPosOrderToDineInOrder(row: PosOrder): Order {
  return {
    id: String(row.id),
    type: 'dine-in',
    items: (row.items || []).map((it) => ({
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      quantity: Math.max(1, Number(it.qty ?? 1) || 1),
      price: Number(it.price ?? 0) || 0,
      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
    })),
    total: Number(row.total ?? 0) || 0,
    status: mapOrderStatus(String(row.status ?? '')),
    createdAt: new Date(row.createdAt || Date.now()),
    memo: String(row.memo ?? '').trim() || undefined,
    orderNo: String(row.orderNo ?? '').trim() || undefined,
    guestCount: Math.max(0, Math.min(99, Math.trunc(Number(row.guestCount ?? 0) || 0))),
  }
}

export type DineInFinalizePayload = {
  orderId?: number | null
  storeCode: string
  createdBy: string
  tableName: string
  memo?: string
  discountAmt?: number
  discountReason?: string
  deliveryFee?: number
  packagingFee?: number
  memberId?: number
  memberNo?: string
  couponCode?: string
  couponDiscountAmt?: number
  pointUsed?: number
  guestCount?: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  linkposPayment?: LinkposPaymentSummary | null
  pricingAdjustments?: {
    vatRate?: number
    vatMode?: 'included' | 'separate'
    serviceRate?: number
    serviceMode?: 'included' | 'separate'
    cardRate?: number
    cardMode?: 'included' | 'separate'
    cardBaseMode?: 'card_only' | 'card_plus_vat' | 'card_plus_vat_service'
    otherRate?: number
    otherMode?: 'included' | 'separate'
  }
  items: PosOrderItem[]
}
