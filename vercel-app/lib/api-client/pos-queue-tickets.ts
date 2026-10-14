import { apiFetch } from '@/lib/api/fetch'
import type { PosQueueTicket } from '@/lib/pos-queue-ticket'

export type PosQueueTicketListResult = {
  enabled: boolean
  lineNotifyEnabled: boolean
  tickets: PosQueueTicket[]
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null
}

export async function listPosQueueTickets(storeCode: string): Promise<PosQueueTicketListResult> {
  const res = await apiFetch(`/api/pos/queue-tickets?storeCode=${encodeURIComponent(storeCode)}`, {
    cache: 'no-store',
  })
  const j = await readJson<{
    success?: boolean
    enabled?: boolean
    lineNotifyEnabled?: boolean
    tickets?: PosQueueTicket[]
    message?: string
  }>(res)
  if (!res.ok || !j?.success) throw new Error(j?.message || `queue_list_failed_${res.status}`)
  return {
    enabled: j.enabled === true,
    lineNotifyEnabled: j.lineNotifyEnabled !== false,
    tickets: Array.isArray(j.tickets) ? j.tickets : [],
  }
}

export async function issuePosQueueTicketRequest(input: {
  storeCode: string
  partySize: number
  memberId?: number | null
  guestPhone?: string
  guestName?: string
  note?: string
  printRemote?: boolean
}): Promise<{ ticket: PosQueueTicket; teamsAhead: number; remotePrintQueued: boolean }> {
  const res = await apiFetch('/api/pos/queue-tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode: input.storeCode,
      partySize: input.partySize,
      memberId: input.memberId ?? null,
      guestPhone: input.guestPhone ?? '',
      guestName: input.guestName ?? '',
      note: input.note ?? '',
      printRemote: input.printRemote === true,
    }),
  })
  const j = await readJson<{
    success?: boolean
    ticket?: PosQueueTicket
    teamsAhead?: number
    remotePrintQueued?: boolean
    message?: string
  }>(res)
  if (!res.ok || !j?.success || !j.ticket) throw new Error(j?.message || `queue_issue_failed_${res.status}`)
  return {
    ticket: j.ticket,
    teamsAhead: Math.max(0, Math.floor(Number(j.teamsAhead) || 0)),
    remotePrintQueued: j.remotePrintQueued === true,
  }
}

export type PosQueueTicketActionResult =
  | { ok: true; ticket: PosQueueTicket; lineSent: boolean; lineReason?: string }
  | { ok: false; conflict: boolean; ticket: PosQueueTicket | null; message: string }

export async function postPosQueueTicketAction(
  id: number,
  action: 'call' | 'seat' | 'cancel' | 'no_show' | 'restore' | 'reprint'
): Promise<PosQueueTicketActionResult> {
  const res = await apiFetch(`/api/pos/queue-tickets/${Math.floor(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const j = await readJson<{
    success?: boolean
    ticket?: PosQueueTicket | null
    line?: { sent?: boolean; reason?: string } | null
    message?: string
  }>(res)
  if (res.ok && j?.success && j.ticket) {
    return { ok: true, ticket: j.ticket, lineSent: j.line?.sent === true, lineReason: j.line?.reason }
  }
  return {
    ok: false,
    conflict: res.status === 409,
    ticket: j?.ticket ?? null,
    message: j?.message || `queue_action_failed_${res.status}`,
  }
}
