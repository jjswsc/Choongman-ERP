import { supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeMemberPoints, roundMemberPointsEarn } from '@/lib/member-points-math'
import type { PosOrderLoyaltyReceiptApiFields } from '@/lib/pos-receipt-member-block'

type MemberSnapRow = {
  id?: number
  member_no?: string | null
  phone?: string | null
  tier_code?: string | null
  point_balance?: number | null
}

/** 결제 API 응답용 — 잔여는 이 빌 적립분 제외 */
export async function loadPosOrderMemberReceiptSnapshot(params: {
  memberId?: number | null
  pointEarned?: number | null
}): Promise<PosOrderLoyaltyReceiptApiFields | null> {
  const memberId = Math.max(0, Math.trunc(Number(params.memberId || 0) || 0))
  if (!memberId) return null
  const pointEarned = roundMemberPointsEarn(params.pointEarned)
  try {
    const rows = (await supabaseSelectFilter(
      'members',
      `id=eq.${memberId}`,
      {
        select: 'id,member_no,phone,tier_code,point_balance',
        limit: 1,
      }
    )) as MemberSnapRow[]
    const m = rows?.[0]
    if (!m) {
      return { pointEarned, memberId }
    }
    const bal = normalizeMemberPoints(m.point_balance)
    return {
      memberId,
      memberNo: String(m.member_no ?? '').trim() || undefined,
      memberPhone: String(m.phone ?? '').trim() || undefined,
      memberTierCode: String(m.tier_code ?? '').trim() || undefined,
      pointEarned,
      memberPointBalance: Math.max(0, normalizeMemberPoints(bal - pointEarned)),
    }
  } catch (e) {
    console.error('loadPosOrderMemberReceiptSnapshot:', e)
    return { pointEarned, memberId }
  }
}
