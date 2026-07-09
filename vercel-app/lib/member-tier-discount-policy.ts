import type { MarketingCollabDetail } from '@/lib/marketing-collab-detail'
import { emptyMarketingCollabDetail } from '@/lib/marketing-collab-detail'

export const MEMBER_TIER_DISCOUNT_POLICY_KEY = 'member_tier_discount_policy'

/** POS 등급 할인 — 협업관리와 동일한 메뉴 범위 선택 + 중복 할인 규칙 */
export type MemberTierDiscountPolicy = {
  scopeMainCategories: string[]
  scopeCategoryKeys: string[]
  scopeMenuIds: string[]
  /** 세트·프로모션 메뉴 제외 (기본 true) */
  excludePromoAndSets: boolean
  /** 협업(Collab) 할인과 동시 적용 */
  stackWithCollab: boolean
  /** 쿠폰 할인과 동시 적용 */
  stackWithCoupons: boolean
}

export const DEFAULT_MEMBER_TIER_DISCOUNT_POLICY: MemberTierDiscountPolicy = {
  scopeMainCategories: [],
  scopeCategoryKeys: [],
  scopeMenuIds: [],
  excludePromoAndSets: true,
  stackWithCollab: false,
  stackWithCoupons: false,
}

function toStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(
    new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))
  )
}

export function normalizeMemberTierDiscountPolicy(raw: unknown): MemberTierDiscountPolicy {
  const base = DEFAULT_MEMBER_TIER_DISCOUNT_POLICY
  if (!raw || typeof raw !== 'object') return { ...base }
  const obj = raw as Record<string, unknown>
  return {
    scopeMainCategories: toStringList(obj.scopeMainCategories),
    scopeCategoryKeys: toStringList(obj.scopeCategoryKeys),
    scopeMenuIds: toStringList(obj.scopeMenuIds),
    excludePromoAndSets: obj.excludePromoAndSets !== false,
    stackWithCollab: obj.stackWithCollab === true,
    stackWithCoupons: obj.stackWithCoupons === true,
  }
}

export function isMemberTierDiscountScopeConfigured(policy: MemberTierDiscountPolicy): boolean {
  return (
    policy.scopeMainCategories.length > 0 ||
    policy.scopeCategoryKeys.length > 0 ||
    policy.scopeMenuIds.length > 0
  )
}

/** menuMatchesCollabScope 재사용용 — 레거시 체크박스 범위는 끔 */
export function memberTierDiscountPolicyToCollabScope(
  policy: MemberTierDiscountPolicy
): MarketingCollabDetail {
  return {
    ...emptyMarketingCollabDetail(),
    scopeMainCategories: [...policy.scopeMainCategories],
    scopeCategoryKeys: [...policy.scopeCategoryKeys],
    scopeMenuIds: [...policy.scopeMenuIds],
  }
}

export function canStackMemberTierDiscount(params: {
  policy: MemberTierDiscountPolicy
  hasCollab: boolean
  hasCoupons: boolean
}): boolean {
  if (params.hasCollab && !params.policy.stackWithCollab) return false
  if (params.hasCoupons && !params.policy.stackWithCoupons) return false
  return true
}
