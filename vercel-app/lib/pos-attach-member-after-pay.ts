import { isPosOrderPaymentCompleteForTotal, posOrderPaymentSumFromAmounts } from '@/lib/pos-order-paid-at'
import { roundMemberPointsEarn } from '@/lib/member-points-math'

export const ATTACH_MEMBER_AFTER_PAY_STATUSES = new Set([
  'paid',
  'completed',
  'ready',
  'cooking',
  'preparing',
])

export type AttachMemberAfterPayEligibilityCode =
  | 'ok_attach'
  | 'ok_retry'
  | 'merged'
  | 'status'
  | 'not_paid'
  | 'already_earned'
  | 'outside_window'
  | 'zero_total'
  | 'point_used_without_member'

export type AttachMemberAfterPayEligibility = {
  code: AttachMemberAfterPayEligibilityCode
  canAttach: boolean
  canRetry: boolean
}

export function hasPosOrderMemberLinked(params: {
  memberId?: number | null
  memberNo?: string | null
}): boolean {
  return Number(params.memberId || 0) > 0 || Boolean(String(params.memberNo || '').trim())
}

export function resolveAttachMemberAfterPayEligibility(params: {
  status?: string | null
  total?: number | null
  paymentCash?: number | null
  paymentCard?: number | null
  paymentQr?: number | null
  paymentOther?: number | null
  paymentDeliveryApp?: number | null
  memberId?: number | null
  memberNo?: string | null
  pointEarned?: number | null
  pointUsed?: number | null
  mergedAbsorb?: boolean
  orderBusinessDay?: string | null
  todayBusinessDay?: string | null
  yesterdayBusinessDay?: string | null
}): AttachMemberAfterPayEligibility {
  if (params.mergedAbsorb) {
    return { code: 'merged', canAttach: false, canRetry: false }
  }
  const status = String(params.status || '')
    .trim()
    .toLowerCase()
  if (!ATTACH_MEMBER_AFTER_PAY_STATUSES.has(status)) {
    return { code: 'status', canAttach: false, canRetry: false }
  }
  const total = Math.max(0, Number(params.total || 0))
  if (!(total > 0.005)) {
    return { code: 'zero_total', canAttach: false, canRetry: false }
  }
  const paymentSum = posOrderPaymentSumFromAmounts({
    paymentCash: Number(params.paymentCash || 0),
    paymentCard: Number(params.paymentCard || 0),
    paymentQr: Number(params.paymentQr || 0),
    paymentOther: Number(params.paymentOther || 0),
    paymentDeliveryApp: Number(params.paymentDeliveryApp || 0),
  })
  if (!isPosOrderPaymentCompleteForTotal(total, paymentSum)) {
    return { code: 'not_paid', canAttach: false, canRetry: false }
  }
  const orderBd = String(params.orderBusinessDay || '').trim()
  const todayBd = String(params.todayBusinessDay || '').trim()
  const yesterdayBd = String(params.yesterdayBusinessDay || '').trim()
  if (!orderBd || !todayBd || (orderBd !== todayBd && orderBd !== yesterdayBd)) {
    return { code: 'outside_window', canAttach: false, canRetry: false }
  }
  const linked = hasPosOrderMemberLinked({
    memberId: params.memberId,
    memberNo: params.memberNo,
  })
  const pointEarned = roundMemberPointsEarn(params.pointEarned)
  const pointUsed = roundMemberPointsEarn(params.pointUsed)
  if (pointEarned > 0) {
    return { code: 'already_earned', canAttach: false, canRetry: false }
  }
  if (!linked && pointUsed > 0) {
    return { code: 'point_used_without_member', canAttach: false, canRetry: false }
  }
  if (linked) {
    return { code: 'ok_retry', canAttach: false, canRetry: true }
  }
  return { code: 'ok_attach', canAttach: true, canRetry: false }
}
