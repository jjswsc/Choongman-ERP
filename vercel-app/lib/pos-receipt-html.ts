/**
 * 영수증 HTML 생성 (터미널 .tsx에서 template literal 파서 혼동 방지)
 */

import {
  RECEIPT_AMOUNT_COL_MM,
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_GRID_COL_GAP_PX,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
  RECEIPT_TRAILING_BOTTOM_MM,
} from '@/lib/pos-receipt-layout'
import { posThermalReceiptPageSizeRule } from '@/lib/pos-receipt-paper'
import { POS_PRINT_NOTO_SANS_THAI_FONT_LINKS } from '@/lib/pos-print-font-links'

export function buildReceiptDocumentHtml(params: {
  title: string
  bodyContent: string
  /** 인쇄 창에만 보이고, 인쇄 시에는 안 나오는 푸터(예: 인쇄 버튼) */
  footerContent?: string
  /** 기본 영수증 CSS 뒤에 이어 붙일 화면별 추가 CSS */
  extraStyles?: string
  /** BCP 47 (예: th, ko). 태국어 등 복합 스크립트 셰이핑·줄바꿈 힌트 */
  htmlLang?: string
}): string {
  const { title, bodyContent, footerContent, extraStyles, htmlLang } = params
  const c = (tag: string) => '\u003c/' + tag + '>'
  const printOverscale = 1
  const printActionsStyle =
    '.receipt-print-actions { margin-top: 12px; text-align: center; } @media print { .receipt-print-actions { display: none !important; } } '
  const amt = RECEIPT_AMOUNT_COL_MM
  const gap = RECEIPT_GRID_COL_GAP_PX
  const langAttr =
    typeof htmlLang === 'string' && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(htmlLang.trim())
      ? ' lang="' + htmlLang.trim().replace(/"/g, '') + '"'
      : ''
  const styles =
    posThermalReceiptPageSizeRule() +
    ' html, body { margin: 0; padding: 0; } html { height: auto; overflow-x: hidden; } body { width: 80mm; max-width: 80mm; min-height: auto; height: auto; box-sizing: border-box; overflow-x: hidden; font-family: \'Noto Sans Thai\', \'Leelawadee UI\', Tahoma, \'Sukhumvit Set\', \'Inter\', \'Pretendard\', \'Noto Sans KR\', \'Malgun Gothic\', Arial, sans-serif; font-size: 12px; font-weight: 600; line-height: 1.48; letter-spacing: 0; padding-top: 0; padding-left: ' +
    String(RECEIPT_INNER_INSET_LEFT_MM) +
    'mm; padding-right: ' +
    String(RECEIPT_INNER_INSET_RIGHT_MM) +
    'mm; padding-bottom: ' +
    String(RECEIPT_TRAILING_BOTTOM_MM) +
    'mm; color: #000; -webkit-print-color-adjust: economy; print-color-adjust: economy; } @media print { body { zoom:' +
    String(printOverscale) +
    '; } } .receipt-content { width: 100%; max-width: 100%; margin-left: auto; margin-right: auto; box-sizing: border-box; padding: 0; position: relative; left: -' +
    String(RECEIPT_CONTENT_NUDGE_LEFT_MM) +
    'mm; break-inside: avoid; page-break-inside: avoid; } .receipt-order-header .receipt-store-name { font-weight: 700; font-size: 13px; color: #000; } .receipt-order-label { font-size: 11px; color: #000; font-weight: 700; margin-top: 2px; white-space: normal; overflow-wrap: break-word; word-break: normal; max-width: 100%; } .receipt-section-title { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 2px; color: #000; } .receipt-sub-title { text-align: center; font-size: 11px; color: #000; } .receipt-divider { border-top: 1px dashed #000; margin: 8px 0; } .receipt-divider-strong { border-top: 2px solid #000; margin: 8px 0; } .receipt-row { display: flex; justify-content: space-between; align-items: flex-start; gap: ' +
    String(gap) +
    'px; margin: 4px 0; padding-right: 0; box-sizing: border-box; color: #000; } @supports (display: grid) { .receipt-row { display: grid; grid-template-columns: minmax(0, 1fr) ' +
    String(amt) +
    'mm; column-gap: ' +
    String(gap) +
    'px; align-items: start; margin: 4px 0; padding-right: 0; box-sizing: border-box; color: #000; } } .receipt-row > span:first-child { min-width: 0; overflow-wrap: break-word; word-break: normal; flex: 1 1 auto; } .receipt-row > span:last-child { white-space: nowrap; text-align: right; overflow-wrap: normal; word-break: normal; font-size: 10px; line-height: 1.2; flex: 0 0 auto; } .receipt-row.receipt-total > span:last-child, .receipt-total .receipt-row > span:last-child { font-size: 11px; } .receipt-meta-row { display: flex; align-items: flex-start; gap: 3mm; margin: 3px 0; padding-right: 0.4mm; color: #000; } @supports (display: grid) { .receipt-meta-row { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); column-gap: 3mm; } } .receipt-meta-label { min-width: 0; white-space: normal; overflow-wrap: break-word; word-break: normal; color: #000; flex: 0 0 auto; } .receipt-meta-value { min-width: 0; text-align: left; overflow-wrap: break-word; word-break: normal; color: #000; font-weight: 600; flex: 1 1 auto; } .receipt-delivery-channel-no { font-size: 2em; font-weight: 700; line-height: 1.12; vertical-align: baseline; } .receipt-item-head { display: flex; justify-content: space-between; gap: ' +
    String(gap) +
    'px; font-size: 11px; font-weight: 700; padding: 0 0 4px 0; border-bottom: 1px solid #000; color: #000; box-sizing: border-box; } @supports (display: grid) { .receipt-item-head { display: grid; grid-template-columns: minmax(0, 1fr) ' +
    String(amt) +
    'mm; column-gap: ' +
    String(gap) +
    'px; font-size: 11px; font-weight: 700; padding: 0 0 4px 0; border-bottom: 1px solid #000; color: #000; box-sizing: border-box; } } .receipt-item-head > span:last-child { font-size: 10px; white-space: nowrap; text-align: right; flex: 0 0 auto; } .biz-line { margin: 2px 0; font-size: 11px; } .biz-strong { color: #000; font-weight: 600; } .receipt-total { margin-top: 8px; padding-top: 4px; font-weight: bold; color: #000; } .discount { color: #000; font-weight: 700; } .memo { margin-top: 6px; font-size: 11px; color: #000; } .receipt-line-note { font-size: 10px; font-weight: 600; color: #333; padding-left: 1.5mm; margin: -2px 0 4px 0; line-height: 1.35; } .receipt-muted { color: #000; } .paid-stamp-wrap { text-align: center; margin: 10px 0; } .paid-stamp { display: inline-block; border: 1px solid #000; padding: 2px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: #000; } .footer-strong { color: #000; font-weight: 600; } .text-center { text-align: center; } .text-xs { font-size: 11px; } ' +
    printActionsStyle +
    (extraStyles ? ' ' + extraStyles : '') +
    ' @media print { .receipt-content { left: 0; } }'
  const footer = footerContent
    ? '<div class="receipt-print-actions">' + footerContent + c('div')
    : ''
  const headInner =
    '<meta charset="utf-8"/>' +
    POS_PRINT_NOTO_SANS_THAI_FONT_LINKS +
    '<title>' +
    title +
    '</title><style>' +
    styles +
    '</style>'
  return (
    '<!DOCTYPE html><html' +
    langAttr +
    '><head>' +
    headInner +
    c('head') +
    '<body>' +
    bodyContent +
    footer +
    c('body') +
    c('html')
  )
}
