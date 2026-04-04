/**
 * 영수증 HTML 생성 (터미널 .tsx에서 template literal 파서 혼동 방지)
 */

import { posThermalReceiptPageSizeRule } from '@/lib/pos-receipt-paper'

export function buildReceiptDocumentHtml(params: {
  title: string
  bodyContent: string
  /** 인쇄 창에만 보이고, 인쇄 시에는 안 나오는 푸터(예: 인쇄 버튼) */
  footerContent?: string
}): string {
  const { title, bodyContent, footerContent } = params
  const c = (tag: string) => '\u003c/' + tag + '>'
  /** 80mm 용지: 왼쪽 5mm·오른쪽 7mm 안쪽(금액 잘림 완화), 인쇄 100% 스케일. */
  const printOverscale = 1
  const printActionsStyle =
    '.receipt-print-actions { margin-top: 12px; text-align: center; } @media print { .receipt-print-actions { display: none !important; } }'
  const styles =
    posThermalReceiptPageSizeRule() +
    ' html, body { margin: 0; padding: 0; } html { height: auto; } body { width: 80mm; max-width: 80mm; min-height: auto; height: auto; box-sizing: border-box; font-family: \'Noto Sans KR\', \'Malgun Gothic\', Arial, sans-serif; font-size: 12px; font-weight: 600; line-height: 1.42; letter-spacing: 0; padding-top: 0; padding-left: 5mm; padding-right: 7mm; padding-bottom: 1mm; color: #000; -webkit-print-color-adjust: economy; print-color-adjust: economy; } @media print { body { zoom:' + String(printOverscale) + '; } } .receipt-content { width: 100%; max-width: 100%; margin-left: auto; margin-right: auto; box-sizing: border-box; padding: 0; position: relative; left: -3mm; break-inside: avoid; page-break-inside: avoid; } .receipt-order-header .receipt-store-name { font-weight: 700; font-size: 13px; color: #000; } .receipt-order-label { font-size: 11px; color: #000; font-weight: 700; margin-top: 2px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; max-width: 100%; } .receipt-section-title { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 2px; color: #000; } .receipt-sub-title { text-align: center; font-size: 11px; color: #000; } .receipt-divider { border-top: 1px dashed #000; margin: 8px 0; } .receipt-divider-strong { border-top: 2px solid #000; margin: 8px 0; } .receipt-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; align-items: start; margin: 4px 0; padding-right: 0.4mm; color: #000; } .receipt-row > span:first-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; } .receipt-row > span:last-child { white-space: normal; text-align: right; overflow-wrap: anywhere; word-break: break-word; } .receipt-meta-row { display: grid; grid-template-columns: minmax(0, 46%) minmax(0, 54%); column-gap: 6px; align-items: start; margin: 3px 0; padding-right: 0.4mm; color: #000; } .receipt-meta-label { min-width: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; color: #000; } .receipt-meta-value { min-width: 0; text-align: left; overflow-wrap: anywhere; word-break: break-word; color: #000; font-weight: 600; } .receipt-item-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 7px; font-size: 11px; font-weight: 700; padding: 0 0.4mm 4px 0; border-bottom: 1px solid #000; color: #000; } .biz-line { margin: 2px 0; font-size: 11px; } .biz-strong { color: #000; font-weight: 600; } .receipt-total { margin-top: 8px; padding-top: 4px; font-weight: bold; color: #000; } .discount { color: #000; font-weight: 700; } .memo { margin-top: 6px; font-size: 11px; color: #000; } .receipt-line-note { font-size: 10px; font-weight: 600; color: #333; padding-left: 1.5mm; margin: -2px 0 4px 0; line-height: 1.35; } .receipt-muted { color: #000; } .paid-stamp-wrap { text-align: center; margin: 10px 0; } .paid-stamp { display: inline-block; border: 1px solid #000; padding: 2px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: #000; } .footer-strong { color: #000; font-weight: 600; } .text-center { text-align: center; } .text-xs { font-size: 11px; } ' +
    printActionsStyle
  const footer = footerContent
    ? '<div class="receipt-print-actions">' + footerContent + c('div')
    : ''
  return '<!DOCTYPE html><html><head><title>' + title + '</title><style>' + styles + '</style>' + c('head') + '<body>' + bodyContent + footer + c('body') + c('html')
}
