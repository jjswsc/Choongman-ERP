import type { LinkposPaymentSummary, PosOrder, PosOrderItem } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import {
  cartLinesToPosOrderItems,
  resolveItemsJsonLineQty,
  type CartLineForPosOrder,
} from '@/lib/pos-order-item-map'

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
  const mergedByKey = new Map<string, { id: string; name: string; quantity: number; price: number; note?: string; servedAt?: string | null; servedBy?: string | null }>()
  const rows = row.items || []
  for (let i = 0; i < rows.length; i += 1) {
    const it = rows[i]
    const name = String(it.name ?? '')
    const price = Number(it.price ?? 0) || 0
    const qty = Math.max(1, resolveItemsJsonLineQty(it) || 1)
    const note = String(it.note ?? '').trim()
    const key = JSON.stringify([String(it.id ?? ''), name, price, note, String(it.servedAt ?? ''), String(it.cancelledAt ?? '')])
    const found = mergedByKey.get(key)
    if (found) {
      found.quantity += qty
      continue
    }
    mergedByKey.set(key, {
      id: String(it.id ?? '') || `line-${i}`,
      name,
      quantity: qty,
      price,
      ...(note ? { note } : {}),
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
    })
  }

  return {
    id: String(row.id),
    type: 'dine-in',
    items: Array.from(mergedByKey.values()),
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
