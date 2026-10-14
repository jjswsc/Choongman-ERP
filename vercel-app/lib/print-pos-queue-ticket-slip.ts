/** POS 영수증 프린터로 자리 대기 번호표 출력 (웹 iframe · Windows 하이브리드 · Android 공통) */
import QRCode from 'qrcode'
import type { PosPrinterSettings } from '@/lib/api-client'
import { printPosHtmlDocument } from '@/lib/pos-print-html'
import { buildPosQueueTicketSlipHtml } from '@/lib/pos-queue-ticket-slip-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'

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
  printerSettings?: PosPrinterSettings | null
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
    escPosCutOverride: resolveEscPosCutOverride(input.printerSettings, {
      printRole: 'receipt',
      printReceiptKind: 'hall_order',
    }),
  })
}
