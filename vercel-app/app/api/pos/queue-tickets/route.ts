import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { posQueueStoreLabel } from '@/lib/pos-queue-line-notify'
import { isPosQueueEnabledForStore } from '@/lib/pos-queue-settings'
import { loadPosQueueConfig } from '@/lib/pos-queue-settings-server'
import {
  currentPosQueueBusinessYmd,
  issuePosQueueTicket,
  listPosQueueTicketsForDay,
} from '@/lib/pos-queue-tickets-server'
import { enqueueQueueTicketPrintJob } from '@/lib/pos-print-job-queue'

function errorResponse(e: unknown, headers: Headers) {
  const msg = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
}

/** 오늘(영업일) 대기 목록 + 매장 사용 여부 */
export async function GET(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const storeCode = String(req.nextUrl.searchParams.get('storeCode') || '').trim()
    const gate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!gate.ok) return gate.response
    const config = await loadPosQueueConfig()
    const enabled = isPosQueueEnabledForStore(config, storeCode)
    if (!enabled) {
      return NextResponse.json({ success: true, enabled: false, tickets: [] }, { headers })
    }
    const businessYmd = await currentPosQueueBusinessYmd(storeCode)
    const tickets = await listPosQueueTicketsForDay(storeCode, businessYmd)
    return NextResponse.json(
      { success: true, enabled: true, lineNotifyEnabled: config.lineNotifyEnabled, businessYmd, tickets },
      { headers }
    )
  } catch (e) {
    return errorResponse(e, headers)
  }
}

/** 번호표 발급. printRemote=true 면 메인 POS 영수증 프린터 큐로 인쇄 요청까지 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode ?? '').trim()
    const gate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!gate.ok) return gate.response
    const config = await loadPosQueueConfig()
    if (!isPosQueueEnabledForStore(config, storeCode)) {
      return NextResponse.json({ success: false, message: 'queue_disabled' }, { status: 403, headers })
    }
    const { ticket, teamsAhead } = await issuePosQueueTicket({
      storeCode,
      partySize: body.partySize,
      memberId: body.memberId,
      guestPhone: body.guestPhone,
      guestName: body.guestName,
      note: body.note,
      createdBy: gate.auth.name,
    })
    let remotePrintQueued = false
    if (body.printRemote === true) {
      try {
        await enqueueQueueTicketPrintJob({
          storeCode,
          payload: {
            action: 'queue_ticket',
            ticketId: ticket.id,
            queueNo: ticket.queueNo,
            partySize: ticket.partySize,
            teamsAhead,
            issuedAt: ticket.createdAt,
            url: `${req.nextUrl.origin}/q/${ticket.publicToken}`,
            storeLabel: posQueueStoreLabel(storeCode),
          },
        })
        remotePrintQueued = true
      } catch (e) {
        console.warn('queue-tickets: remote print enqueue failed', String(e).slice(0, 200))
      }
    }
    return NextResponse.json({ success: true, ticket, teamsAhead, remotePrintQueued }, { headers })
  } catch (e) {
    return errorResponse(e, headers)
  }
}