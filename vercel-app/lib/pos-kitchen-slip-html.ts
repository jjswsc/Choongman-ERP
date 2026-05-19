/**
 * 주방 주문서 인쇄용 HTML (POS·관리자 공통)
 */

import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { parseBanbanFlavorsFromName } from '@/lib/pos-banban-utils'
import { POS_PRINT_NOTO_SANS_THAI_FONT_LINKS } from '@/lib/pos-print-font-links'
import { splitPosPrintItemLine } from '@/lib/pos-print-item-line'
import { buildKitchenPrintTrackingId } from '@/lib/pos-kitchen-print-tracking'

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
  optionGroupPrint: Record<string, boolean>
}

/** getPosPrinterSettings 응답 등에서 주방 슬립 디자인 정규화 */
export function resolveKitchenSlipDesign(s?: {
  kitchenSlipFontScale?: string
  kitchenSlipShowLineNotes?: boolean
  kitchenSlipShowOrderMemo?: boolean
  kitchenSlipOptionGroupPrint?: Record<string, boolean>
}): KitchenSlipDesignResolved {
  const raw = String(s?.kitchenSlipFontScale || 'md').toLowerCase()
  const fontScale: KitchenSlipFontScale = raw === 'sm' ? 'sm' : raw === 'lg' ? 'lg' : 'md'
  return {
    fontScale,
    showLineNotes: s?.kitchenSlipShowLineNotes !== false,
    showOrderMemo: s?.kitchenSlipShowOrderMemo !== false,
    optionGroupPrint: normalizeKitchenSlipOptionGroupPrintMap(s?.kitchenSlipOptionGroupPrint),
  }
}

function typographyForScale(scale: KitchenSlipFontScale) {
  switch (scale) {
    case 'sm':
      return { header: 18, row: 13, lineNote: 11, memo: 13, body: 13 }
    case 'lg':
      return { header: 24, row: 19, lineNote: 14, memo: 16, body: 19 }
    default:
      /** md: 80mm·Electron 인쇄에서 한 줄이 과하게 잘리지 않도록 약간 축소 */
      return { header: 20, row: 15, lineNote: 12, memo: 14, body: 15 }
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
    font-family: "Noto Sans Thai", "Leelawadee UI", Tahoma, "Sukhumvit Set", Inter, Pretendard, "Noto Sans KR", "Malgun Gothic", Arial, sans-serif;
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
.k-header { text-align: center; font-size: ${tp.header}px; font-weight: 800; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; word-break: normal; overflow-wrap: break-word; line-height: 1.35; letter-spacing: 0.02em; }
.k-order-head-row { text-align: center; margin: 4px 0 8px 0; font-size: ${tp.row}px; line-height: 1.35; }
.k-order-head-row strong { font-weight: 800; }
.k-order-chip-inline { display: inline-block; margin-left: 6px; padding: 2px 8px; border: 1.3px solid #000; border-radius: 999px; font-size: ${Math.max(11, tp.row - 3)}px; font-weight: 800; letter-spacing: 0.03em; line-height: 1.15; vertical-align: middle; }
.k-row { margin: 7px 0; font-size: ${tp.row}px; max-width: 100%; white-space: normal; word-break: normal; overflow-wrap: break-word; line-height: 1.45; letter-spacing: -0.01em; }
.k-line-note { font-size: ${tp.lineNote}px; color: #111; margin-top: 4px; padding-left: 3px; white-space: normal; word-break: normal; overflow-wrap: break-word; line-height: 1.36; letter-spacing: -0.01em; }
.k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: ${tp.memo}px; }
.k-row-main { display: grid; grid-template-columns: 2.3em minmax(0, 1fr); align-items: flex-start; gap: 3px; width: 100%; }
.k-row-qty { min-width: 0; font-variant-numeric: tabular-nums; font-weight: 700; }
.k-row-name { flex: 1 1 auto; min-width: 0; white-space: normal; word-break: normal; overflow-wrap: break-word; }
.k-row-cancelled .k-row-qty { letter-spacing: 0.02em; }
`
}

const KITCHEN_SLIP_CHICKEN_PART_TRANSLATIONS: ReadonlyArray<[RegExp, string]> = [
  [/(ไม่มี\s*กระดูก|ไม่มีกระดูก|ไร้กระดูก)/g, 'Boneless'],
  [/(โดบา|ปีกบน)/g, 'Drumette'],
  [/(joint\s*wing|จอยท์วิง|ปีกกลาง|ปีกล่าง|ปีกปลาย|ปีก)/gi, 'Joint wing'],
]

export function localizeKitchenSlipLineNote(rawNote: string): string {
  let note = String(rawNote ?? '')
  for (const [pattern, english] of KITCHEN_SLIP_CHICKEN_PART_TRANSLATIONS) {
    note = note.replace(pattern, english)
  }
  return note
}

function normalizeKitchenOptionGroupKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function normalizeKitchenSlipOptionGroupPrintMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeKitchenOptionGroupKey(k)
    if (!key) continue
    out[key] = v !== false
  }
  return out
}

function classifyKitchenOptionToken(token: string): string {
  const s = String(token || '').trim()
  const low = s.toLowerCase()
  if (!s) return 'other'
  const labelMatch = /^([^:]{1,40})\s*:\s*(.+)$/.exec(s)
  if (labelMatch) {
    const key = normalizeKitchenOptionGroupKey(labelMatch[1])
    if (key) return key
  }
  if (/^(xxl|xl|l|m|s)\b/i.test(s) || /\b(size|ไซส์)\b/i.test(s)) return 'size'
  if (/(boneless|drumette|joint wing|wing|leg|part|순살|뼈|โดบา|ปีก)/i.test(s)) return 'part'
  if (/(kimchi|radish|pickle|side|sidedish|side dish|피클|깍두기|หัวไชเท้า)/i.test(s)) return 'side'
  if (/(spicy|soy|garlic|yangnyeom|curry|snow onion|bar\.?b\.?q|맛|소스)/i.test(low)) return 'flavor'
  return 'other'
}

function filterKitchenLineNoteByGroupPolicy(
  rawNote: string,
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): string {
  const note = String(rawNote || '').trim()
  if (!note) return ''
  const normalizedPolicy = normalizeKitchenSlipOptionGroupPrintMap(policy)
  const policyEntries = Object.entries(normalizedPolicy)
  if (policyEntries.length === 0 || policyEntries.every(([, enabled]) => enabled !== false)) return note

  const isAllowed = (groupKey: string) => {
    const key = normalizeKitchenOptionGroupKey(groupKey)
    if (!key) return true
    if (!(key in normalizedPolicy)) return true
    return normalizedPolicy[key] !== false
  }

  const chunks = note.split('·').map((x) => x.trim()).filter(Boolean)
  const out: string[] = []
  for (const chunk of chunks) {
    const labelMatch = /^([^:]{1,40})\s*:\s*(.+)$/.exec(chunk)
    if (labelMatch) {
      const key = normalizeKitchenOptionGroupKey(labelMatch[1])
      if (isAllowed(key)) out.push(chunk)
      continue
    }
    const tokens = chunk.split(',').map((x) => x.trim()).filter(Boolean)
    if (tokens.length === 0) continue
    if (tokens.length === 1) {
      const g = classifyKitchenOptionToken(tokens[0])
      if (isAllowed(g)) out.push(tokens[0])
      continue
    }
    const kept = tokens.filter((token) => {
      if (/^\d+$/.test(token)) return false
      const g = classifyKitchenOptionToken(token)
      return isAllowed(g)
    })
    if (kept.length > 0) out.push(kept.join(', '))
  }
  return out.join(' · ')
}

/**
 * 반반 메뉴명에서 두 가지 맛 추출.
 * `withKitchenCodeName`이 `[CODE] Banban Chicken (Flavor1 / Flavor2)` 형태를 만들 수 있으므로
 * 앞쪽 `[CODE] ` 접두는 제거 후 시도한다.
 */
function parseKitchenSlipBanbanFromName(rawName: string): {
  baseName: string
  flavor1: string
  flavor2: string
} | null {
  const trimmed = String(rawName ?? '').trim()
  if (!trimmed) return null
  const codeMatch = trimmed.match(/^(\[[^\]]+\]\s*)(.+)$/u)
  const codePrefix = codeMatch ? codeMatch[1] : ''
  const rest = codeMatch ? codeMatch[2] : trimmed
  const parsed = parseBanbanFlavorsFromName(rest)
  if (!parsed) return null
  return {
    baseName: `${codePrefix}${parsed.baseName}`.trim(),
    flavor1: parsed.flavor1,
    flavor2: parsed.flavor2,
  }
}

/** 주방전표 한 줄: 수량 × 메뉴명 + (선택) 줄 메모. `cancelled`면 수량 앞에 `-`로 취소 표기 */
export function formatKitchenSlipItemRowHtml(
  it: { name: string; qty: number; note?: string | null | undefined; cancelled?: boolean },
  escapeHtml: (s: string) => string,
  close: (tag: string) => string,
  opts?: {
    showLineNotes?: boolean
    optionGroupPrint?: KitchenSlipDesignResolved['optionGroupPrint']
  }
): string {
  const showLineNotes = opts?.showLineNotes !== false
  const cancelled = Boolean(it.cancelled)
  const nameSplit = splitPosPrintItemLine(String(it.name ?? ''))
  const rawNormalizedNote = showLineNotes
    ? normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
    : ''
  const groupedFilteredNote = filterKitchenLineNoteByGroupPolicy(
    rawNormalizedNote,
    opts?.optionGroupPrint ?? {}
  )
  const note = showLineNotes ? localizeKitchenSlipLineNote(groupedFilteredNote) : ''
  const banban = parseKitchenSlipBanbanFromName(it.name)
  const baseDisplayName = banban ? banban.baseName : nameSplit.mainName || it.name
  const optionLine = banban ? '' : localizeKitchenSlipLineNote(nameSplit.optionLine)
  const rowOpen = cancelled ? '<div class="k-row k-row-cancelled">' : '<div class="k-row">'
  const main =
    '<div class="k-row-main">' +
    '<span class="k-row-qty">' +
    (cancelled ? '- ' : '') +
    Number(it.qty) +
    ' ×' +
    close('span') +
    '<span class="k-row-name">' +
    escapeHtml(baseDisplayName) +
    close('span') +
    close('div')
  const simplify = (text: string) => text.replace(/[\s\-_:()]+/g, '').toLowerCase()
  const optionDupWithNote = optionLine && note && simplify(optionLine) === simplify(note)
  const optionHtml =
    optionLine && !optionDupWithNote
      ? '<div class="k-line-note">- ' + escapeHtml(optionLine) + close('div')
      : ''
  const banbanHtml = banban
    ? '<div class="k-line-note">- ' +
      escapeHtml(banban.flavor1) +
      '<br/>- ' +
      escapeHtml(banban.flavor2) +
      close('div')
    : ''
  if (!note) return rowOpen + main + optionHtml + banbanHtml + close('div')
  return (
    rowOpen +
    main +
    optionHtml +
    banbanHtml +
    '<div class="k-line-note">' +
    escapeHtml(note) +
    close('div') +
    close('div')
  )
}

export function buildKitchenSlipItemsHtml(
  items: { name: string; qty: number; note?: string | null | undefined; cancelled?: boolean }[],
  escapeHtml: (s: string) => string,
  design: KitchenSlipDesignResolved,
  prependHtml = ''
): string {
  const c = (tag: string) => '\u003c/' + tag + '>'
  return (
    prependHtml +
    items
      .map((it) =>
        formatKitchenSlipItemRowHtml(it, escapeHtml, c, {
          showLineNotes: design.showLineNotes,
          optionGroupPrint: design.optionGroupPrint,
        })
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
  printTrackingId?: string
  printColorAdjust?: 'exact' | 'economy'
  /** 홀 인원 등. 1 이상일 때만 표시 */
  guestCount?: number
  /** `guestCount` 표시용 라벨(번역). 없으면 `Guests` */
  guestCountLabel?: string
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
    printTrackingId,
    printColorAdjust = 'exact',
    guestCount,
    guestCountLabel,
  } = params
  const paperCss = getKitchenSlipPaperCss(design, printColorAdjust)
  const classCss = kitchenSlipClassCss(design)
  const orderNoPrint = formatPosOrderNoForPrint(orderNo)
  const traceId =
    String(printTrackingId || '').trim() ||
    buildKitchenPrintTrackingId({
      orderRef: orderNoPrint || orderNo || storeCode,
      label,
    })
  const c = (tag: string) => '\u003c/' + tag + '>'
  const guestN = Math.max(0, Math.min(99, Math.trunc(Number(guestCount ?? 0) || 0)))
  const guestLabel = String(guestCountLabel || 'Guests').trim() || 'Guests'
  const guestRowHtml =
    guestN > 0
      ? '<div class="k-row">' +
        escapeHtml(guestLabel) +
        ': <strong>' +
        escapeHtml(String(guestN)) +
        '</strong>' +
        c('div')
      : ''
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    POS_PRINT_NOTO_SANS_THAI_FONT_LINKS +
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
    '<div class="k-row k-order-head-row"><strong>' +
    escapeHtml(orderNoPrint) +
    '</strong><span class="k-order-chip-inline">' +
    escapeHtml(orderTypeLabel) +
    '</span>' +
    c('div') +
    '<div class="k-row">' +
    escapeHtml(storeCode + tablePart) +
    c('div') +
    '<div class="k-row">' +
    dateStr +
    c('div') +
    guestRowHtml +
    '<div class="k-row" style="font-size:11px;color:#555;">' +
    'Trace ID: ' +
    escapeHtml(traceId) +
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
  items: { name: string; qty: number; note?: string | null | undefined; cancelled?: boolean }[]
  memoLine: string | null | undefined
  escapeHtml: (s: string) => string
  design: KitchenSlipDesignResolved
  printTrackingId?: string
  printColorAdjust?: 'exact' | 'economy'
  prependItemsHtml?: string
  guestCount?: number
  guestCountLabel?: string
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
    printTrackingId,
    printColorAdjust,
    prependItemsHtml,
    guestCount,
    guestCountLabel,
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
    printTrackingId,
    printColorAdjust,
    guestCount,
    guestCountLabel,
  })
}
