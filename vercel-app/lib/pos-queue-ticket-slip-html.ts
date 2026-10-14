/**
 * POS 열전사(80mm) — 자리 대기 번호표.
 * 레이아웃 여백·폭은 테이블 QR 슬립과 같게 둔다(같은 영수증 프린터).
 */
import { POS_PRINT_NOTO_SANS_THAI_FONT_LINKS } from '@/lib/pos-print-font-links'
import { formatPosQueueNo } from '@/lib/pos-queue-ticket'
import { posThermalReceiptPageSizeRule } from '@/lib/pos-receipt-paper'
import {
  QR_TABLE_THERMAL_SLIP_BODY_WIDTH_MM,
  QR_TABLE_THERMAL_SLIP_PADDING_MM,
} from '@/lib/qr-table-thermal-slip-html'
import { escapeHtml } from '@/lib/utils'

export const POS_QUEUE_SLIP_QR_MM = 34

export type PosQueueTicketSlipInput = {
  queueNo: number
  partySize: number
  teamsAhead: number
  /** ISO 발급 시각 — 방콕시간으로 표시 */
  issuedAt: string
  storeLabel?: string
  /** data:image/... (원격 URL 금지 — Electron 인쇄 지연) */
  qrDataUrl?: string
}

export function formatPosQueueIssuedAtBangkok(iso: string): string {
  const d = new Date(String(iso || ''))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function buildPosQueueTicketSlipHtml(input: PosQueueTicketSlipInput): string {
  const no = formatPosQueueNo(input.queueNo)
  const party = Math.max(1, Math.floor(Number(input.partySize) || 1))
  const ahead = Math.max(0, Math.floor(Number(input.teamsAhead) || 0))
  const storeLabel = String(input.storeLabel || '').trim()
  const issued = formatPosQueueIssuedAtBangkok(input.issuedAt)
  const qrDataUrl = String(input.qrDataUrl || '').trim()
  const hasQr = qrDataUrl.startsWith('data:image/')
  const pad = QR_TABLE_THERMAL_SLIP_PADDING_MM
  const c = (tag: string) => '\u003c/' + tag + '>'
  const styles =
    posThermalReceiptPageSizeRule() +
    ' html, body { margin: 0; padding: 0; }' +
    ' html { height: auto; overflow-x: hidden; }' +
    ' body { width: 80mm; max-width: 80mm; box-sizing: border-box; overflow-x: hidden;' +
    ` padding: ${pad.t}mm ${pad.r}mm ${pad.b}mm ${pad.l}mm;` +
    " color: #000; font-family: 'Noto Sans Thai', 'Leelawadee UI', Tahoma, 'Sukhumvit Set', 'Inter', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', Arial, sans-serif;" +
    ' -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    ' @media print { body { zoom: 1; } }' +
    ` .slip { width: 100%; max-width: ${QR_TABLE_THERMAL_SLIP_BODY_WIDTH_MM}mm; margin: 0 auto; text-align: center; box-sizing: border-box; }` +
    ' .store { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 2px; }' +
    ' .kicker { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; margin: 0; }' +
    ' .no { font-size: 46px; font-weight: 900; line-height: 1.05; margin: 2px 0 4px; letter-spacing: 0.04em; }' +
    ' .party { font-size: 14px; font-weight: 800; margin: 0 0 2px; }' +
    ' .ahead { font-size: 12px; font-weight: 700; margin: 0 0 2px; }' +
    ' .time { font-size: 10px; font-weight: 600; margin: 0 0 6px; }' +
    ` .qr { width: ${POS_QUEUE_SLIP_QR_MM}mm; height: ${POS_QUEUE_SLIP_QR_MM}mm; margin: 0 auto; display: block; background: #fff; }` +
    ' .scan { font-size: 11px; font-weight: 700; margin: 4px 0 0; }' +
    ' .note { font-size: 10px; font-weight: 600; margin: 6px 0 0; }'
  return (
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>' +
    POS_PRINT_NOTO_SANS_THAI_FONT_LINKS +
    '<title>' +
    escapeHtml(`Queue ${no}`) +
    '</title><style>' +
    styles +
    '</style>' +
    c('head') +
    '<body><div class="slip">' +
    (storeLabel ? `<p class="store">${escapeHtml(storeLabel)}</p>` : '') +
    '<p class="kicker">คิว · QUEUE</p>' +
    `<p class="no">${escapeHtml(no)}</p>` +
    `<p class="party">${party} ท่าน · ${party} ${party === 1 ? 'person' : 'people'}</p>` +
    `<p class="ahead">รออีก ${ahead} คิว · ${ahead} ahead</p>` +
    (issued ? `<p class="time">${escapeHtml(issued)}</p>` : '') +
    (hasQr
      ? `<img class="qr" src="${escapeHtml(qrDataUrl)}" alt="" width="200" height="200" />` +
        '<p class="scan">สแกนเพื่อดูสถานะคิว · Scan to check</p>'
      : '') +
    '<p class="note">เมื่อถึงคิว พนักงานจะเรียกหมายเลขนี้ครับ</p>' +
    c('div') +
    c('body') +
    c('html')
  )
}
