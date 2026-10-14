/** POS 자리 대기 번호표 — 서버·화면 공용 순수 로직 */

export type PosQueueTicketStatus = 'waiting' | 'called' | 'seated' | 'cancelled' | 'no_show'
export type PosQueueTicketAction = 'call' | 'seat' | 'cancel' | 'no_show' | 'restore'

export interface PosQueueTicket {
  id: number
  storeCode: string
  businessYmd: string
  queueNo: number
  partySize: number
  status: PosQueueTicketStatus
  memberId: number | null
  guestPhone: string | null
  guestName: string | null
  note: string | null
  publicToken: string
  callCount: number
  calledAt: string | null
  seatedAt: string | null
  closedAt: string | null
  createdBy: string | null
  createdAt: string
}

/** 손님 공개 화면용 — 전화번호·이름·메모 제외 */
export interface PosQueueTicketPublic {
  queueNo: number
  partySize: number
  status: PosQueueTicketStatus
  teamsAhead: number
  createdAt: string
  calledAt: string | null
  storeLabel: string
  /** 회원(LINE 알림 대상) 연결 여부만 — 회원 정보는 내보내지 않음 */
  memberLinked: boolean
}

const STATUSES: readonly PosQueueTicketStatus[] = ['waiting', 'called', 'seated', 'cancelled', 'no_show']

export function coercePosQueueTicketStatus(raw: unknown): PosQueueTicketStatus {
  const s = String(raw ?? '').trim().toLowerCase()
  return (STATUSES as readonly string[]).includes(s) ? (s as PosQueueTicketStatus) : 'waiting'
}

export function isPosQueueTicketActive(status: PosQueueTicketStatus): boolean {
  return status === 'waiting' || status === 'called'
}

/**
 * 직원 동작 → 다음 상태. 허용되지 않으면 null.
 * restore: 실수로 착석·취소·노쇼 처리한 번호를 대기로 되돌림.
 */
export function nextPosQueueTicketStatus(
  current: PosQueueTicketStatus,
  action: PosQueueTicketAction
): PosQueueTicketStatus | null {
  switch (action) {
    case 'call':
      return isPosQueueTicketActive(current) ? 'called' : null
    case 'seat':
      return isPosQueueTicketActive(current) ? 'seated' : null
    case 'cancel':
      return isPosQueueTicketActive(current) ? 'cancelled' : null
    case 'no_show':
      return isPosQueueTicketActive(current) ? 'no_show' : null
    case 'restore':
      return isPosQueueTicketActive(current) ? null : 'waiting'
    default:
      return null
  }
}

/** 내 앞에 남은 팀 수 (대기·호출 중이고 번호가 더 작은 팀) */
export function countPosQueueTeamsAhead(
  tickets: Array<{ queueNo: number; status: PosQueueTicketStatus }>,
  queueNo: number
): number {
  return tickets.filter((t) => t.queueNo < queueNo && isPosQueueTicketActive(t.status)).length
}

export function formatPosQueueNo(queueNo: number): string {
  const n = Math.max(0, Math.floor(Number(queueNo) || 0))
  return String(n).padStart(3, '0')
}

export function clampPosQueuePartySize(raw: unknown): number {
  const n = Math.floor(Number(raw) || 0)
  return Math.min(50, Math.max(1, n))
}

/** 태국 휴대폰 번호만 숫자로 정규화 (0812345678 / +66812345678 → 0812345678) */
export function normalizePosQueueGuestPhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('66') && digits.length === 11) return `0${digits.slice(2)}`
  return digits.slice(0, 15)
}

export function posQueueTicketFromRow(row: Record<string, unknown>): PosQueueTicket {
  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  const strOrNull = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s ? s : null
  }
  const memberId = num(row.member_id)
  return {
    id: num(row.id),
    storeCode: String(row.store_code ?? ''),
    businessYmd: String(row.business_ymd ?? ''),
    queueNo: num(row.queue_no),
    partySize: clampPosQueuePartySize(row.party_size),
    status: coercePosQueueTicketStatus(row.status),
    memberId: memberId > 0 ? memberId : null,
    guestPhone: strOrNull(row.guest_phone),
    guestName: strOrNull(row.guest_name),
    note: strOrNull(row.note),
    publicToken: String(row.public_token ?? ''),
    callCount: num(row.call_count),
    calledAt: strOrNull(row.called_at),
    seatedAt: strOrNull(row.seated_at),
    closedAt: strOrNull(row.closed_at),
    createdBy: strOrNull(row.created_by),
    createdAt: String(row.created_at ?? ''),
  }
}
