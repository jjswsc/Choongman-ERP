/**
 * 주방 주문서 인쇄용 HTML (POS·관리자 공통)
 */

import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { parseBanbanFlavorsFromName, expandBanbanComposeLineForPrint } from '@/lib/pos-banban-utils'
import { POS_PRINT_NOTO_SANS_THAI_FONT_LINKS } from '@/lib/pos-print-font-links'
import { formatGrabOptionFragmentForPrint } from '@/lib/grab-pos-order-enrich'
import {
  isLikelyPosMenuSkuCode,
  normalizePosPrintOptionLabel,
  splitPosPrintItemLine,
  stripLeadingPrintCodeBrackets,
} from '@/lib/pos-print-item-line'
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
  note = note.replace(/\bitem\s*note\b\s*:/gi, 'Item:')
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

function isLikelyStandaloneSizeLabel(raw: string): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return false
  if (/^(?:size|ไซส์)\s*(?:xxl|xl|l|m|s)\b/i.test(s)) return true
  return /^(?:xxl|xl|l|m|s)\b/i.test(s)
}

function splitPrintOptionTokens(raw: string): string[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  const isSizePrefixed = (value: string) =>
    /^(?:size|ไซส์)?\s*(?:xxl|xl|l|m|s)\s*[-–—]\s*\S+/i.test(String(value ?? '').trim())
  const primaryChunks = text
    .split(/\r?\n|·|,/)
    .map((x) => x.trim())
    .filter(Boolean)
  for (const chunk of primaryChunks) {
    const parts = isSizePrefixed(chunk)
      ? [chunk]
      : chunk
          .split(/\s+-\s+/)
          .map((x) => x.trim())
          .filter(Boolean)
    const tokens = parts.length > 1 ? parts : [chunk]
    for (const token of tokens) {
      const normalized = normalizePosPrintOptionLabel(token).trim()
      if (!normalized) continue
      const key = normalized.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(normalized)
    }
  }
  return out
}

function parseMenuEchoFromNote(raw: string): { menuName: string; optionLabel: string } | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const chunks = text
    .split(/[\r\n·]/)
    .map((x) => x.trim())
    .filter(Boolean)
  for (const chunk of chunks) {
    const normalized = chunk.replace(/^-+\s*/, '').trim()
    const m = /^(.+?)\s*\(([^)]+)\)\s*(?:x\s*[\d.]+)?\s*$/iu.exec(normalized)
    if (!m?.[1] || !m?.[2]) continue
    const menuName = stripLeadingPrintCodeBrackets(String(m[1] ?? '').trim())
    const optionLabel = normalizePosPrintOptionLabel(String(m[2] ?? '').trim())
    if (!menuName || isLikelyPosMenuSkuCode(menuName) || isLikelyStandaloneSizeLabel(menuName)) continue
    return { menuName, optionLabel }
  }
  return null
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

/** classifyKitchenOptionToken 결과 ↔ 관리자 `kitchenSlipOptionGroupPrint` 키 (sidedish 등) */
const KITCHEN_OPTION_POLICY_CLASS_ALIASES: Record<string, string[]> = {
  side: ['side', 'sidedish', 'side_dish'],
  part: ['part', 'ส่วน'],
  size: ['size', 'type'],
  flavor: ['flavor', 'option'],
  other: ['other', 'option'],
  takeaway: ['takeaway'],
  option: ['option'],
}

function isKitchenOptionGroupPolicyWideOpen(policy: KitchenSlipDesignResolved['optionGroupPrint']): boolean {
  const normalizedPolicy = normalizeKitchenSlipOptionGroupPrintMap(policy)
  const policyEntries = Object.entries(normalizedPolicy)
  return policyEntries.length === 0 || policyEntries.every(([, enabled]) => enabled !== false)
}

function isKitchenOptionGroupEnabledForClass(
  classification: string,
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): boolean {
  if (isKitchenOptionGroupPolicyWideOpen(policy)) return true
  const normalizedPolicy = normalizeKitchenSlipOptionGroupPrintMap(policy)
  const classKey = normalizeKitchenOptionGroupKey(classification)
  const aliases = [
    ...(KITCHEN_OPTION_POLICY_CLASS_ALIASES[classKey] || []),
    classKey,
  ]
  const seen = new Set<string>()
  const uniqueAliases: string[] = []
  for (const raw of aliases) {
    const key = normalizeKitchenOptionGroupKey(raw)
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniqueAliases.push(key)
  }
  const defined = uniqueAliases.filter((key) => key in normalizedPolicy)
  if (defined.length === 0) return true
  return defined.some((key) => normalizedPolicy[key] !== false)
}

function isKitchenOptionTokenAllowed(
  token: string,
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): boolean {
  const trimmed = String(token ?? '').trim()
  if (!trimmed) return false
  const labelMatch = /^([^:]{1,40})\s*:\s*(.+)$/.exec(trimmed)
  if (labelMatch) {
    const key = normalizeKitchenOptionGroupKey(labelMatch[1])
    if (!key) return true
    if (isKitchenOptionGroupPolicyWideOpen(policy)) return true
    const normalizedPolicy = normalizeKitchenSlipOptionGroupPrintMap(policy)
    if (!(key in normalizedPolicy)) return true
    return normalizedPolicy[key] !== false
  }
  if (/^\d+$/.test(trimmed)) return false
  return isKitchenOptionGroupEnabledForClass(classifyKitchenOptionToken(trimmed), policy)
}

function filterKitchenOptionTokenList(
  tokens: string[],
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): string[] {
  if (isKitchenOptionGroupPolicyWideOpen(policy)) return tokens
  return tokens.filter((token) => isKitchenOptionTokenAllowed(token, policy))
}

/**
 * 세트 구성품(`promoComposeLines`)은 주방 라우팅(kitchen_printer)으로 이미 걸러진 메뉴다.
 * 메뉴명에 kimchi 등이 들어가도 옵션 칩(side)으로 통째로 숨기지 않는다.
 * 단일 단어·사이즈 라벨 등 옵션만 있는 줄은 기존처럼 옵션 그룹 정책을 따른다.
 */
function isLikelyPromoComposeMenuLineName(core: string): boolean {
  const s = String(core ?? '').trim()
  if (!s) return false
  if (isLikelyPosMenuSkuCode(s) || isLikelyStandaloneSizeLabel(s)) return false
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return true
  if (
    /\b(soup|rice|chicken|set|combo|fried|bbq|bulgogi|dosirak|noodle|salad|drink|water)\b/i.test(s)
  ) {
    return true
  }
  return false
}

function filterKitchenPromoComposeLine(
  line: string,
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): string[] {
  const trimmed = String(line ?? '').trim()
  if (!trimmed) return []
  if (isKitchenOptionGroupPolicyWideOpen(policy)) return [trimmed]

  const qtyMatch = /\s+x\s*([\d.]+)\s*$/iu.exec(trimmed)
  const qtySuffix = qtyMatch ? ` x${qtyMatch[1]}` : ''
  const core = trimmed.replace(/\s+x\s*[\d.]+\s*$/iu, '').trim()
  const paren = /^(.+?)\s*\(([^)]+)\)\s*$/iu.exec(core)
  if (paren) {
    const menu = String(paren[1] ?? '').trim()
    const optPart = String(paren[2] ?? '').trim()
    const tokens = splitPrintOptionTokens(optPart)
    const kept = filterKitchenOptionTokenList(tokens, policy)
    if (kept.length === 0) {
      return isLikelyPromoComposeMenuLineName(menu) ? [`${menu}${qtySuffix}`] : []
    }
    if (kept.length === tokens.length) return [trimmed]
    if (kept.length === 1) return [`${menu} (${kept[0]})${qtySuffix}`]
    return kept.map((part) => `${part}${qtySuffix}`)
  }
  if (isLikelyPromoComposeMenuLineName(core)) return [trimmed]
  if (!isKitchenOptionTokenAllowed(core, policy)) return []
  return [trimmed]
}

function isKitchenPromoComposeMenuEcho(line: string, baseDisplayName: string): boolean {
  const normalize = (v: string) =>
    String(v ?? '')
      .replace(/\s*x\s*[\d.]+\s*$/iu, '')
      .replace(/[\s\-_:()]+/g, '')
      .toLowerCase()
      .trim()
  const lineKey = normalize(line)
  const baseKey = normalize(baseDisplayName)
  if (!lineKey || !baseKey) return false
  return lineKey === baseKey
}

function filterKitchenLineNoteByGroupPolicy(
  rawNote: string,
  policy: KitchenSlipDesignResolved['optionGroupPrint']
): string {
  const note = String(rawNote || '').trim()
  if (!note) return ''
  if (isKitchenOptionGroupPolicyWideOpen(policy)) return note

  const chunks = note.split('·').map((x) => x.trim()).filter(Boolean)
  const out: string[] = []
  for (const chunk of chunks) {
    const labelMatch = /^([^:]{1,40})\s*:\s*(.+)$/.exec(chunk)
    if (labelMatch) {
      if (isKitchenOptionTokenAllowed(chunk, policy)) out.push(chunk)
      continue
    }
    const tokens = chunk.split(',').map((x) => x.trim()).filter(Boolean)
    if (tokens.length === 0) continue
    const kept = filterKitchenOptionTokenList(tokens, policy)
    if (kept.length > 0) out.push(kept.join(', '))
  }
  return out.join(' · ')
}

/**
 * 반반 메뉴명에서 두 가지 맛 추출.
 * `withKitchenCodeName`이 `[CODE] Banban Chicken (Flavor1 / Flavor2)` 형태를 만들 수 있으므로
 * 앞쪽 `[CODE] ` 접두는 제거 후 시도한다.
 */
/** 메뉴 SKU만 이름에 있을 때(Grab 등) note 본문으로 표시명 복원 */
export function resolveKitchenSlipRowMainDisplay(input: {
  name: string
  note?: string | null | undefined
}): { mainName: string; optionLine: string } {
  const split = splitPosPrintItemLine(input.name)
  let mainName = stripLeadingPrintCodeBrackets(split.mainName || String(input.name ?? ''))
  let optionLine = split.optionLine
  const noteRaw = String(input.note ?? '').trim().replace(/^-\s*/, '').trim()
  if (isLikelyPosMenuSkuCode(mainName) && noteRaw) {
    const noteNormalized = noteRaw.replace(/^(?:item\s*note|line\s*note|note|item)\s*:\s*/i, '').trim()
    const paren =
      /^(.+?)\s*\(([^)]+)\)\s*(?:x\s*[\d.]+)?\s*$/iu.exec(noteNormalized) ||
      /(?:^|[\r\n·])\s*-?\s*(.+?)\s*\(([^)]+)\)\s*(?:x\s*[\d.]+)?(?:\s*$|[\r\n·])/iu.exec(noteNormalized)
    if (paren) {
      mainName = stripLeadingPrintCodeBrackets(paren[1].trim())
      if (!optionLine) optionLine = normalizePosPrintOptionLabel(paren[2].trim())
    } else {
      const bare = noteNormalized.replace(/\s*x\s*[\d.]+\s*$/iu, '').trim()
      if (bare && !isLikelyPosMenuSkuCode(bare)) mainName = stripLeadingPrintCodeBrackets(bare)
    }
  }
  if (isLikelyStandaloneSizeLabel(mainName) && noteRaw) {
    const leadChunk = noteRaw.split(/[·\r\n]/)[0]?.trim() || noteRaw
    const noteMenuLike =
      /^(.+?)\s*\(([^)]+)\)\s*(?:x\s*[\d.]+)?\s*$/iu.exec(leadChunk) ||
      /^(.+?)\s*\(([^)]+)\)\s*(?:x\s*[\d.]+)?\s*$/iu.exec(noteRaw)
    if (noteMenuLike) {
      const recoveredMain = stripLeadingPrintCodeBrackets(noteMenuLike[1].trim())
      if (recoveredMain && !isLikelyPosMenuSkuCode(recoveredMain) && !isLikelyStandaloneSizeLabel(recoveredMain)) {
        mainName = recoveredMain
        if (!optionLine) optionLine = normalizePosPrintOptionLabel(noteMenuLike[2].trim())
      }
    }
  }
  return { mainName: mainName || stripLeadingPrintCodeBrackets(String(input.name ?? '')), optionLine }
}

function parseKitchenSlipBanbanFromName(rawName: string): {
  baseName: string
  flavor1: string
  flavor2: string
} | null {
  const trimmed = String(rawName ?? '').trim()
  if (!trimmed) return null
  const rest = stripLeadingPrintCodeBrackets(trimmed)
  const parsed = parseBanbanFlavorsFromName(rest)
  if (!parsed) return null
  return {
    baseName: parsed.baseName,
    flavor1: parsed.flavor1,
    flavor2: parsed.flavor2,
  }
}

/** 주방전표 한 줄: 수량 × 메뉴명 + (선택) 줄 메모. `cancelled`면 수량 앞에 `-`로 취소 표기 */
export function formatKitchenSlipItemRowHtml(
  it: {
    name: string
    qty: number
    note?: string | null | undefined
    cancelled?: boolean
    /** 홀 주문서와 동일한 세트 구성품 (`- 메뉴 x1` 줄) */
    promoComposeLines?: string[]
  },
  escapeHtml: (s: string) => string,
  close: (tag: string) => string,
  opts?: {
    showLineNotes?: boolean
    optionGroupPrint?: KitchenSlipDesignResolved['optionGroupPrint']
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): string {
  const showLineNotes = opts?.showLineNotes !== false
  const cancelled = Boolean(it.cancelled)
  const simplify = (text: string) => text.replace(/[\s\-_:()]+/g, '').toLowerCase()
  const rowDisplay = resolveKitchenSlipRowMainDisplay({ name: String(it.name ?? ''), note: it.note })
  const rawNormalizedNote = showLineNotes
    ? normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
    : ''
  const groupedFilteredNote = filterKitchenLineNoteByGroupPolicy(
    rawNormalizedNote,
    opts?.optionGroupPrint ?? {}
  )
  let note = showLineNotes ? localizeKitchenSlipLineNote(groupedFilteredNote) : ''
  const banban =
    parseKitchenSlipBanbanFromName(stripLeadingPrintCodeBrackets(String(it.name ?? ''))) ||
    (rowDisplay.optionLine
      ? parseKitchenSlipBanbanFromName(`${rowDisplay.mainName} (${rowDisplay.optionLine})`)
      : null)
  let baseDisplayName = banban ? banban.baseName : rowDisplay.mainName || it.name
  const optionLine = banban
    ? ''
    : localizeKitchenSlipLineNote(
        formatGrabOptionFragmentForPrint(
          rowDisplay.optionLine || '',
          opts?.optionNameByCode
        )
      )
  const optionGroupPrint = opts?.optionGroupPrint ?? {}
  let optionLines = filterKitchenOptionTokenList(
    splitPrintOptionTokens(optionLine).map((x) => localizeKitchenSlipLineNote(x)),
    optionGroupPrint
  )
  if (!banban && isLikelyPosMenuSkuCode(stripLeadingPrintCodeBrackets(baseDisplayName)) && note) {
    const parsed = parseMenuEchoFromNote(note)
    if (parsed) {
      baseDisplayName = parsed.menuName
      if (optionLines.length === 0) {
        optionLines = filterKitchenOptionTokenList(
          splitPrintOptionTokens(parsed.optionLabel).map((x) => localizeKitchenSlipLineNote(x)),
          optionGroupPrint
        )
      }
    }
  }
  let noteLines = filterKitchenOptionTokenList(
    splitPrintOptionTokens(note).map((x) => localizeKitchenSlipLineNote(x)),
    optionGroupPrint
  )
  if (noteLines.length === 0 && note) noteLines = [note]
  noteLines = noteLines.filter((line) => {
    const compact = simplify(line)
    if (!compact) return false
    const mainCompact = simplify(baseDisplayName)
    if (!mainCompact || !compact.includes(mainCompact)) return true
    if (!optionLines.length) return false
    return !optionLines.every((opt) => compact.includes(simplify(opt)))
  })
  note = noteLines.join(' · ')
  const isDuplicatedMenuEchoNote = (() => {
    if (!note) return false
    const compact = String(note ?? '')
      .replace(/\s*x\s*[\d.]+\s*$/iu, '')
      .trim()
    if (!compact) return false
    const compactBase = simplify(baseDisplayName)
    if (!compactBase || !simplify(compact).includes(compactBase)) return false
    if (!optionLines.length) return true
    return optionLines.every((line) => simplify(compact).includes(simplify(line)))
  })()
  if (isDuplicatedMenuEchoNote) note = ''
  if (isDuplicatedMenuEchoNote) noteLines = []
  if (note && isLikelyPosMenuSkuCode(splitPosPrintItemLine(String(it.name ?? '')).mainName)) {
    const noteMain = resolveKitchenSlipRowMainDisplay({ name: '', note })
    if (noteMain.mainName && simplify(note).includes(simplify(noteMain.mainName))) note = ''
  }
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
  const optionDupWithNote =
    optionLines.length > 0 &&
    noteLines.length > 0 &&
    optionLines.every((line) => noteLines.some((n) => simplify(n) === simplify(line)))
  const optionHtml =
    optionLines.length > 0 && !optionDupWithNote
      ? '<div class="k-line-note">' + optionLines.map((line) => '- ' + escapeHtml(line)).join('<br/>') + close('div')
      : ''
  const banbanHtml = banban
    ? '<div class="k-line-note">- ' +
      escapeHtml(banban.flavor1) +
      '<br/>- ' +
      escapeHtml(banban.flavor2) +
      close('div')
    : ''
  const promoLines = (() => {
    const raw = (Array.isArray(it.promoComposeLines) ? it.promoComposeLines : [])
      .filter(Boolean)
      .flatMap((line) => {
        const expanded = expandBanbanComposeLineForPrint(String(line))
        const candidates = expanded ?? [String(line)]
        return candidates.flatMap((part) => filterKitchenPromoComposeLine(part, optionGroupPrint))
      })
    const deduped: string[] = []
    const seen = new Set<string>()
    for (const line of raw) {
      if (isKitchenPromoComposeMenuEcho(line, baseDisplayName)) continue
      const key = line.replace(/\s+/g, ' ').trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      deduped.push(line)
    }
    return deduped
  })()
  const promoHtml =
    promoLines.length > 0
      ? '<div class="k-line-note">' +
        promoLines.map((line) => '- ' + escapeHtml(line)).join('<br/>') +
        close('div')
      : ''
  if (noteLines.length === 0) return rowOpen + main + optionHtml + banbanHtml + promoHtml + close('div')
  return (
    rowOpen +
    main +
    optionHtml +
    banbanHtml +
    promoHtml +
    '<div class="k-line-note">' +
    noteLines.map((line) => '- ' + escapeHtml(line)).join('<br/>') +
    close('div') +
    close('div')
  )
}

export function buildKitchenSlipItemsHtml(
  items: {
    name: string
    qty: number
    note?: string | null | undefined
    cancelled?: boolean
    promoComposeLines?: string[]
  }[],
  escapeHtml: (s: string) => string,
  design: KitchenSlipDesignResolved,
  prependHtml = '',
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const c = (tag: string) => '\u003c/' + tag + '>'
  return (
    prependHtml +
    items
      .map((it) =>
        formatKitchenSlipItemRowHtml(it, escapeHtml, c, {
          showLineNotes: design.showLineNotes,
          optionGroupPrint: design.optionGroupPrint,
          optionNameByCode,
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
  items: {
    name: string
    qty: number
    note?: string | null | undefined
    cancelled?: boolean
    promoComposeLines?: string[]
  }[]
  memoLine: string | null | undefined
  escapeHtml: (s: string) => string
  design: KitchenSlipDesignResolved
  printTrackingId?: string
  printColorAdjust?: 'exact' | 'economy'
  prependItemsHtml?: string
  guestCount?: number
  guestCountLabel?: string
  optionNameByCode?: Map<string, string> | Record<string, string>
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
    optionNameByCode,
  } = params
  const itemsHtml = buildKitchenSlipItemsHtml(
    items,
    escapeHtml,
    design,
    prependItemsHtml ?? '',
    optionNameByCode
  )
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
