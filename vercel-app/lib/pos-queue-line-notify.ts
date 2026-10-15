import 'server-only'

import { pushLineMessagesToMember } from '@/lib/member-line-push-target'
import { createMemberEvent } from '@/lib/members-server-core'
import { buildPosQueueCallLineFlexMessage } from '@/lib/pos-queue-line-flex'
import { formatPosQueueNo, type PosQueueTicket } from '@/lib/pos-queue-ticket'

export function posQueueStoreLabel(storeCode: string): string {
  const code = String(storeCode || '').trim()
  return code.replace(/^CM\s+/i, '').trim() || code
}

export function buildPosQueueCallLineText(params: {
  queueNo: number
  partySize: number
  storeCode: string
  callCount: number
}): string {
  const no = formatPosQueueNo(params.queueNo)
  const head =
    params.callCount > 1
      ? `📣 เรียกคิวอีกครั้งครับ (ครั้งที่ ${params.callCount})`
      : '🔔 ถึงคิวของคุณแล้วครับ'
  return [
    head,
    `หมายเลขคิว ${no} (${params.partySize} ท่าน)`,
    `สาขา ${posQueueStoreLabel(params.storeCode)}`,
    'กรุณาแสดงหมายเลขนี้ที่หน้าร้านครับ',
    '',
    `Your table is ready — Queue ${no}`,
  ].join('\n')
}

/**
 * 호출 시 회원에게 LINE 푸시 1회.
 * 같은 호출 회차(call_count)는 member_events 선점으로 두 기기 동시 호출에도 1번만 보낸다.
 * 응답 전에 await 해야 한다(Vercel 응답 후 작업은 버려질 수 있음).
 */
export async function notifyPosQueueTicketCalledByLine(
  ticket: PosQueueTicket,
  opts?: { statusUrl?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const memberId = Number(ticket.memberId || 0)
  if (!memberId) return { sent: false, reason: 'no_member' }
  if (!String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim()) {
    return { sent: false, reason: 'line_token_missing' }
  }
  const eventId = `pos_queue_call:${ticket.id}:${ticket.callCount}`
  let reserved = false
  try {
    reserved = await createMemberEvent({
      eventId,
      eventType: 'pos_queue_call_notify',
      memberId,
      payload: { ticketId: ticket.id, storeCode: ticket.storeCode, queueNo: ticket.queueNo, callCount: ticket.callCount },
      status: 'processed',
    })
  } catch (e) {
    console.warn('pos-queue-line-notify: reserve_failed', { ticketId: ticket.id, error: String(e).slice(0, 200) })
    return { sent: false, reason: 'reserve_failed' }
  }
  if (!reserved) return { sent: false, reason: 'already_sent' }

  const flex = buildPosQueueCallLineFlexMessage({
    queueNo: ticket.queueNo,
    partySize: ticket.partySize,
    storeLabel: posQueueStoreLabel(ticket.storeCode),
    callCount: ticket.callCount,
    statusUrl: opts?.statusUrl,
  })
  let result = await pushLineMessagesToMember({
    memberId,
    messages: [{ type: 'flex', altText: flex.altText, contents: flex.contents }],
  })
  // Flex 본문 오류(400 등)일 때만 텍스트로 재시도 — 차단·미연결은 텍스트도 못 받는다
  if (!result.ok && result.message !== 'line_profile_not_reachable' && result.message !== 'no_line_identity') {
    const text = buildPosQueueCallLineText({
      queueNo: ticket.queueNo,
      partySize: ticket.partySize,
      storeCode: ticket.storeCode,
      callCount: ticket.callCount,
    })
    result = await pushLineMessagesToMember({ memberId, messages: [{ type: 'text', text }] })
  }
  if (!result.ok) {
    console.warn('pos-queue-line-notify: push_failed', { ticketId: ticket.id, memberId, message: result.message })
    try {
      await createMemberEvent({
        eventId: `pos_queue_call_fail:${ticket.id}:${ticket.callCount}:${Date.now()}`,
        eventType: 'pos_queue_call_notify_fail',
        memberId,
        payload: { ticketId: ticket.id },
        status: 'failed',
        errorMessage: result.message || 'push_failed',
      })
    } catch {
      /* ignore */
    }
    return { sent: false, reason: result.message || 'push_failed' }
  }
  return { sent: true }
}
