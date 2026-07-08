import { roundMemberPointsEarn } from '@/lib/member-points-math'

/** 기존 pos_orders 행 결제 모달에 넘기는 회원 스냅샷 */
export type PosExistingOrderCheckoutMember = {
  memberId?: number
  memberNo?: string
  pointUsed?: number
}

type PosOrderMemberRow = {
  memberId?: number | null
  memberNo?: string | null
  pointUsed?: number | null
}

/** 추가 주문 updatePosOrder — 카트에 회원 미선택이어도 DB 연결 회원 유지 */
export function resolvePosOrderMemberFieldsForAddonUpdate(
  payload: PosExistingOrderCheckoutMember,
  existing: PosOrderMemberRow
): PosExistingOrderCheckoutMember {
  const payloadMemberId = Math.max(0, Number(payload.memberId ?? 0))
  const existingMemberId = Math.max(0, Number(existing.memberId ?? 0))
  const memberId = payloadMemberId > 0 ? payloadMemberId : existingMemberId > 0 ? existingMemberId : undefined
  const memberNo =
    String(payload.memberNo ?? '').trim() ||
    (memberId && memberId === existingMemberId ? String(existing.memberNo ?? '').trim() : '')
  const pointUsed =
    payload.pointUsed != null
      ? roundMemberPointsEarn(payload.pointUsed)
      : roundMemberPointsEarn(existing.pointUsed) || undefined
  return {
    ...(memberId ? { memberId } : {}),
    ...(memberNo ? { memberNo } : {}),
    ...(pointUsed != null && pointUsed > 0 ? { pointUsed } : {}),
  }
}

export function posOrderToCheckoutMemberSnapshot(order: {
  memberId?: number | null
  memberNo?: string | null
  pointUsed?: number | null
}): PosExistingOrderCheckoutMember {
  const memberId = Math.max(0, Number(order.memberId || 0))
  const memberNo = String(order.memberNo || '').trim()
  const pointUsed = roundMemberPointsEarn(order.pointUsed)
  return {
    ...(memberId > 0 ? { memberId } : {}),
    ...(memberNo ? { memberNo } : {}),
    ...(pointUsed > 0 ? { pointUsed } : {}),
  }
}

type MemberOption = { value: string; label: string }
type MemberMapEntry = { id: number; memberNo: string; name: string; phone: string; email: string; tierCode: string }

/** 기존 주문 결제 모달 진입 시 장바구니 회원 선택 상태 복원 */
export function seedCheckoutMemberFromExistingOrder(
  member: PosExistingOrderCheckoutMember | undefined,
  setters: {
    setSelectedMemberId: (value: string) => void
    setMemberMap: (updater: (prev: Record<string, MemberMapEntry>) => Record<string, MemberMapEntry>) => void
    setMemberOptions: (updater: (prev: MemberOption[]) => MemberOption[]) => void
    setPointUsed: (value: string) => void
  }
): void {
  const memberId = Math.max(0, Number(member?.memberId || 0))
  if (!memberId) {
    setters.setSelectedMemberId('')
    return
  }
  const key = String(memberId)
  const memberNo = String(member?.memberNo || '').trim()
  const labelName = memberNo || `Member #${memberId}`
  setters.setSelectedMemberId(key)
  setters.setMemberMap((prev) => ({
    ...prev,
    [key]: {
      id: memberId,
      memberNo,
      name: prev[key]?.name || labelName,
      phone: prev[key]?.phone || '',
      email: prev[key]?.email || '',
      tierCode: prev[key]?.tierCode || 'BRONZE',
    },
  }))
  setters.setMemberOptions((prev) => {
    if (prev.some((row) => row.value === key)) return prev
    return [{ value: key, label: `${labelName}${memberNo ? ` (${memberNo})` : ''}` }, ...prev]
  })
  const pointUsed = roundMemberPointsEarn(member?.pointUsed)
  if (pointUsed > 0) {
    setters.setPointUsed(String(pointUsed))
  }
}
