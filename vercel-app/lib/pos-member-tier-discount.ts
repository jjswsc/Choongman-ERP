import type { PosMenu } from '@/lib/api-client'
import {
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

type CollabMenuPick = Pick<PosMenu, 'id' | 'category' | 'categoryMain' | 'name' | 'code'>

function lineQty(line: CollabCartLineLike): number {
  const q = Number(line.quantity ?? line.qty ?? 1)
  return Number.isFinite(q) && q > 0 ? q : 1
}

function lineIsExcludedFromTier(
  line: CollabCartLineLike,
  lineDiscountModeByItemId: Record<string, string> | undefined,
  hasSelectedDiscountScope: boolean
): boolean {
  const mode = lineDiscountModeByItemId?.[line.id] ?? 'none'
  if (mode === 'cancel') return true
  if (!hasSelectedDiscountScope && mode === 'service') return true
  if (hasSelectedDiscountScope && mode !== 'discount') return true
  return false
}

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

/** 등급 할인 대상 금액 — 프로모/세트 제외 + 범위 내 메뉴만 */
export function computeMemberTierDiscountEligibleSubtotal(params: {
  lines: CollabCartLineLike[]
  menuById: Map<string, CollabMenuPick>
  policy: MemberTierDiscountPolicy
  lineDiscountModeByItemId?: Record<string, string>
  hasSelectedDiscountScope?: boolean
}): number {
  const {
    lines,
    menuById,
    policy,
    lineDiscountModeByItemId,
    hasSelectedDiscountScope = false,
  } = params
  let total = 0
  for (const line of lines || []) {
    if (lineIsExcludedFromTier(line, lineDiscountModeByItemId, hasSelectedDiscountScope)) continue
    if (lineFailsPromoOrSetExclusion(line, menuById, policy)) continue
    if (!lineMatchesTierScope(line, menuById, policy)) continue
    total += Math.max(0, Number(line.price || 0)) * lineQty(line)
  }
  return Math.max(0, total)
}

export function resolveMemberTierDiscountAmount(params: {
  eligibleSubtotal: number
  discountRate: number
  policy: MemberTierDiscountPolicy
  hasCollab: boolean
  hasCoupons: boolean
}): number {
  const rate = Math.max(0, Number(params.discountRate || 0))
  if (rate <= 0) return 0
  if (params.hasCollab && !params.policy.stackWithCollab) return 0
  if (params.hasCoupons && !params.policy.stackWithCoupons) return 0
  if (!isMemberTierDiscountScopeConfigured(params.policy)) return 0
  return computeMemberTierDiscountAmount(params.eligibleSubtotal, rate)
}
