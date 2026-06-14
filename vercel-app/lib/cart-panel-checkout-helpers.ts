/**
 * CartPanel — 체크아웃·할인 시드 순수 헬퍼 (cart-panel.tsx에서 분리 — move only)
 * 로직 변경 없음. import 경로만 분리.
 */
import type { PosAppliedCoupon } from '@/lib/api-client'
import type { Table } from '@/lib/pos-types'
import { formatPosDineInTableNameForStorage } from '@/lib/pos-table-floor-match'
import {
  manualDiscountSeedFromCheckoutSnapshot,
  type PosExistingOrderCheckoutDiscount,
} from '@/lib/pos-existing-order-checkout-discount'
import type { PosPricingAdjustments } from '@/lib/pos-pricing'

export function normalizeExistingPosOrderId(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  const id = Math.trunc(n)
  return id > 0 ? id : null
}

export function resetCheckoutDiscountUiState(setters: {
  setDiscountType: (v: 'percent' | 'fixed') => void
  setDiscountValue: (v: number) => void
  setDiscountReason: (v: string) => void
  setAppliedCollabId: (v: string | null) => void
  setCouponCode: (v: string) => void
  setAppliedCoupons: (v: PosAppliedCoupon[]) => void
  setCouponQuantity: (v: number) => void
  setCouponMessage: (v: string) => void
  setPointUsed: (v: string) => void
}) {
  setters.setDiscountType('percent')
  setters.setDiscountValue(0)
  setters.setDiscountReason('')
  setters.setAppliedCollabId(null)
  setters.setCouponCode('')
  setters.setAppliedCoupons([])
  setters.setCouponQuantity(1)
  setters.setCouponMessage('')
  setters.setPointUsed('0')
}

export function seedCheckoutDiscountFromExistingOrder(
  orderDiscount: PosExistingOrderCheckoutDiscount | undefined,
  items: { price: number; quantity: number }[],
  pricingAdjustments: PosPricingAdjustments | undefined,
  setters: {
    setDiscountType: (v: 'percent' | 'fixed') => void
    setDiscountValue: (v: number) => void
    setDiscountReason: (v: string) => void
  }
): number {
  if (!orderDiscount) return 0
  const seed = manualDiscountSeedFromCheckoutSnapshot({
    snapshot: orderDiscount,
    items: items.map((i) => ({ price: i.price, qty: i.quantity })),
    adjustments: pricingAdjustments,
  })
  if (seed.discountValue > 0.0001) {
    setters.setDiscountType('fixed')
    setters.setDiscountValue(seed.discountValue)
    setters.setDiscountReason(seed.discountReason)
    return seed.discountValue
  }
  setters.setDiscountType('percent')
  setters.setDiscountValue(0)
  setters.setDiscountReason(seed.discountReason)
  return 0
}

export function resolveDineInTableNameForStorage(
  table: Pick<Table, 'name' | 'floor'> | null | undefined,
  fallbackName: string,
  multiFloorLayout: boolean
): string {
  const raw = (String(fallbackName ?? '').trim() || String(table?.name ?? '').trim()).trim()
  if (!raw) return ''
  return formatPosDineInTableNameForStorage(raw, table?.floor, multiFloorLayout)
}
