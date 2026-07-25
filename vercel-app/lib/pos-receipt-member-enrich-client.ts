import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import type { PosOrder } from '@/lib/api-client'
import { getMembers, getPosOrders, apiFetch } from '@/lib/api-client'
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
/** Realtime 결제 직후 point_earned 미반영 레이스 완화 */
const POINT_EARNED_REFETCH_GAP_MS = 180

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

type PointEarnedFetchResult = { earned: number; found: boolean }

async function resolveOrderPointEarnedForReceipt(
  data: ReceiptModalData,
  order?: Pick<PosOrder, 'id' | 'memberId' | 'memberNo' | 'pointEarned'> | null
): Promise<number> {
  let pointEarned = roundMemberPointsEarn(data.memberPointEarned ?? order?.pointEarned)
  if (pointEarned > 0) return pointEarned

  const orderId = Math.max(
    0,
    Math.trunc(Number(order?.id ?? data.serverOrderId ?? 0) || 0)
  )
  const memberId = Math.max(
    0,
    Math.trunc(Number(data.memberId ?? order?.memberId ?? 0) || 0)
  )
  const memberNo = String(data.memberNo ?? order?.memberNo ?? '').trim()
  if (orderId <= 0 || (!memberId && !memberNo)) return 0

  const fetchEarned = async (): Promise<PointEarnedFetchResult> => {
    try {
      const rows = await getPosOrders({ orderId, limit: 1 })
      if (!rows?.[0]) return { earned: 0, found: false }
      return { earned: roundMemberPointsEarn(rows[0].pointEarned), found: true }
    } catch {
      return { earned: 0, found: false }
    }
  }

  const first = await withTimeout<PointEarnedFetchResult>(fetchEarned(), MEMBER_ENRICH_TIMEOUT_MS, {
    earned: 0,
    found: false,
  })
  if (first.earned > 0) return first.earned
  /** 주문을 읽었고 적립이 0이면 레이스가 아님 — 재시도로 인쇄를 늦추지 않음 */
  if (first.found) return 0

  /** 타임아웃·미조회: 결제 Realtime → 적립 반영 직전 인쇄 레이스 완화 */
  await sleep(POINT_EARNED_REFETCH_GAP_MS)
  const second = await withTimeout<PointEarnedFetchResult>(fetchEarned(), MEMBER_ENRICH_TIMEOUT_MS, {
    earned: 0,
    found: false,
  })
  return second.earned
}

/** 재인쇄·메인기기 오토프린트: 회원 번호·등급·잔액 보강 */
export async function enrichReceiptModalDataWithMember(
  data: ReceiptModalData,
  order?: Pick<PosOrder, 'id' | 'memberId' | 'memberNo' | 'pointEarned'> | null
): Promise<ReceiptModalData> {
  const memberId = Math.max(0, Math.trunc(Number(data.memberId ?? order?.memberId ?? 0) || 0))
  const memberNo = String(data.memberNo ?? order?.memberNo ?? '').trim()
  const pointEarned = await resolveOrderPointEarnedForReceipt(data, order)
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
    data.memberPointBalance != null &&
    roundMemberPointsEarn(data.memberPointEarned) > 0
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
