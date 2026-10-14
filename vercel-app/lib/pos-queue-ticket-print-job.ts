/** 대기 번호표 원격 인쇄(태블릿·휴대폰 → 메인 POS 영수증 프린터) payload */

export type QueueTicketPrintJobPayload = {
  action: 'queue_ticket'
  ticketId: number
  queueNo: number
  partySize: number
  teamsAhead: number
  issuedAt: string
  url?: string
  storeLabel?: string
}

export function queueTicketPayloadFromPrintJob(
  payload: Record<string, unknown> | null | undefined
): QueueTicketPrintJobPayload | null {
  if (!payload || typeof payload !== 'object') return null
  if (String(payload.action || '').trim() !== 'queue_ticket') return null
  const queueNo = Math.floor(Number(payload.queueNo) || 0)
  if (queueNo <= 0) return null
  return {
    action: 'queue_ticket',
    ticketId: Math.floor(Number(payload.ticketId) || 0),
    queueNo,
    partySize: Math.max(1, Math.floor(Number(payload.partySize) || 1)),
    teamsAhead: Math.max(0, Math.floor(Number(payload.teamsAhead) || 0)),
    issuedAt: String(payload.issuedAt || ''),
    url: String(payload.url || '').trim() || undefined,
    storeLabel: String(payload.storeLabel || '').trim() || undefined,
  }
}
