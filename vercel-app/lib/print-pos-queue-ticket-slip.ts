/** POS 영수증 프린터로 자리 대기 번호표 출력 (웹 iframe · Windows 하이브리드 · Android 공통) */
import QRCode from 'qrcode'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { buildPosQueueTicketSlipHtml } from '@/lib/pos-queue-ticket-slip-html'

export function resolvePosQueuePublicUrl(publicToken: string): string {
  const token = String(publicToken || '').trim()
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''
  return origin ? `${origin}/q/${token}` : `/q/${token}`
}

export async function printPosQueueTicketSlip(input: {
  queueNo: number
  partySize: number
  teamsAhead: number
  issuedAt: string
  url?: string
  storeLabel?: string
}): Promise<void> {
  const url = String(input.url || '').trim()
  const qrDataUrl = url
    ? await QRCode.toDataURL(url, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
    : undefined
  const html = buildPosQueueTicketSlipHtml({
    queueNo: input.queueNo,
    partySize: input.partySize,
    teamsAhead: input.teamsAhead,
    issuedAt: input.issuedAt,
    storeLabel: input.storeLabel,
    qrDataUrl,
  })
  await printPosHtmlDocument(html, {
    title: `Queue ${input.queueNo}`,
    printRole: 'receipt',
    printReceiptKind: 'hall_order',
    // 손님에게 바로 건네는 번호표 — 홀 주문서 절단 스위치(대부분 매장 OFF, 드라이버 절단 의존)를 따르지 않고 항상 자른다
    escPosCutOverride: true,
  })
}
