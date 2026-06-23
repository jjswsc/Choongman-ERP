/**
 * POS 쿠폰 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

export interface PosAppliedCoupon {
  code: string
  name?: string
  discountAmt: number
  quantity?: number
  couponId?: number
  priority?: number
  memberCouponIssueId?: number
  serialId?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  discountType?: PosCoupon['discountType']
}

export interface PosCoupon {
  id?: number
  code: string
  name?: string
  discountType: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  usedCount?: number
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
  portalImageUrl?: string
  portalVisible?: boolean
  portalClaimMode?: 'none' | 'free' | 'points'
  portalPointCost?: number
  portalMaxClaimsPerMember?: number
  portalSortOrder?: number
}

export async function getPosCoupons() {
  const res = await apiFetchWithOffline('/api/getPosCoupons')
  return jsonAsArray<PosCoupon>(await res.json())
}

export async function savePosCoupon(params: {
  id?: number
  code: string
  name?: string
  discountType?: 'percent' | 'amount' | 'fixed' | 'bogo' | 'set_fixed' | 'item_fixed'
  discountValue: number
  startDate?: string | null
  endDate?: string | null
  validFrom?: string | null
  validTo?: string | null
  maxUses?: number | null
  isActive?: boolean
  marketingCampaignId?: string | null
  minOrderAmt?: number
  maxPerOrder?: number
  redemptionMode?: 'reusable_code' | 'single_use_serial' | 'member_issue'
  allowQuantityEntry?: boolean
  stackMode?: 'fixed_only' | 'percent_only' | 'any'
  maxDiscountAmt?: number | null
  setQty?: number
  itemScope?: { menuIds?: string[]; categoryCodes?: string[] }
  priority?: number
  allowWithManualDiscount?: boolean
  portalImageUrl?: string
  portalVisible?: boolean
  portalClaimMode?: 'none' | 'free' | 'points'
  portalPointCost?: number
  portalMaxClaimsPerMember?: number
  portalSortOrder?: number
}) {
  const res = await apiFetchWithOffline('/api/savePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function validatePosCoupon(params: { code: string; subtotal: number }) {
  const q = new URLSearchParams()
  q.set('code', params.code.trim().toUpperCase())
  q.set('subtotal', String(Math.max(0, params.subtotal)))
  const res = await apiFetchWithOffline('/api/validatePosCoupon?' + q.toString())
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
  }>
}

export async function validatePosCoupons(params: {
  subtotal: number
  manualDiscountAmt?: number
  collabDiscountAmt?: number
  tierDiscountAmt?: number
  cartLines?: Array<{
    menuId?: string
    menuCode?: string
    categoryCode?: string
    quantity: number
    lineSubtotal: number
  }>
  applied?: PosAppliedCoupon[]
  appliedCoupons?: PosAppliedCoupon[]
  candidate?: { code: string; quantity?: number; memberIssueId?: number }
  memberId?: number
}) {
  const res = await apiFetchWithOffline('/api/validatePosCoupons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    valid: boolean
    message?: string
    couponName?: string
    discountAmt?: number
    discountReason?: string
    quantity?: number
    couponId?: number
    appliedCoupons?: PosAppliedCoupon[]
    couponDiscountTotal?: number
    couponCode?: string
    couponDiscountAmt?: number
    resolvedMemberId?: number
  }>
}

export async function deletePosCoupon(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosCoupon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
