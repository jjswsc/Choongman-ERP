import { padSplitPersonFlags, collabAssignedQtyForLine } from '@/lib/pos-split-person'
import {
  manualPromoDiscountedQuantityForLine,
  selectedDiscountQuantityForLine,
  collectSelectedDiscountTargetKeys,
} from '@/lib/pos-manual-line-discount'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import {
  collabDiscountAmountForCart,
  buildCartPanelLineDiscountAllocations,
  collabSupportsQuantityEntry,
} from '@/lib/pos-collab-discount'
import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import type { PosMenu, PosAppliedCoupon } from '@/lib/api-client'
import type { CartPanelMenuLineDiscountMode } from '@/components/pos/cart-panel-payment-modal-amount-card'
import type { OrderItem } from '@/lib/pos-types'
import {
  computeMemberTierDiscountEligibleSubtotal,
  resolveMemberTierDiscountAmount,
} from '@/lib/pos-member-tier-discount'
import type { MemberTierDiscountPolicy } from '@/lib/member-tier-discount-policy'
import type { CartOrderType } from '@/components/pos/cart-panel-types'
import { normalizeMemberTierCodeForDiscount } from '@/lib/member-tier-discount'
import { tr as i18nTr } from '@/lib/i18n'
import { formatAppliedCouponsDiscountReason } from '@/lib/pos-coupon-domain'

export type CartPanelAppliedCollab = {
  id: string
  topic: string
  campaignNo?: string
  collabDetail: MarketingCollabDetail
}

export type CartPanelMemberMap = Record<
  string,
  { id: number; memberNo: string; name: string; phone: string; email: string; tierCode: string }
>

export interface ComputeCartPanelCollabDiscountAmtInput {
  appliedCollab: CartPanelAppliedCollab | null
  menuByIdForCollab: Map<string, PosMenu>
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  lineDiscountPctByItemId: Record<string, number>
  discountType: "percent" | "fixed"
  discountValue: number
  splitCollabJoinByPerson: boolean[]
  splitCount: number
  cartItems: OrderItem[]
  hasSelectedDiscountScope: boolean
  menuSplitAssigned: Record<string, number[]>
  showSplit: boolean
  splitMode: "amount" | "menu"
  collabQuantity: number
}

export function computeCartPanelCollabDiscountAmt({
  appliedCollab,
  menuByIdForCollab,
  lineDiscountModeByItemId,
  lineDiscountPctByItemId,
  discountType,
  discountValue,
  splitCollabJoinByPerson,
  splitCount,
  cartItems,
  hasSelectedDiscountScope,
  menuSplitAssigned,
  showSplit,
  splitMode,
  collabQuantity,
}: ComputeCartPanelCollabDiscountAmtInput) {
  if (!appliedCollab || menuByIdForCollab.size === 0) return 0
  const promoOpts = {
    lineDiscountModeByItemId,
    lineDiscountPctByItemId,
    fallbackPct: discountType === 'percent' ? discountValue : 0,
    excludeSelectedForFixed: discountType === 'fixed' && discountValue > 0.0001,
  }
  const joinFlags = padSplitPersonFlags(splitCollabJoinByPerson, Math.max(1, Number(splitCount) || 1), true)
  const collabScopeItems = cartItems.flatMap((item) => {
    if ((lineDiscountModeByItemId[item.id] ?? 'none') === 'cancel') return []
    const promoQty = manualPromoDiscountedQuantityForLine(item, promoOpts)
    const selectedQty = hasSelectedDiscountScope
      ? selectedDiscountQuantityForLine(item, lineDiscountModeByItemId)
      : resolveCartLineQuantityForSave(item as { quantity?: unknown; qty?: unknown })
    const assignedRow = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
    const collabQty = Math.max(
      0,
      collabAssignedQtyForLine({
        showSplit,
        splitMode,
        lineQty: Math.max(0, selectedQty - promoQty),
        assignedQtyByPerson: assignedRow,
        joinByPerson: joinFlags,
      })
    )
    if (collabQty <= 0) return []
    return [{ ...item, quantity: collabQty }]
  })
  if (!collabScopeItems.length) return 0
  return collabDiscountAmountForCart(
    collabScopeItems,
    menuByIdForCollab,
    appliedCollab.collabDetail,
    collabQuantity
  )
}

export interface ComputeCartPanelTierDiscountAmtInput {
  selectedMemberId: string
  selectedMemberTierDiscountRate: number
  cartItems: OrderItem[]
  menuByIdForCollab: Map<string, PosMenu>
  tierDiscountPolicy: MemberTierDiscountPolicy
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  lineDiscountPctByItemId: Record<string, number>
  discountType: "percent" | "fixed"
  discountValue: number
  hasSelectedDiscountScope: boolean
  manualDiscountAmt: number
  appliedCollab: CartPanelAppliedCollab | null
  appliedCoupons: PosAppliedCoupon[]
  orderType: CartOrderType
}

export function computeCartPanelTierDiscountAmt({
  selectedMemberId,
  selectedMemberTierDiscountRate,
  cartItems,
  menuByIdForCollab,
  tierDiscountPolicy,
  lineDiscountModeByItemId,
  lineDiscountPctByItemId,
  discountType,
  discountValue,
  hasSelectedDiscountScope,
  manualDiscountAmt,
  appliedCollab,
  appliedCoupons,
  orderType,
}: ComputeCartPanelTierDiscountAmtInput) {
  if (!selectedMemberId || selectedMemberTierDiscountRate <= 0) return 0
  const eligibleSubtotal = computeMemberTierDiscountEligibleSubtotal({
    lines: cartItems.map((i) => ({
      id: String(i.id ?? ''),
      name: String(i.name ?? ''),
      price: Number(i.price ?? 0),
      quantity: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
      ...(i.promoId ? { promoId: String(i.promoId) } : {}),
      ...(i.menuId ? { menuId: String(i.menuId) } : {}),
      ...(i.menuId1 != null ? { menuId1: i.menuId1, menuId2: i.menuId2 } : {}),
    })),
    menuById: menuByIdForCollab,
    policy: tierDiscountPolicy,
    lineDiscountModeByItemId,
    lineDiscountPctByItemId,
    fallbackPct: discountType === 'percent' ? discountValue : 0,
    wholeOrderManualDiscount: !hasSelectedDiscountScope && manualDiscountAmt > 0.0001,
    excludeSelectedForFixed: discountType === 'fixed' && discountValue > 0.0001,
  })
  return resolveMemberTierDiscountAmount({
    eligibleSubtotal,
    discountRate: selectedMemberTierDiscountRate,
    policy: tierDiscountPolicy,
    hasCollab: Boolean(appliedCollab),
    hasCoupons: appliedCoupons.length > 0,
    orderType,
  })
}

export interface ComputeCartPanelLineDiscountSnapshotInput {
  discount: number
  cartItems: OrderItem[]
  menuByIdForCollab: Map<string, PosMenu>
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  hasSelectedDiscountScope: boolean
  appliedCollab: CartPanelAppliedCollab | null
  collabDiscountAmt: number
  serviceDiscountAmt: number
  cancelledLineAmt: number
  tierDiscountAmt: number
  manualDiscountAmt: number
  couponLineAlloc: number[]
  manualLineAlloc: number[] | undefined
}

export function computeCartPanelLineDiscountSnapshot({
  discount,
  cartItems,
  menuByIdForCollab,
  lineDiscountModeByItemId,
  hasSelectedDiscountScope,
  appliedCollab,
  collabDiscountAmt,
  serviceDiscountAmt,
  cancelledLineAmt,
  tierDiscountAmt,
  manualDiscountAmt,
  couponLineAlloc,
  manualLineAlloc,
}: ComputeCartPanelLineDiscountSnapshotInput) {
  const totalDiscount = Math.max(0, Number(discount) || 0)
  if (!Array.isArray(cartItems) || cartItems.length === 0 || totalDiscount <= 0.0001) {
    return cartItems.map(() => 0)
  }
  return buildCartPanelLineDiscountAllocations({
    lines: cartItems.map((i) => ({
      id: String(i.id ?? ''),
      name: String(i.name ?? ''),
      price: Number(i.price ?? 0),
      qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
      ...(i.promoId ? { promoId: String(i.promoId) } : {}),
      ...(i.menuId ? { menuId: String(i.menuId) } : {}),
      ...(i.menuId1 != null ? { menuId1: i.menuId1, menuId2: i.menuId2 } : {}),
    })),
    menuById: menuByIdForCollab,
    lineModeById: lineDiscountModeByItemId,
    hasSelectedDiscountScope,
    collabDetail: appliedCollab?.collabDetail ?? null,
    collabDiscountAmt: appliedCollab ? collabDiscountAmt : 0,
    serviceDiscountAmt,
    cancelledLineAmt,
    tierDiscountAmt,
    manualDiscountAmt,
    couponLineAlloc,
    ...(manualLineAlloc && manualLineAlloc.length === cartItems.length ? { manualLineAlloc } : {}),
  })
}

export interface ComputeCartPanelOtherLineDiscountSnapshotInput {
  cartItems: OrderItem[]
  menuByIdForCollab: Map<string, PosMenu>
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  hasSelectedDiscountScope: boolean
  serviceDiscountAmt: number
  cancelledLineAmt: number
  tierDiscountAmt: number
  manualDiscountAmt: number
  couponLineAlloc: number[]
  manualLineAlloc: number[] | undefined
}

export function computeCartPanelOtherLineDiscountSnapshot({
  cartItems,
  menuByIdForCollab,
  lineDiscountModeByItemId,
  hasSelectedDiscountScope,
  serviceDiscountAmt,
  cancelledLineAmt,
  tierDiscountAmt,
  manualDiscountAmt,
  couponLineAlloc,
  manualLineAlloc,
}: ComputeCartPanelOtherLineDiscountSnapshotInput) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) return cartItems.map(() => 0)
  return buildCartPanelLineDiscountAllocations({
    lines: cartItems.map((i) => ({
      id: String(i.id ?? ''),
      name: String(i.name ?? ''),
      price: Number(i.price ?? 0),
      qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
      ...(i.promoId ? { promoId: String(i.promoId) } : {}),
      ...(i.menuId ? { menuId: String(i.menuId) } : {}),
      ...(i.menuId1 != null ? { menuId1: i.menuId1, menuId2: i.menuId2 } : {}),
    })),
    menuById: menuByIdForCollab,
    lineModeById: lineDiscountModeByItemId,
    hasSelectedDiscountScope,
    collabDetail: null,
    collabDiscountAmt: 0,
    serviceDiscountAmt,
    cancelledLineAmt,
    tierDiscountAmt,
    manualDiscountAmt,
    couponLineAlloc,
    ...(manualLineAlloc && manualLineAlloc.length === cartItems.length ? { manualLineAlloc } : {}),
  })
}

export interface BuildCartPanelPaymentDiscountReasonInput {
  discountReason: string
  appliedCollab: CartPanelAppliedCollab | null
  t: (k: string) => string
  collabQuantity: number
  tierDiscountAmt: number
  tr: (key: string, fallback: string) => string
  memberMap: CartPanelMemberMap
  selectedMemberId: string
  selectedMemberTierDiscountRate: number
  appliedCoupons: PosAppliedCoupon[]
  cartItems: OrderItem[]
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  selectedCancelledLineCount: number
}

export function buildCartPanelPaymentDiscountReason({
  discountReason,
  appliedCollab,
  t,
  collabQuantity,
  tierDiscountAmt,
  tr,
  memberMap,
  selectedMemberId,
  selectedMemberTierDiscountRate,
  appliedCoupons,
  cartItems,
  lineDiscountModeByItemId,
  selectedCancelledLineCount,
}: BuildCartPanelPaymentDiscountReasonInput) {
  const base = discountReason.trim()
  const collabPart = appliedCollab
    ? `${t('posCollabDiscount')}: ${appliedCollab.topic}${
        collabSupportsQuantityEntry(appliedCollab.collabDetail) && collabQuantity > 1
          ? ` × ${collabQuantity}`
          : ''
      }`
    : ''
  const tierPart =
    tierDiscountAmt > 0
      ? `${tr('posTierDiscount', '등급 할인')} (${normalizeMemberTierCodeForDiscount(memberMap[selectedMemberId]?.tierCode || 'BRONZE')} ${(selectedMemberTierDiscountRate * 100).toFixed(1)}%)`
      : ''
  const couponPart = appliedCoupons.length
    ? appliedCoupons
        .map((row) => {
          const code = String(row.code || '').trim().toUpperCase()
          if (!code) return ''
          const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))
          const codeLabel = qty > 1 ? `${code}×${qty}` : code
          return i18nTr(t, 'posCouponDiscountReason', { code: codeLabel }) || `쿠폰: ${codeLabel}`
        })
        .filter(Boolean)
        .join(' · ') || formatAppliedCouponsDiscountReason(appliedCoupons)
    : ''
  const lineDiscountCount = collectSelectedDiscountTargetKeys(cartItems, lineDiscountModeByItemId).length
  const linePart = [
    lineDiscountCount > 0 ? `${tr('posDiscount', '할인')} ${lineDiscountCount}${tr('posMenuLineUnit', '건')}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const cancelPart =
    selectedCancelledLineCount > 0
      ? `${tr('posLineCancelledShort', '취소처리')} ${selectedCancelledLineCount}${tr('posMenuLineUnit', '건')}`
      : ''
  const parts = [base, couponPart, collabPart, tierPart, linePart, cancelPart].filter(Boolean)
  return parts.join(' · ')
}
