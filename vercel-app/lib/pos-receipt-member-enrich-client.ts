import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import type { PosOrder } from '@/lib/api-client'
import { getMembers, apiFetch } from '@/lib/api-client'
import {
  memberReceiptFieldsFromMemberRow,
  mergeMemberReceiptFields,
} from '@/lib/pos-receipt-member-block'
import { roundMemberPointsEarn } from '@/lib/member-points-math'

type MemberRowLite = {
  id?: number
  memberNo?: string
  phone?: string
  tierCode?: string
  pointBalance?: number
}

const MEMBER_ENRICH_TIMEOUT_MS = 250

async function withTimeout<T>(job: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  const ms = Math.max(1, Math.trunc(Number(timeoutMs) || 0))
  try {
    return await Promise.race<T>([
      job,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ])
  } catch {
    return fallback
  }
}

async function fetchMemberById(memberId: number): Promise<MemberRowLite | null> {
  try {
    const res = await apiFetch(`/api/members/${memberId}`)
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; member?: MemberRowLite }
      | MemberRowLite
      | null
    if (!data) return null
    if ('member' in data && data.member) return data.member
    if ('id' in data && Number(data.id) > 0) return data as MemberRowLite
    return null
  } catch {
    return null
  }
}

/** 재인쇄·메인기기 오토프린트: 회원 번호·등급·잔액 보강 */
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
  const hasDetail =
    String(data.memberNo ?? '').trim() &&
    String(data.memberTierCode ?? '').trim() &&
    data.memberPointBalance != null
  if (hasDetail) return withIds

  try {
    let match: MemberRowLite | null = null
    if (memberId > 0) {
      match = await withTimeout(fetchMemberById(memberId), MEMBER_ENRICH_TIMEOUT_MS, null)
    }
    if (!match && memberNo) {
      const list = await withTimeout(getMembers({ q: memberNo, limit: 30 }), MEMBER_ENRICH_TIMEOUT_MS, [])
      match =
        (memberId > 0 ? list.find((row) => Number(row.id) === memberId) : undefined) ||
        list.find((row) => String(row.memberNo || '').trim() === memberNo) ||
        null
    }
    if (!match) return withIds
    const fields = memberReceiptFieldsFromMemberRow(match, pointEarned)
    return mergeMemberReceiptFields(withIds, fields)
  } catch {
    return withIds
  }
}
