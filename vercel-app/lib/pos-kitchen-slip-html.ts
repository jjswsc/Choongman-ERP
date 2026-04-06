/**
 * 주방 주문서 인쇄용 HTML (POS·관리자 공통)
 */

import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'

/** 용지 80mm. 본문 폭을 과도하게 줄이면 일부 드라이버에서 오히려 오른쪽 잘림이 커질 수 있어, 폭은 넉넉히 두고 패딩으로 오른쪽 안전 여백을 준다. */
const POS_PAPER_WIDTH_MM = 80
const KITCHEN_SLIP_BODY_WIDTH_MM = 76
/** top, right, bottom, left — 오른쪽은 열전사·Electron 비인쇄영역 대비 (기존 4mm → +10mm) */
const KITCHEN_SLIP_PADDING_MM = { t: 1, r: 14, b: 1, l: 2 } as const
/** @page 높이: 짧으면 긴 주방전표가 2페이지로 잘림. 600mm까지 한 페이지로 묶음. */
const POS_PAPER_HEIGHT_MM = 600

export type KitchenSlipFontScale = 'sm' | 'md' | 'lg'

export type KitchenSlipDesignResolved = {
  fontScale: KitchenSlipFontScale
  showLineNotes: boolean
  showOrderMemo: boolean
}

/** getPosPrinterSettings 응답 등에서 주방 슬립 디자인 정규화 */
export function resolveKitchenSlipDesign(s?: {
  kitchenSlipFontScale?: string
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
}): KitchenSlipDesignResolved {
  const raw = String(s?.kitchenSlipFontScale || 'md').toLowerCase()
  const fontScale: KitchenSlipFontScale = raw === 'sm' ? 'sm' : raw === 'lg' ? 'lg' : 'md'
  return {
    fontScale,
    showLineNotes: s?.kitchenSlipShowLineNotes !== false,
    showOrderMemo: s?.kitchenSlipShowOrderMemo !== false,
  }
}

function typographyForScale(scale: KitchenSlipFontScale) {
  switch (scale) {
    case 'sm':
      return { header: 18, row: 14, lineNote: 12, memo: 14, body: 14 }
    case 'lg':
      return { header: 26, row: 22, lineNote: 16, memo: 18, body: 22 }
    default:
      /** md: 80mm·Electron 인쇄에서 한 줄이 과하게 잘리지 않도록 약간 축소 */
      return { header: 20, row: 16, lineNote: 13, memo: 15, body: 16 }
  }
}

/** @page + body 기본 (폰트 크기는 design 반영) */
export function getKitchenSlipPaperCss(
  design: KitchenSlipDesignResolved,
  printColorAdjust: 'exact' | 'economy' = 'exact'
): string {
  const tp = typographyForScale(design.fontScale)
  const color = printColorAdjust === 'economy' ? 'economy' : 'exact'
  return `
  @page { size: ${POS_PAPER_WIDTH_MM}mm ${POS_PAPER_HEIGHT_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  html { height: auto; }
  @media print {
    html, body { height: auto !important; min-height: 0 !important; }
  }
  body {
    width: ${KITCHEN_SLIP_BODY_WIDTH_MM}mm;
    max-width: 100%;
    min-height: auto;
    height: auto;
    margin: 0 auto;
    box-sizing: border-box;
    font-family: sans-serif;
    font-size: ${tp.body}px;
    padding: ${KITCHEN_SLIP_PADDING_MM.t}mm ${KITCHEN_SLIP_PADDING_MM.r}mm ${KITCHEN_SLIP_PADDING_MM.b}mm ${KITCHEN_SLIP_PADDING_MM.l}mm;
    -webkit-print-color-adjust: ${color};
    print-color-adjust: ${color};
  }
`
}

function kitchenSlipClassCss(design: KitchenSlipDesignResolved): string {
  const tp = typographyForScale(design.fontScale)
  return `
.k-header { text-align: center; font-size: ${tp.header}px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; word-break: break-word; overflow-wrap: anywhere; }
.k-row { margin: 6px 0; font-size: ${tp.row}px; max-width: 100%; word-break: break-word; overflow-wrap: anywhere; white-space: normal; line-height: 1.35; }
.k-line-note { font-size: ${tp.lineNote}px; color: #333; margin-top: 3px; padding-left: 2px; line-height: 1.25; word-break: break-word; overflow-wrap: anywhere; }
.k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: ${tp.memo}px; }
`
}

/** 주방전표 한 줄: 수량 × 메뉴명 + (선택) 줄 메모 */
export function formatKitchenSlipItemRowHtml(
  it: { name: string; qty: number; note?: string | null | undefined },
  escapeHtml: (s: string) => string,
  close: (tag: string) => string,
  opts?: { showLineNotes?: boolean }
): string {
  const showLineNotes = opts?.showLineNotes !== false
  const note = showLineNotes ? String(it.note ?? '').trim() : ''
  const main = Number(it.qty) + ' × ' + escapeHtml(it.name)
  if (!note) return '<div class="k-row">' + main + close('div')
  return (
    '<div class="k-row">' +
    main +
    '<div class="k-line-note">' +
    escapeHtml(note) +
    close('div') +
    close('div')
  )
}

export function buildKitchenSlipItemsHtml(
  items: { name: string; qty: number; note?: string | null | undefined }[],
  escapeHtml: (s: string) => string,
  design: KitchenSlipDesignResolved,
  prependHtml = ''
): string {
  const c = (tag: string) => '\u003c/' + tag + '>'
  return (
    prependHtml +
    items
      .map((it) =>
        formatKitchenSlipItemRowHtml(it, escapeHtml, c, { showLineNotes: design.showLineNotes })
      )
      .join('')
  )
}

/** memoLine 전체를 한 번 escape (예: "메모: 내용") */
export function buildKitchenSlipMemoBlockHtml(
  memoLine: string,
  escapeHtml: (s: string) => string,
  design: KitchenSlipDesignResolved
): string {
  if (!design.showOrderMemo) return ''
  const trimmed = String(memoLine ?? '').trim()
  if (!trimmed) return ''
  const c = (tag: string) => '\u003c/' + tag + '>'
  return '<div class="k-memo">' + escapeHtml(trimmed) + c('div')
}

/**
 * 단일 슬립 전체 HTML (인쇄 창에 document.write)
 * itemsHtml / memoHtml 은 이미 안전한 HTML 조각
 */
export function buildKitchenSlipHtml(params: {
  label: string
  orderNo: string
  storeCode: string
  orderTypeLabel: string
  tablePart: string
  dateStr: string
  itemsHtml: string
  memoHtml: string
  escapeHtml: (s: string) => string
  design: KitchenSlipDesignResolved
  printColorAdjust?: 'exact' | 'economy'
}): string {
  const {
    label,
    orderNo,
    storeCode,
    orderTypeLabel,
    tablePart,
    dateStr,
    itemsHtml,
    memoHtml,
    escapeHtml,
    design,
    printColorAdjust = 'exact',
  } = params
  const paperCss = getKitchenSlipPaperCss(design, printColorAdjust)
  const classCss = kitchenSlipClassCss(design)
  const orderNoPrint = formatPosOrderNoForPrint(orderNo)
  const c = (tag: string) => '\u003c/' + tag + '>'
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>' +
    escapeHtml(label) +
    '</title><style>' +
    paperCss +
    classCss +
    '</style>' +
    c('head') +
    '<body><div class="k-header">' +
    escapeHtml(label) +
    c('div') +
    '<div class="k-row"><strong>' +
    escapeHtml(orderNoPrint) +
    c('strong') +
    c('div') +
    '<div class="k-row">' +
    escapeHtml(storeCode + ' · ' + orderTypeLabel + tablePart) +
    c('div') +
    '<div class="k-row">' +
    dateStr +
    c('div') +
    '<hr style="margin:10px 0;" />' +
    itemsHtml +
    memoHtml +
    c('body') +
    c('html')
  )
}

/** 품목·메모까지 한 번에 조립 (대부분 호출부에서 사용) */
export function buildKitchenSlipDocumentHtml(params: {
  label: string
  orderNo: string
  storeCode: string
  orderTypeLabel: string
  tablePart: string
  dateStr: string
  items: { name: string; qty: number; note?: string | null | undefined }[]
  memoLine: string | null | undefined
  escapeHtml: (s: string) => string
  design: KitchenSlipDesignResolved
  printColorAdjust?: 'exact' | 'economy'
  prependItemsHtml?: string
}): string {
  const {
    label,
    orderNo,
    storeCode,
    orderTypeLabel,
    tablePart,
    dateStr,
    items,
    memoLine,
    escapeHtml,
    design,
    printColorAdjust,
    prependItemsHtml,
  } = params
  const itemsHtml = buildKitchenSlipItemsHtml(items, escapeHtml, design, prependItemsHtml ?? '')
  const memoHtml = buildKitchenSlipMemoBlockHtml(String(memoLine ?? ''), escapeHtml, design)
  return buildKitchenSlipHtml({
    label,
    orderNo,
    storeCode,
    orderTypeLabel,
    tablePart,
    dateStr,
    itemsHtml,
    memoHtml,
    escapeHtml,
    design,
    printColorAdjust,
  })
}
