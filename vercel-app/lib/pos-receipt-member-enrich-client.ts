import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import type { PosOrder } from '@/lib/api-client'
import { getMembers } from '@/lib/api-client'
import {
  memberReceiptFieldsFromMemberRow,
  mergeMemberReceiptFields,
} from '@/lib/pos-receipt-member-block'
import { roundMemberPointsEarn } from '@/lib/member-points-math'

/** 재인쇄·메인기기 오토프린트: 회원 전화·등급·잔액 보강 */
export async function enrichReceiptModalDataWithMember(
  data: ReceiptModalData,
  order?: Pick<PosOrder, 'memberId' | 'memberNo' | 'pointEarned'> | null
): Promise<ReceiptModalData> {
  const memberId = Math.max(0, Math.trunc(Number(data.memberId ?? order?.memberId ?? 0) || 0))
  const memberNo = String(data.memberNo ?? order?.memberNo ?? '').trim()
  const pointEarned = roundMemberPointsEarn(data.memberPointEarned ?? order?.pointEarned)
  const withIds = {
    ...data,
    ...(memberId > 0 ? { memberId } : {}),
    ...(memberNo ? { memberNo } : {}),
    ...(pointEarned > 0 || data.memberPointEarned != null ? { memberPointEarned: pointEarned } : {}),
  }
  if (!memberId && !memberNo) {
    return pointEarned > 0 ? { ...data, memberPointEarned: pointEarned } : data
  }
  if (String(data.memberPhone ?? '').trim() && data.memberPointBalance != null) {
    return withIds
  }
  // 텍스트 검색은 memberNo/전화 기준 — id만 있으면 오매칭 위험이 있어 조회하지 않음
  if (!memberNo) {
    return withIds
  }
  try {
    const list = await getMembers({ q: memberNo, limit: 30 })
    const match =
      (memberId > 0 ? list.find((row) => Number(row.id) === memberId) : undefined) ||
      list.find((row) => String(row.memberNo || '').trim() === memberNo)
    if (!match) return withIds
    const fields = memberReceiptFieldsFromMemberRow(match, pointEarned)
    return mergeMemberReceiptFields(withIds, fields)
  } catch {
    return withIds
  }
}
