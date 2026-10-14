import 'server-only'

import { randomBytes } from 'node:crypto'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { memberPhoneLookupVariants, normalizeMemberPhone } from '@/lib/member-phone-lookup'
import { isValidPosQueuePublicToken } from '@/lib/pos-queue-link-cookie'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'
import { posQueueStoreLabel } from '@/lib/pos-queue-line-notify'
import {
  clampPosQueuePartySize,
  countPosQueueTeamsAhead,
  isPosQueueTicketActive,
  nextPosQueueTicketStatus,
  normalizePosQueueGuestPhone,
  posQueueTicketFromRow,
  type PosQueueTicket,
  type PosQueueTicketAction,
  type PosQueueTicketPublic,
} from '@/lib/pos-queue-ticket'
import {
  supabaseInsert,
  supabaseRpc,
  supabaseSelectFilter,
  supabaseUpdateByFilterReturning,
} from '@/lib/supabase-server'

const TABLE = 'pos_queue_tickets'
const LIST_LIMIT = 300

export async function currentPosQueueBusinessYmd(storeCode: string): Promise<string> {
  const hours = await loadPosBusinessHoursForServer(storeCode)
  return getPosBusinessDateStrFromConfig(new Date(), hours).replace(/-/g, '')
}

export async function listPosQueueTicketsForDay(storeCode: string, businessYmd: string): Promise<PosQueueTicket[]> {
  const rows = (await supabaseSelectFilter(
    TABLE,
    `store_code=eq.${encodeURIComponent(storeCode)}&business_ymd=eq.${encodeURIComponent(businessYmd)}`,
    { limit: LIST_LIMIT, order: 'queue_no.asc' }
  )) as Record<string, unknown>[] | null
  return (rows || []).map(posQueueTicketFromRow)
}

/** 전화번호로 회원이 정확히 1명일 때만 연결 (가족 공유 번호 등 애매하면 연결 안 함) */
export async function findSingleMemberIdByPhone(phone: string): Promise<number> {
  const normalized = normalizeMemberPhone(phone)
  if (!normalized) return 0
  const variants = memberPhoneLookupVariants(normalized)
  if (!variants.length) return 0
  try {
    const filter = `or=(${variants.map((v) => `phone.eq.${encodeURIComponent(v)}`).join(',')})`
    const rows = (await supabaseSelectFilter('members', filter, { limit: 3, select: 'id' })) as Array<{
      id?: number
    }> | null
    const ids = [...new Set((rows || []).map((r) => Number(r.id || 0)).filter((n) => n > 0))]
    return ids.length === 1 ? ids[0] : 0
  } catch {
    return 0
  }
}

export async function issuePosQueueTicket(input: {
  storeCode: string
  partySize: unknown
  memberId?: unknown
  guestPhone?: unknown
  guestName?: unknown
  note?: unknown
  createdBy?: string | null
}): Promise<{ ticket: PosQueueTicket; teamsAhead: number }> {
  const storeCode = String(input.storeCode || '').trim()
  const businessYmd = await currentPosQueueBusinessYmd(storeCode)
  const queueNo = Number(
    await supabaseRpc<number>('allocate_pos_queue_no', { p_store_code: storeCode, p_business_ymd: businessYmd })
  )
  if (!Number.isFinite(queueNo) || queueNo <= 0) throw new Error('queue_no_allocate_failed')
  const phone = normalizePosQueueGuestPhone(input.guestPhone)
  let memberId = Math.floor(Number(input.memberId) || 0)
  if (memberId <= 0 && phone) memberId = await findSingleMemberIdByPhone(phone)
  const tenantId = await resolveTenantIdForStoreCode(storeCode).catch(() => undefined)
  const inserted = (await supabaseInsert(TABLE, {
    store_code: storeCode,
    tenant_id: tenantId || null,
    business_ymd: businessYmd,
    queue_no: queueNo,
    party_size: clampPosQueuePartySize(input.partySize),
    status: 'waiting',
    member_id: memberId > 0 ? memberId : null,
    guest_phone: phone || null,
    guest_name: String(input.guestName ?? '').trim().slice(0, 60) || null,
    note: String(input.note ?? '').trim().slice(0, 200) || null,
    public_token: randomBytes(12).toString('base64url'),
    created_by: String(input.createdBy ?? '').trim().slice(0, 60) || null,
  })) as Record<string, unknown>[]
  const row = inserted?.[0]
  if (!row) throw new Error('queue_ticket_insert_failed')
  const ticket = posQueueTicketFromRow(row)
  const dayTickets = await listPosQueueTicketsForDay(storeCode, businessYmd)
  return { ticket, teamsAhead: countPosQueueTeamsAhead(dayTickets, ticket.queueNo) }
}

export async function getPosQueueTicketById(id: number): Promise<PosQueueTicket | null> {
  const rows = (await supabaseSelectFilter(TABLE, `id=eq.${Math.floor(id)}`, { limit: 1 })) as
    | Record<string, unknown>[]
    | null
  return rows?.[0] ? posQueueTicketFromRow(rows[0]) : null
}

/**
 * 상태 변경 — 현재 상태 조건부 UPDATE 로 동시 탭(두 기기) 경합 시 한쪽만 반영.
 * @returns null 이면 허용되지 않는 전환이거나 다른 기기가 먼저 바꿈
 */
export async function applyPosQueueTicketAction(
  ticket: PosQueueTicket,
  action: PosQueueTicketAction
): Promise<PosQueueTicket | null> {
  const next = nextPosQueueTicketStatus(ticket.status, action)
  if (!next) return null
  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = { status: next, updated_at: nowIso }
  if (action === 'call') {
    patch.call_count = ticket.callCount + 1
    patch.called_at = nowIso
  } else if (action === 'seat') {
    patch.seated_at = nowIso
    patch.closed_at = nowIso
  } else if (action === 'cancel' || action === 'no_show') {
    patch.closed_at = nowIso
  } else if (action === 'restore') {
    patch.closed_at = null
    patch.seated_at = null
  }
  const rows = (await supabaseUpdateByFilterReturning(
    TABLE,
    `id=eq.${ticket.id}&status=eq.${ticket.status}&call_count=eq.${ticket.callCount}`,
    patch
  )) as Record<string, unknown>[] | null
  return rows?.[0] ? posQueueTicketFromRow(rows[0]) : null
}

export async function getPosQueueTicketByToken(tokenRaw: string): Promise<PosQueueTicket | null> {
  const token = String(tokenRaw || '').trim()
  if (!isValidPosQueuePublicToken(token)) return null
  const rows = (await supabaseSelectFilter(TABLE, `public_token=eq.${encodeURIComponent(token)}`, {
    limit: 1,
  })) as Record<string, unknown>[] | null
  return rows?.[0] ? posQueueTicketFromRow(rows[0]) : null
}

export async function getPublicPosQueueTicket(tokenRaw: string): Promise<PosQueueTicketPublic | null> {
  const ticket = await getPosQueueTicketByToken(tokenRaw)
  if (!ticket) return null
  const dayTickets = await listPosQueueTicketsForDay(ticket.storeCode, ticket.businessYmd)
  return {
    queueNo: ticket.queueNo,
    partySize: ticket.partySize,
    status: ticket.status,
    teamsAhead: countPosQueueTeamsAhead(dayTickets, ticket.queueNo),
    createdAt: ticket.createdAt,
    calledAt: ticket.calledAt,
    storeLabel: posQueueStoreLabel(ticket.storeCode),
    memberLinked: Boolean(ticket.memberId),
  }
}

/**
 * 손님이 LINE 로그인으로 번호표를 회원과 연결. 이미 다른 회원이 연결된 번호표는 바꾸지 않는다.
 * @returns 'linked' | 'already' (같은 회원) | 'other_member' | 'closed'
 */
export async function linkPosQueueTicketToMember(
  ticket: PosQueueTicket,
  memberId: number
): Promise<'linked' | 'already' | 'other_member' | 'closed'> {
  const id = Math.floor(Number(memberId) || 0)
  if (ticket.memberId) return ticket.memberId === id ? 'already' : 'other_member'
  if (!isPosQueueTicketActive(ticket.status)) return 'closed'
  const rows = (await supabaseUpdateByFilterReturning(
    TABLE,
    `id=eq.${ticket.id}&member_id=is.null&status=in.(waiting,called)`,
    { member_id: id, updated_at: new Date().toISOString() }
  )) as Record<string, unknown>[] | null
  if (rows?.[0]) return 'linked'
  const latest = await getPosQueueTicketById(ticket.id)
  return latest?.memberId === id ? 'already' : 'other_member'
}
