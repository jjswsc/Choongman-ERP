/**
 * POS 열전사(80mm) — 테이블 QR 주문 슬립.
 * 관리자 A6 텐트 카드(PDF)와 문구는 같고, 용지만 영수증 프린터에 맞춘다.
 */
import { posThermalReceiptPageSizeRule } from '@/lib/pos-receipt-paper'
import { POS_PRINT_NOTO_SANS_THAI_FONT_LINKS } from '@/lib/pos-print-font-links'
import { escapeHtml } from '@/lib/utils'

/** 본문 폭. 우측은 열전사 비인쇄영역 대비 패딩으로 확보 */
export const QR_TABLE_THERMAL_SLIP_BODY_WIDTH_MM = 76
export const QR_TABLE_THERMAL_SLIP_PADDING_MM = { t: 2, r: 14, b: 8, l: 4 } as const
/** 스캔 가능한 QR 한 변(mm). 80mm 롤에서 우측 여백을 뺀 본문 안에 맞춤 */
export const QR_TABLE_THERMAL_SLIP_QR_MM = 48

export const QR_TABLE_THERMAL_SCAN_TH = 'สแกนเพื่อสั่งอาหาร'
export const QR_TABLE_THERMAL_SCAN_EN = 'Scan to order from your phone'
export const QR_TABLE_THERMAL_WIFI_HINT = 'Wi-Fi recommended · No app install'

export type QrTableThermalSlipInput = {
  tableName: string
  /** data:image/... QR (원격 URL 금지 — Electron 인쇄 지연) */
  qrDataUrl: string
  storeLabel?: string
  scanTh?: string
  scanEn?: string
  wifiHint?: string
}

export function pickQrTokenForTable<T extends { tableName: string }>(
  tokens: T[],
  tableName: string
): T | undefined {
  const name = String(tableName || '').trim()
  if (!name) return undefined
  return tokens.find((t) => String(t.tableName || '').trim() === name)
}

export function resolveQrTableGuestUrl(token: { token: string; publicUrl?: string }): string {
  const publicUrl = String(token.publicUrl || '').trim()
  if (publicUrl) return publicUrl
  const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''
  return origin ? `${origin}/t/${token.token}` : `/t/${token.token}`
}

export function buildQrTableThermalSlipHtml(input: QrTableThermalSlipInput): string {
  const tableName = String(input.tableName || '').trim() || '—'
  const storeLabel = String(input.storeLabel || '').trim()
  const qrDataUrl = String(input.qrDataUrl || '').trim()
  if (!qrDataUrl.startsWith('data:image/')) {
    throw new Error('qr_data_url_required')
  }
  const scanTh = String(input.scanTh || '').trim() || QR_TABLE_THERMAL_SCAN_TH
  const scanEn = String(input.scanEn || '').trim() || QR_TABLE_THERMAL_SCAN_EN
  const wifiHint = String(input.wifiHint || '').trim() || QR_TABLE_THERMAL_WIFI_HINT
  const pad = QR_TABLE_THERMAL_SLIP_PADDING_MM
  const c = (tag: string) => '\u003c/' + tag + '>'
  const title = escapeHtml(`QR ${tableName}`)
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
    ' .table-kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; margin: 0; }' +
    ' .table-name { font-size: 22px; font-weight: 800; line-height: 1.15; margin: 2px 0 6px; word-break: break-word; }' +
    ` .qr { width: ${QR_TABLE_THERMAL_SLIP_QR_MM}mm; height: ${QR_TABLE_THERMAL_SLIP_QR_MM}mm; margin: 0 auto; display: block; background: #fff; }` +
    ' .scan-th { font-size: 13px; font-weight: 800; margin: 8px 0 2px; }' +
    ' .scan-en { font-size: 11px; font-weight: 700; margin: 0 0 4px; }' +
    ' .wifi { font-size: 9px; font-weight: 600; margin: 0; }'
  return (
    '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>' +
    POS_PRINT_NOTO_SANS_THAI_FONT_LINKS +
    '<title>' +
    title +
    '</title><style>' +
    styles +
    '</style>' +
    c('head') +
    '<body><div class="slip">' +
    (storeLabel ? `<p class="store">${escapeHtml(storeLabel)}</p>` : '') +
    '<p class="table-kicker">TABLE</p>' +
    `<p class="table-name">${escapeHtml(tableName)}</p>` +
    `<img class="qr" src="${escapeHtml(qrDataUrl)}" alt="" width="240" height="240" />` +
    `<p class="scan-th">${escapeHtml(scanTh)}</p>` +
    `<p class="scan-en">${escapeHtml(scanEn)}</p>` +
    `<p class="wifi">${escapeHtml(wifiHint)}</p>` +
    c('div') +
    c('body') +
    c('html')
  )
}
