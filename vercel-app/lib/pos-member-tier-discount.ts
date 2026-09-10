import type { PosMenu } from '@/lib/api-client'
import {
  canStackMemberTierDiscount,
  isMemberTierDiscountScopeConfigured,
  memberTierDiscountPolicyToCollabScope,
  type MemberTierDiscountPolicy,
} from '@/lib/member-tier-discount-policy'
import { computeMemberTierDiscountAmount } from '@/lib/member-tier-discount'
import {
  type CollabCartLineLike,
  isPromoCartLine,
  isPromotionMenu,
  menuIdsForCollabLineWithCatalog,
  menuMatchesCollabScope,
} from '@/lib/pos-collab-discount'
import { memberTierEligibleQuantityForLine } from '@/lib/pos-manual-line-discount'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'

/** 배달 주문은 멤버 연결·포인트 적립만 허용, 등급 할인 불가 */
export function isMemberTierDiscountAllowedForOrderType(
  orderType: string | null | undefined
): boolean {
  return normalizePosOrderTypeKey(orderType) !== 'delivery'
}

type CollabMenuPick = Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>

function lineFailsPromoOrSetExclusion(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  policy: MemberTierDiscountPolicy
): boolean {
  if (!policy.excludePromoAndSets) return false
  if (isPromoCartLine(line)) return true
  const ids = menuIdsForCollabLineWithCatalog(line, menuById)
  for (const mid of ids) {
    const menu = menuById.get(mid)
    if (menu && isPromotionMenu(menu)) return true
  }
  return false
}

function lineMatchesTierScope(
  line: CollabCartLineLike,
  menuById: Map<string, CollabMenuPick>,
  policy: MemberTierDiscountPolicy
): boolean {
  if (!isMemberTierDiscountScopeConfigured(policy)) {
    return true
  }
  const scopeDetail = memberTierDiscountPolicyToCollabScope(policy)
  const ids = menuIdsForCollabLineWithCatalog(line, menuById)
  if (ids.length === 0) return false
  return ids.some((mid) => {
    const menu = menuById.get(mid)
    return menu && menuMatchesCollabScope(menu, scopeDetail)
  })
}

/** 등급 할인 대상 금액 — 프로모/세트 제외 + 범위 내 메뉴만. 직접(프로모) 할인을 건 접시는 빼고 나머지는 유지 */
export function computeMemberTierDiscountEligibleSubtotal(params: {
  lines: CollabCartLineLike[]
  menuById: Map<string, CollabMenuPick>
  policy: MemberTierDiscountPolicy
  lineDiscountModeByItemId?: Record<string, string>
  lineDiscountPctByItemId?: Record<string, number>
  fallbackPct?: number
  wholeOrderManualDiscount?: boolean
  excludeSelectedForFixed?: boolean
}): number {
  const {
    lines,
    menuById,
    policy,
    lineDiscountModeByItemId,
    lineDiscountPctByItemId,
    fallbackPct,
    wholeOrderManualDiscount = false,
    excludeSelectedForFixed = false,
  } = params
  let total = 0
  for (const line of lines || []) {
    if (lineFailsPromoOrSetExclusion(line, menuById, policy)) continue
    if (!lineMatchesTierScope(line, menuById, policy)) continue
    const qty = memberTierEligibleQuantityForLine(line, {
      lineDiscountModeByItemId,
      lineDiscountPctByItemId,
      fallbackPct,
      wholeOrderManualDiscount,
      excludeSelectedForFixed,
    })
    if (qty <= 0) continue
    total += Math.max(0, Number(line.price || 0)) * qty
  }
  return Math.max(0, total)
}

export function resolveMemberTierDiscountAmount(params: {
  eligibleSubtotal: number
  discountRate: number
  policy: MemberTierDiscountPolicy
  hasCollab: boolean
  hasCoupons: boolean
  /** dine-in | takeout | delivery — delivery면 항상 0 */
  orderType?: string | null
}): number {
  if (!isMemberTierDiscountAllowedForOrderType(params.orderType)) return 0
  const rate = Math.max(0, Number(params.discountRate || 0))
  if (rate <= 0) return 0
  if (
    !canStackMemberTierDiscount({
      policy: params.policy,
      hasCollab: params.hasCollab,
      hasCoupons: params.hasCoupons,
    })
  ) {
    return 0
  }
  if (!isMemberTierDiscountScopeConfigured(params.policy)) return 0
  return computeMemberTierDiscountAmount(params.eligibleSubtotal, rate)
}
