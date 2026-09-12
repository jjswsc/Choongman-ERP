import { applyLoyaltyOnOrder } from '@/lib/members-server-points'
import { roundMemberPointsEarn } from '@/lib/member-points-math'
import { allocateAmountByWeights } from '@/lib/pos-split-person'
import {
  attachSplitLoyaltyToSnapshots,
  collectSplitLoyaltyGroups,
  type PosSplitReceiptSnapshot,
} from '@/lib/pos-split-receipt-memo'

export type SplitLoyaltyReceiptRow = {
  key: string
  memberId: number
  memberNo?: string
  memberPhone?: string
  memberTierCode?: string
  pointEarned: number
  pointBalanceExcludingEarn?: number
}

export type ApplySplitLoyaltyResult = {
  pointEarned: number
  primaryMemberId: number
  perSplit: SplitLoyaltyReceiptRow[]
}

export { attachSplitLoyaltyToSnapshots, collectSplitLoyaltyGroups }

/** 결제 완료 주문 — 분리 빌 멤버별로 그 빌 금액만큼 적립 */
export async function applyLoyaltyForPaidOrderSplits(params: {
  orderId: number
  storeCode: string
  orderNo: string
  orderType?: string | null
  createdBy?: string | null
  couponCode?: string
  pointUsed: number
  fallbackMemberId: number
  orderTotal: number
  splits: PosSplitReceiptSnapshot[] | null | undefined
}): Promise<ApplySplitLoyaltyResult> {
  const splits = Array.isArray(params.splits) ? params.splits : []
  const groups = collectSplitLoyaltyGroups(splits, params.fallbackMemberId)
  const empty: ApplySplitLoyaltyResult = {
    pointEarned: 0,
    primaryMemberId: Math.max(0, Math.trunc(Number(params.fallbackMemberId) || 0)),
    perSplit: [],
  }
  if (groups.length === 0) return empty

  const primaryMemberId = groups[0]?.memberId || empty.primaryMemberId
  const perSplit: SplitLoyaltyReceiptRow[] = []
  let pointEarnedTotal = 0
  let pointUsedRemaining = roundMemberPointsEarn(params.pointUsed)

  for (const group of groups) {
    const loyalty = await applyLoyaltyOnOrder({
      memberId: group.memberId,
      orderId: params.orderId,
      storeCode: params.storeCode,
      totalAmount: group.totalAmount > 0.0001 ? group.totalAmount : params.orderTotal,
      pointUsed: group.memberId === primaryMemberId ? pointUsedRemaining : 0,
      orderNo: params.orderNo,
      couponCode: params.couponCode,
      orderType: params.orderType,
      createdBy: params.createdBy,
    })
    if (group.memberId === primaryMemberId) pointUsedRemaining = 0
    const groupEarn = roundMemberPointsEarn(loyalty.pointEarned)
    pointEarnedTotal = roundMemberPointsEarn(pointEarnedTotal + groupEarn)
    const groupSplits = splits.filter((split) => group.keys.includes(String(split.key || '')))
    const weights = groupSplits.map((split) => Math.max(0, Number(split.total) || 0))
    const alloc = allocateAmountByWeights(weights, groupEarn)
    groupSplits.forEach((split, i) => {
      perSplit.push({
        key: String(split.key || ''),
        memberId: group.memberId,
        ...(loyalty.memberNo ? { memberNo: loyalty.memberNo } : {}),
        ...(loyalty.phone ? { memberPhone: loyalty.phone } : {}),
        ...(loyalty.tierCode ? { memberTierCode: loyalty.tierCode } : {}),
        pointEarned: alloc[i] ?? 0,
        ...(loyalty.pointBalanceExcludingEarn != null
          ? { pointBalanceExcludingEarn: loyalty.pointBalanceExcludingEarn }
          : {}),
      })
    })
  }

  return { pointEarned: pointEarnedTotal, primaryMemberId, perSplit }
}
