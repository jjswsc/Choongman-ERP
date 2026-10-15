import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { enqueueQueueTicketPrintJob } from '@/lib/pos-print-job-queue'
import { notifyPosQueueTicketCalledByLine, posQueueStoreLabel } from '@/lib/pos-queue-line-notify'
import { countPosQueueTeamsAhead, type PosQueueTicketAction } from '@/lib/pos-queue-ticket'
import { loadPosQueueConfig } from '@/lib/pos-queue-settings-server'
import {
  applyPosQueueTicketAction,
  findSingleMemberIdByPhone,
  getPosQueueTicketById,
  listPosQueueTicketsForDay,
} from '@/lib/pos-queue-tickets-server'

type Ctx = { params: Promise<{ id: string }> }

const STATUS_ACTIONS: readonly PosQueueTicketAction[] = ['call', 'seat', 'cancel', 'no_show', 'restore']

/**
 * 상태 변경(call/seat/cancel/no_show/restore) 또는 reprint(메인 POS 큐 인쇄).
 * call 이면 회원 LINE 호출 푸시를 응답 전에 마친다.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const headers = posApiCorsHeaders()
  try {
    const id = Number((await ctx.params).id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: 'invalid_id' }, { status: 400, headers })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? '').trim()
    const ticket = await getPosQueueTicketById(id)
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'not_found' }, { status: 404, headers })
    }
    const gate = await requirePosStoreWriteAuth(req, ticket.storeCode, headers)
    if (!gate.ok) return gate.response

    if (action === 'reprint') {
      const dayTickets = await listPosQueueTicketsForDay(ticket.storeCode, ticket.businessYmd)
      await enqueueQueueTicketPrintJob({
        storeCode: ticket.storeCode,
        payload: {
          action: 'queue_ticket',
          ticketId: ticket.id,
          queueNo: ticket.queueNo,
          partySize: ticket.partySize,
          teamsAhead: countPosQueueTeamsAhead(dayTickets, ticket.queueNo),
          issuedAt: ticket.createdAt,
          url: `${req.nextUrl.origin}/q/${ticket.publicToken}`,
          storeLabel: posQueueStoreLabel(ticket.storeCode),
        },
      })
      return NextResponse.json({ success: true, ticket, remotePrintQueued: true }, { headers })
    }

    if (!(STATUS_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ success: false, message: 'invalid_action' }, { status: 400, headers })
    }
    const updated = await applyPosQueueTicketAction(ticket, action as PosQueueTicketAction)
    if (!updated) {
      const latest = await getPosQueueTicketById(id)
      return NextResponse.json(
        { success: false, message: 'state_conflict', ticket: latest },
        { status: 409, headers }
      )
    }
    let line: { sent: boolean; reason?: string } | null = null
    if (action === 'call') {
      const config = await loadPosQueueConfig()
      if (config.lineNotifyEnabled) {
        let target = updated
        if (!target.memberId && target.guestPhone) {
          const memberId = await findSingleMemberIdByPhone(target.guestPhone)
          if (memberId) target = { ...target, memberId }
        }
        line = await notifyPosQueueTicketCalledByLine(target, {
          statusUrl: `${req.nextUrl.origin}/q/${target.publicToken}`,
        })
      } else {
        line = { sent: false, reason: 'disabled' }
      }
    }
    return NextResponse.json({ success: true, ticket: updated, line }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
  }
}
