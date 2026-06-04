import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import {
  escapeHtmlReceiptEmphasizeChannelTokenAfterHash,
  formatPosReceiptOrderNoDisplay,
  pickPosChannelOrderNo,
} from '@/lib/pos-delivery-platform'
import { splitPosPrintItemLine } from '@/lib/pos-print-item-line'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import {
  collectGrabPrintOptionLines,
  enrichGrabPromoItemsForPrint,
  formatGrabOptionFragmentForPrint,
  formatGrabOrderLineNoteForPrint,
  formatGrabPromoComposeLinesForPrint,
  isGrabInboundPosOrder,
  resolveGrabPrintNoteRequest,
  resolveGrabItemPrintNote,
} from '@/lib/grab-pos-order-enrich'
import { lineNoteDuplicatesOptions, normalizePosLineNote } from '@/lib/pos-line-note'
import { buildPosTaxInvoiceThermalHtml, parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import {
  resolvePosReceiptLineDiscountAlloc,
  sumPosReceiptLineDiscountAmt,
  type PosReceiptLineDiscountItem,
} from '@/lib/pos-receipt-line-discount'
import { formatBahtNum } from '@/lib/utils'
import { RECEIPT_AMOUNT_COL_MM, RECEIPT_GRID_COL_GAP_PX } from '@/lib/pos-receipt-layout'
import { formatPosOrderNoDigitsOnly } from '@/lib/pos-order-no'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import {
  expandBanbanComposeLineForPrint,
  parseBanbanFlavorsFromName,
} from '@/lib/pos-banban-utils'
import {
  buildReceiptVoidBannerHtml,
  negatePosReceiptMoney,
  POS_RECEIPT_VOID_EXTRA_STYLES,
} from '@/lib/pos-void-receipt'

export type HallOrderItem = {
  id: string
  name: string
  price: number
  qty: number
  lineDiscountAmt?: number
  note?: string
  menuId?: string
  optionId?: string | null
  optionCode?: string | null
  optionCode1?: string | null
  optionCodes?: string[] | null
  /** 추가 주문(테이블 merge)으로 새로 들어온 줄 — 영수증 품목명 앞 `>` 표시 */
  isAddon?: boolean
  promoId?: string
  promoCode?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    optionName?: string | null
    quantity: number
  }[]
}
type HallOrderPromoItem = NonNullable<HallOrderItem['promoItems']>[number]

function splitReceiptOptionTokens(raw: string): string[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  const isSizePrefixed = (value: string) =>
    /^(?:size|ไซส์)?\s*(?:xxl|xl|l|m|s)\s*[-–—]\s*\S+/i.test(String(value ?? '').trim())
  const chunks = text
    .split(/\r?\n|·|,/)
    .map((x) => x.trim())
    .filter(Boolean)
  for (const chunk of chunks) {
    const parts = isSizePrefixed(chunk)
      ? [chunk]
      : chunk
          .split(/\s+-\s+/)
          .map((x) => x.trim())
          .filter(Boolean)
    const tokens = parts.length > 1 ? parts : [chunk]
    for (const token of tokens) {
      const t = String(token).trim()
      if (!t) continue
      const key = t.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

export type HallOrderPayload = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  items: HallOrderItem[]
  subtotal: number
  discountAmt: number
  couponDiscountAmt?: number
  discountReason?: string
  total: number
  deliveryFee?: number
  packagingFee?: number
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  receiptTaxableGrossForDisplay?: number
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  /** 홀(dine-in) 인원. 0·미입력이면 영수증에 표시하지 않음 */
  guestCount?: number
  /** 주문 전체 취소 void 영수증 */
  voidReceiptMode?: boolean
}

/** 홀 주문서·결제 영수증이 같은 할인 금액을 쓰도록 정규화(쿠폰·플랫폼 차액 포함). */
export function resolveHallOrderReceiptDiscountAmt(payload: {
  discountAmt?: number
  couponDiscountAmt?: number
  items: PosReceiptLineDiscountItem[]
  subtotal?: number
  deliveryFee?: number
  packagingFee?: number
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  total: number
}): number {
  const explicit = resolvePosSalesDiscountAmount(
    Math.max(0, Number(payload.discountAmt) || 0),
    Math.max(0, Number(payload.couponDiscountAmt) || 0)
  )
  const lineSum = sumPosReceiptLineDiscountAmt(payload.items || [])
  if (explicit > 0.0001) return explicit
  if (lineSum > 0.0001) return lineSum

  const itemsGross = (payload.items || []).reduce(
    (sum, it) => sum + Math.max(0, Number(it.price) || 0) * Math.max(0, Number(it.qty) || 0),
    0
  )
  const subtotal = Math.max(0, Number(payload.subtotal) || 0) || itemsGross
  const fees =
    Math.max(0, Number(payload.deliveryFee) || 0) + Math.max(0, Number(payload.packagingFee) || 0)
  const vat = Math.max(0, Number(payload.vatFeeAmt) || 0)
  const vatIncluded = String(payload.vatFeeMode ?? '') === 'included'
  const total = Math.max(0, Number(payload.total) || 0)
  const gross = Math.max(itemsGross, subtotal) + fees
  /** VAT 포함가는 품목·합계에 이미 반영됨 — vatFeeAmt를 더하면 부가세가 할인으로 오인됨 */
  const vatForBalance = vatIncluded ? 0 : vat
  const implied = Math.round((gross + vatForBalance - total) * 100) / 100
  if (implied <= 0.02 || total <= 0.005 || implied >= gross + vatForBalance + 0.01) return 0
  if (vat > 0.02 && Math.abs(implied - vat) < 0.03) return 0
  return implied
}

function resolveHallOrderDiscountLabel(
  t: (key: string) => string,
  discountReason?: string
): string {
  const base = t('posDiscount') || '할인'
  const reason = String(discountReason ?? '').trim()
  return reason ? `${base} ${reason}` : base
}

function parseReceiptSetChildLineName(name: string): { promoLabel: string; childName: string } | null {
  const trimmed = String(name ?? '').trim()
  const lastBracket = trimmed.lastIndexOf(']')
  if (lastBracket < 0 || lastBracket >= trimmed.length - 1) return null
  const childName = trimmed.slice(lastBracket + 1).trim()
  if (!childName) return null
  const prefix = trimmed.slice(0, lastBracket + 1)
  if (!prefix.includes('[')) return null
  const closingBrackets = (prefix.match(/\]/g) ?? []).length
  if (closingBrackets < 2 && !/^\[\[/u.test(trimmed)) return null
  const promoLabel = prefix
    .replace(/^\[+/, '')
    .replace(/\]+$/, '')
    .replace(/\]\s*\[/g, ' ')
    .replace(/[\[\]]/g, '')
    .trim()
  if (!promoLabel) return null
  return { promoLabel, childName }
}

function normalizeReceiptTextKey(v: string): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\[\]()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s\-_/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isReceiptPromoBundleCode(code: string): boolean {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) return false
  return /-S\d+$/i.test(c) || /^SET-\d+$/i.test(c)
}

function resolveReceiptChildPromoOptionName(
  child: HallOrderItem,
  opts?: {
    grabInbound?: boolean
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): string {
  const existing = String((child as { optionName?: unknown }).optionName ?? '').trim()
  if (existing) return existing

  const note = String(child.note ?? '').trim()
  if (note) {
    if (opts?.grabInbound) {
      const chips = collectGrabPrintOptionLines({
        note,
        optionNameByCode: opts.optionNameByCode,
      })
      if (chips.length) return chips.join(', ')
    }
    const parsed = formatGrabOrderLineNoteForPrint(note, opts?.optionNameByCode)
    if (parsed) return parsed
    const normalized = normalizePosLineNote(note, { keepOptionSummary: false })
    if (normalized) return normalized
  }

  const optionCode = String(
    child.optionCode ?? (child as { optionCode1?: string | null }).optionCode1 ?? ''
  ).trim()
  if (optionCode) {
    const fromCode = formatGrabOrderLineNoteForPrint(`optc:${optionCode}`, opts?.optionNameByCode)
    if (fromCode && !fromCode.split(',').every((x) => /^[A-Z0-9-]+$/i.test(x.trim()))) {
      return fromCode
    }
  }

  const split = splitPosPrintItemLine(String(child.name ?? ''))
  if (split.optionLine) {
    return formatGrabOptionFragmentForPrint(split.optionLine, opts?.optionNameByCode)
  }
  return ''
}

function buildReceiptChildPromoLine(
  child: HallOrderItem,
  opts?: {
    grabInbound?: boolean
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): HallOrderPromoItem {
  const childNameRaw = String(child.name ?? '').trim()
  const setParsed = parseReceiptSetChildLineName(childNameRaw)
  const split = splitPosPrintItemLine(childNameRaw)
  const childName = setParsed?.childName || split.mainName || childNameRaw
  const menuId = String(
    child.menuId ?? (child as { menuId1?: string | null }).menuId1 ?? ''
  ).trim()
  const optionCode = String(
    child.optionCode ?? (child as { optionCode1?: string | null }).optionCode1 ?? ''
  ).trim()
  const optionIdRaw = String((child as { optionId?: unknown }).optionId ?? '').trim()
  const optionId = optionIdRaw || null
  const optionName = resolveReceiptChildPromoOptionName(child, opts)
  return {
    menuId: menuId || '',
    optionId,
    ...(optionCode ? { optionCode } : {}),
    ...(optionName ? { optionName } : {}),
    menuName: childName,
    quantity: Math.max(1, Number(child.qty ?? 1) || 1),
  } as HallOrderPromoItem
}

function isReceiptPromoParentLine(item: HallOrderItem): boolean {
  return Array.isArray(item.promoItems) && item.promoItems.length > 0
}

/** promoItems 없이도 세트 헤더 줄(Shopee·Grab 플랫 라인)인지 */
function isReceiptPromoBundleHeaderLine(item: HallOrderItem): boolean {
  if (isReceiptPromoParentLine(item)) return true
  const name = String(item.name ?? '').trim()
  if (!name || parseReceiptSetChildLineName(name)) return false
  const hasPromoRef =
    String((item as { promoId?: unknown }).promoId ?? '').trim().length > 0 ||
    String((item as { promoCode?: unknown }).promoCode ?? '').trim().length > 0
  if (!hasPromoRef) return false
  return /\bset\b|\[[^\]]+\]/i.test(name) || (Number(item.price) || 0) > 0.0001
}

function pickReceiptSetParentIndex(indices: number[], out: HallOrderItem[]): number {
  return (
    indices.find((idx) => isReceiptPromoParentLine(out[idx])) ??
    indices.find((idx) => isReceiptPromoBundleHeaderLine(out[idx])) ??
    indices[0]
  )
}

function findPrecedingReceiptPromoParentIndex(
  orphanIdx: number,
  parentIndices: number[]
): number {
  let best = -1
  for (const parentIdx of parentIndices) {
    if (parentIdx <= orphanIdx && parentIdx > best) best = parentIdx
  }
  return best >= 0 ? best : parentIndices[0]
}

function attachReceiptOrphanPromoLine(
  out: HallOrderItem[],
  parentIdx: number,
  orphanIdx: number,
  hide: Set<number>,
  opts?: {
    grabInbound?: boolean
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): void {
  if (parentIdx < 0 || orphanIdx < 0 || parentIdx === orphanIdx || hide.has(orphanIdx)) return
  if (isReceiptPromoBundleHeaderLine(out[orphanIdx])) return
  const parent = out[parentIdx]
  const list = Array.isArray(parent.promoItems) ? [...parent.promoItems] : []
  list.push(buildReceiptChildPromoLine(out[orphanIdx], opts))
  out[parentIdx] = { ...parent, promoItems: list }
  hide.add(orphanIdx)
}

function mergeReceiptPromoGroupedLines(
  out: HallOrderItem[],
  groups: Map<string, number[]>,
  hide: Set<number>,
  opts?: {
    grabInbound?: boolean
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): void {
  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const parentIndices = indices.filter(
      (idx) => !hide.has(idx) && isReceiptPromoBundleHeaderLine(out[idx])
    )
    const orphanIndices = indices.filter(
      (idx) => !hide.has(idx) && !isReceiptPromoBundleHeaderLine(out[idx])
    )

    if (parentIndices.length > 1) {
      for (const orphanIdx of orphanIndices) {
        attachReceiptOrphanPromoLine(
          out,
          findPrecedingReceiptPromoParentIndex(orphanIdx, parentIndices),
          orphanIdx,
          hide,
          opts
        )
      }
      continue
    }

    if (parentIndices.length === 1) {
      const parentIdx = parentIndices[0]
      for (const orphanIdx of orphanIndices) {
        attachReceiptOrphanPromoLine(out, parentIdx, orphanIdx, hide, opts)
      }
      continue
    }

    const parentIdx = pickReceiptSetParentIndex(indices, out)
    for (const orphanIdx of orphanIndices) {
      attachReceiptOrphanPromoLine(out, parentIdx, orphanIdx, hide, opts)
    }
  }
}

/** Grab·주방 분할 `[세트] 구성` 줄을 부모 세트의 promoItems 로 합친다(캐셔·홀 주문서). */
export function mergeSetChildrenForReceipt(
  items: HallOrderItem[],
  opts?: {
    grabInbound?: boolean
    optionNameByCode?: Map<string, string> | Record<string, string>
  }
): HallOrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return items
  const out = items.map((it) => ({ ...it }))
  const childRows: { index: number; promoLabel: string; childName: string }[] = []
  for (let i = 0; i < out.length; i++) {
    const parsed = parseReceiptSetChildLineName(String(out[i].name ?? ''))
    if (!parsed) continue
    childRows.push({ index: i, ...parsed })
  }
  const hide = new Set<number>()

  if (childRows.length > 0) {
    const childIndexSet = new Set(childRows.map((x) => x.index))

    const findParentIndex = (promoLabel: string, childIndex: number) => {
      const key = normalizeReceiptTextKey(promoLabel)
      if (!key) return -1
      const candidates: { index: number; score: number }[] = []
      for (let i = 0; i < out.length; i++) {
        if (childIndexSet.has(i)) continue
        const nk = normalizeReceiptTextKey(String(out[i].name ?? ''))
        if (!nk) continue
        let s = 0
        if (nk === key) s = 100
        else if (nk.includes(key) || key.includes(nk)) s = 80
        if (s > 0) candidates.push({ index: i, score: s })
      }
      if (candidates.length === 0) return -1
      const maxScore = Math.max(...candidates.map((c) => c.score))
      const bestMatches = candidates.filter((c) => c.score === maxScore)
      const preceding = bestMatches.filter((c) => c.index <= childIndex)
      const pool = preceding.length > 0 ? preceding : bestMatches
      return pool.reduce((best, cur) => (cur.index > best.index ? cur : best)).index
    }

    for (const child of childRows) {
      const parentIdx = findParentIndex(child.promoLabel, child.index)
      if (parentIdx < 0 || parentIdx === child.index) continue
      attachReceiptOrphanPromoLine(out, parentIdx, child.index, hide, opts)
    }
  }

  const promoCodeGroups = new Map<string, number[]>()
  for (let i = 0; i < out.length; i++) {
    if (hide.has(i)) continue
    const code = String((out[i] as { promoCode?: unknown }).promoCode ?? '')
      .trim()
      .toUpperCase()
    if (!code || !isReceiptPromoBundleCode(code)) continue
    const list = promoCodeGroups.get(code) ?? []
    list.push(i)
    promoCodeGroups.set(code, list)
  }
  mergeReceiptPromoGroupedLines(out, promoCodeGroups, hide, opts)

  const promoIdGroups = new Map<string, number[]>()
  for (let i = 0; i < out.length; i++) {
    if (hide.has(i)) continue
    const pid = String((out[i] as { promoId?: unknown }).promoId ?? '').trim()
    if (!pid) continue
    const list = promoIdGroups.get(pid) ?? []
    list.push(i)
    promoIdGroups.set(pid, list)
  }
  mergeReceiptPromoGroupedLines(out, promoIdGroups, hide, opts)

  return out.filter((_, idx) => !hide.has(idx))
}

export function buildPosHallOrderReceiptDocumentHtml(params: {
  payload: HallOrderPayload
  t: (key: string) => string
  lang: string
  resolveOrderItemDisplayName?: (item: HallOrderItem) => string
  menuNameById?: (menuId: string) => string
  menuCodeByMenuId?: Record<string, string>
  optionNameByCode?: Map<string, string> | Record<string, string>
}): string {
  const { payload, t, lang, resolveOrderItemDisplayName, menuNameById, menuCodeByMenuId, optionNameByCode } =
    params
  const esc = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  const menuNameByCode = new Map<string, string>()
  if (typeof menuNameById === 'function' && menuCodeByMenuId) {
    for (const [menuId, rawCode] of Object.entries(menuCodeByMenuId)) {
      const code = String(rawCode ?? '').trim().toUpperCase()
      if (!code || menuNameByCode.has(code)) continue
      const name = String(menuNameById(menuId) ?? '').trim()
      if (name) menuNameByCode.set(code, name)
    }
  }
  const parsePromoMenuPlaceholderToken = (raw: string): string => {
    const text = String(raw ?? '').trim()
    if (!text) return ''
    const hashOnly = text.match(/^#\s*([A-Za-z0-9][A-Za-z0-9_-]*)$/)
    if (hashOnly?.[1]) return hashOnly[1]
    const bracketOnly = text.match(/^\[([A-Za-z0-9][A-Za-z0-9_-]*)\]$/)
    if (bracketOnly?.[1]) return bracketOnly[1]
    return ''
  }
  const resolvePromoComposeMenuName = (menuIdRaw: unknown, menuNameRaw: unknown): string => {
    const menuId = String(menuIdRaw ?? '').trim()
    const fromName = String(menuNameRaw ?? '').trim()
    const placeholderToken = parsePromoMenuPlaceholderToken(fromName)
    const candidates = [menuId, placeholderToken].filter(Boolean)
    for (const candidate of candidates) {
      if (typeof menuNameById === 'function') {
        const fromId = String(menuNameById(candidate) ?? '').trim()
        if (fromId) return fromId
      }
      const byCode = menuNameByCode.get(candidate.toUpperCase()) || ''
      if (byCode) return byCode
    }
    if (fromName && !placeholderToken) return fromName
    return ''
  }
  const timestamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
  const parsedMemo = parsePosOrderMemo(payload.memo)
  const c = (tag: string) => '\u003c/' + tag + '>'
  const tableDisplay = payload.tableName
    ? translateReceiptTableDisplayName(payload.tableName, (k) => t(k))
    : ''
  const tableRow = tableDisplay
    ? '<div class="receipt-meta-row"><span class="receipt-meta-label">' +
      esc(tr('posTable', '테이블')) +
      c('span') +
      '<span class="receipt-meta-value">' +
      escapeHtmlReceiptEmphasizeChannelTokenAfterHash(tableDisplay) +
      c('span') +
      c('div')
    : ''
  const guestN = Math.max(0, Math.min(99, Math.trunc(Number(payload.guestCount ?? 0) || 0)))
  const guestRow =
    guestN > 0
      ? '<div class="receipt-meta-row"><span class="receipt-meta-label">' +
        esc(tr('posOrderGuestCount', 'Guests')) +
        c('span') +
        '<span class="receipt-meta-value">' +
        esc(String(guestN)) +
        c('span') +
        c('div')
      : ''
  const channelOrderPick = pickPosChannelOrderNo({
    tableName: payload.tableName,
    orderNo: payload.orderNo,
    memo: payload.memo,
  })
  const channelOrderNoRow =
    channelOrderPick.kind !== 'pos_order' && channelOrderPick.text.trim()
      ? '<div class="receipt-meta-row"><span class="receipt-meta-label">' +
        esc(tr('posChannelOrderNo', '채널 주문번호')) +
        c('span') +
        '<span class="receipt-meta-value">#' +
        esc(channelOrderPick.text.trim()) +
        c('span') +
        c('div')
      : ''
  const dateRow =
    '<div class="receipt-meta-row"><span class="receipt-meta-label">' +
    esc(tr('date', 'Date')) +
    c('span') +
    '<span class="receipt-meta-value">' +
    esc(timestamp) +
    c('span') +
    c('div')
  const posOrderNoDigits = formatPosOrderNoDigitsOnly(String(payload.orderNo ?? '').trim())
  const posOrderNoRow =
    posOrderNoDigits
      ? '<div class="receipt-meta-row"><span class="receipt-meta-label">' +
        esc(tr('posOrderNo', '주문번호')) +
        c('span') +
        '<span class="receipt-meta-value">' +
        esc(posOrderNoDigits) +
        c('span') +
        c('div')
      : ''
  const otKey = normalizePosOrderTypeKey(payload.orderType)
  const orderTypeLabelText =
    otKey === 'delivery'
      ? tr('posOrderTypeDelivery', 'Delivery')
      : otKey === 'takeout'
        ? tr('posOrderTypeTakeout', 'Takeaway')
        : tr('posOrderTypeDineIn', 'Dine In')
  const orderTypeChipInline =
    '<span class="receipt-order-type-chip receipt-order-type-chip--inline"> ' +
    esc(orderTypeLabelText) +
    '</span>'
  const voidMode = Boolean(payload.voidReceiptMode)
  const grabInbound = isGrabInboundPosOrder({ memo: payload.memo, items: payload.items })
  const receiptItems = mergeSetChildrenForReceipt(payload.items || [], {
    grabInbound,
    optionNameByCode,
  })
  const explicitOrderDisc = resolvePosSalesDiscountAmount(
    Math.max(0, Number(payload.discountAmt) || 0),
    Math.max(0, Number(payload.couponDiscountAmt) || 0)
  )
  const mergedLineDiscSum = sumPosReceiptLineDiscountAmt(receiptItems)
  const discountForLineAlloc =
    explicitOrderDisc > 0.0001
      ? explicitOrderDisc
      : mergedLineDiscSum > 0.0001
        ? mergedLineDiscSum
        : resolveHallOrderReceiptDiscountAmt(payload)
  const lineDiscountAlloc = resolvePosReceiptLineDiscountAlloc(receiptItems, discountForLineAlloc)
  const itemsRows = receiptItems
    .map((it, idx) => {
      const lineName = resolveOrderItemDisplayName ? resolveOrderItemDisplayName(it) : String(it.name ?? '')
      const banban = parseBanbanFlavorsFromName(lineName)
      const lineSplit = splitPosPrintItemLine(lineName)
      const lineMain = translatePosMenuLineForReceipt(
        banban ? banban.baseName : lineSplit.mainName || lineName,
        (k) => t(k)
      )
      const lineOption = banban
        ? ''
        : lineSplit.optionLine
          ? translatePosMenuLineForReceipt(
              formatGrabOptionFragmentForPrint(lineSplit.optionLine, optionNameByCode),
              (k) => t(k)
            )
          : ''
      const grabPrintNote = grabInbound ? resolveGrabItemPrintNote(it) : String(it.note ?? '')
      const grabOptionLines = grabInbound
        ? collectGrabPrintOptionLines({
            note: grabPrintNote,
            optionFragment: lineSplit.optionLine,
            optionNameByCode,
          }).map((opt) => translatePosMenuLineForReceipt(opt, (k) => t(k)))
        : []
      const banbanFlavorLines = banban
        ? [banban.flavor1, banban.flavor2].map((flavor) =>
            translatePosMenuLineForReceipt(flavor, (k) => t(k))
          )
        : []
      const lineOptionTokens = banban
        ? banbanFlavorLines
        : grabInbound
          ? grabOptionLines
          : splitReceiptOptionTokens(lineOption)
      const lineNote = grabInbound
        ? resolveGrabPrintNoteRequest(grabPrintNote, optionNameByCode, (k) => t(k))
        : formatGrabOrderLineNoteForPrint(String(it.note ?? ''), optionNameByCode, (k) => t(k)) ||
          normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
      const rawLineNoteLabel = tr('posLineNote', '메모')
      const lineNoteLabel = /^item\s*note$/i.test(rawLineNoteLabel) ? 'Item' : rawLineNoteLabel
      const lineMainForPromo = lineSplit.mainName || lineName
      const promoRows =
        Array.isArray(it.promoItems) && it.promoItems.length > 0
          ? enrichGrabPromoItemsForPrint(
              it.promoItems.slice(0, 8).map((p) => ({
                menuId: String(p.menuId || ''),
                optionId: p.optionId,
                optionCode: (p as { optionCode?: string | null }).optionCode ?? null,
                optionName: (p as { optionName?: string | null }).optionName ?? null,
                menuName:
                  String((p as { menuName?: unknown }).menuName ?? '').trim() ||
                  (typeof menuNameById === 'function' ? menuNameById(String(p.menuId || '')) : ''),
                quantity: Math.max(1, Number(p.quantity) || 1),
              })),
              { optionNameByCode, menuCodeByMenuId }
            )
          : []
      const promoComposeLines =
        promoRows.length > 0
          ? promoRows.flatMap((p) => {
              const menuName =
                resolvePromoComposeMenuName(
                  String(p.menuId || ''),
                  (p as { menuName?: unknown }).menuName ?? ''
                ) ||
                `#${String(p.menuId)}`
              const optCode = String((p as { optionCode?: unknown }).optionCode ?? '').trim()
              const optName =
                String((p as { optionName?: unknown }).optionName ?? '').trim() ||
                (optCode && !grabInbound
                  ? formatGrabOrderLineNoteForPrint(`optc:${optCode}`, optionNameByCode)
                  : '')
              return formatGrabPromoComposeLinesForPrint(
                {
                  menuName: translatePosMenuLineForReceipt(menuName, (k) => t(k)),
                  optionName: optName
                    ? translatePosMenuLineForReceipt(optName, (k) => t(k))
                    : '',
                  quantity: Math.max(1, Number(p.quantity) || 1),
                  parentItemName: translatePosMenuLineForReceipt(lineMainForPromo, (k) => t(k)),
                },
                grabInbound
              )
            })
          : []
      const promoComposeLinesExpanded = promoComposeLines.flatMap(
        (line) => expandBanbanComposeLineForPrint(line) ?? [line]
      )
      const promoComposeHtml =
        promoComposeLinesExpanded.length > 0
          ? '<div class="receipt-line-note">' +
            promoComposeLinesExpanded.map((line) => '- ' + esc(line)).join('<br/>') +
            c('div')
          : ''
      const optionHtml =
        lineOptionTokens.length > 0
          ? '<div class="receipt-line-note">' + lineOptionTokens.map((opt) => '- ' + esc(opt)).join('<br/>') + c('div')
          : ''
      const noteHtml =
        lineNote && !lineNoteDuplicatesOptions(lineNote, lineOptionTokens)
          ? '<div class="receipt-line-note">' + esc(lineNoteLabel) + ': ' + esc(lineNote) + c('div')
          : ''
      const lineDiscount = Math.max(0, Number(lineDiscountAlloc[idx] ?? 0) || 0)
      const lineDiscountHtml =
        lineDiscount > 0.0001
          ? '<div class="receipt-line-note">' +
            esc(tr('posDiscount', '할인')) +
            ': -' +
            formatBahtNum(lineDiscount) +
            c('div')
          : ''
      const addonPrefix = it.isAddon ? '&gt; ' : ''
      return (
        '<div class="receipt-row"><span>' +
        String(it.qty) +
        'x ' +
        addonPrefix +
        esc(lineMain) +
        c('span') +
        '<span>' +
        formatBahtNum(
          (voidMode ? negatePosReceiptMoney(it.price) : Number(it.price) || 0) * (Number(it.qty) || 0)
        ) +
        c('span') +
        c('div') +
        optionHtml +
        promoComposeHtml +
        lineDiscountHtml +
        noteHtml
      )
    })
    .join('')
  const memoRow = parsedMemo.plainMemo
    ? '<div class="memo">' + esc(tr('posCustomerMemo', '메모')) + ': ' + esc(parsedMemo.plainMemo) + c('div')
    : ''
  const taxInvoiceRow = parsedMemo.taxInvoice
    ? buildPosTaxInvoiceThermalHtml({ taxInvoice: parsedMemo.taxInvoice, esc, tr })
    : ''
  const effectiveDiscountAmt = resolveHallOrderReceiptDiscountAmt(payload)
  const discountRow =
    effectiveDiscountAmt > 0.0001
      ? '<div class="receipt-row discount"><span>' +
        esc(resolveHallOrderDiscountLabel(t, payload.discountReason)) +
        c('span') +
        '<span>-' +
        formatBahtNum(effectiveDiscountAmt) +
        c('span') +
        c('div')
      : ''
  const deliveryFeeRow =
    (payload.deliveryFee ?? 0) > 0
      ? `<div class="receipt-row"><span>${esc(t('posDeliveryFee') || '배달 수수료')}</span><span>+${formatBahtNum(payload.deliveryFee ?? 0)}</span></div>`
      : ''
  const packagingFeeRow =
    (payload.packagingFee ?? 0) > 0
      ? `<div class="receipt-row"><span>${esc(t('posPackagingFee') || '포장 수수료')}</span><span>+${formatBahtNum(payload.packagingFee ?? 0)}</span></div>`
      : ''
  const orderNoForPrint = formatPosReceiptOrderNoDisplay({
    posOrderNo: payload.orderNo,
    tableName: payload.tableName,
    memo: payload.memo,
  })
  const printContent =
    '<div class="receipt-content receipt-order-simple"><div class="receipt-order-header text-center"><div class="receipt-order-label">' +
    esc(tr('posOrderNo', '주문')) +
    ' #' +
    esc(orderNoForPrint) +
    orderTypeChipInline +
    c('div') +
    c('div') +
    '<div class="receipt-divider">' +
    c('div') +
    '<div class="text-xs">' +
    tableRow +
    guestRow +
    channelOrderNoRow +
    dateRow +
    posOrderNoRow +
    c('div') +
    '<div class="receipt-divider">' +
    c('div') +
    (taxInvoiceRow ? taxInvoiceRow + '<div class="receipt-divider">' + c('div') : '') +
    (voidMode ? buildReceiptVoidBannerHtml(tr) : '') +
    '<div class="receipt-item-head"><span>' +
    esc(tr('posMenuName', '품목')) +
    c('span') +
    '<span>' +
    esc(tr('amount', '금액')) +
    c('span') +
    c('div') +
    itemsRows +
    memoRow +
    '<div class="receipt-divider">' +
    c('div') +
    discountRow +
    deliveryFeeRow +
    packagingFeeRow +
    '<div class="receipt-divider">' +
    c('div') +
    '<div class="receipt-row receipt-total"><span>' +
    esc(t('posTotal') || '합계') +
    c('span') +
    '<span>' +
    formatBahtNum(voidMode ? negatePosReceiptMoney(payload.total) : payload.total) +
    c('span') +
    c('div') +
    (voidMode
      ? '<div class="receipt-row receipt-total"><span>' +
        esc(tr('posReceiptVoidAmount', 'Void Amount')) +
        c('span') +
        '<span>' +
        formatBahtNum(negatePosReceiptMoney(payload.total)) +
        c('span') +
        c('div')
      : '') +
    c('div')

  return buildReceiptDocumentHtml({
    title: t('posReceipt') || '영수증',
    htmlLang: lang,
    bodyContent: printContent,
    extraStyles:
      '.receipt-order-simple .receipt-order-label{font-weight:800;line-height:1.35}.receipt-order-simple .receipt-order-type-chip{display:inline-block;vertical-align:middle;border:1.4px solid #000;border-radius:999px;font-weight:800;color:#000;background:#fff}.receipt-order-simple .receipt-order-type-chip--inline{margin-left:5px;padding:1px 8px;font-size:10px;letter-spacing:.02em;line-height:1.2}.receipt-order-simple .receipt-line-note{margin-left:2.3mm;color:#000;font-weight:700}.receipt-order-simple .receipt-row,.receipt-order-simple .receipt-item-head{display:table;width:100%;table-layout:fixed;border-collapse:collapse}.receipt-order-simple .receipt-row>span:first-child,.receipt-order-simple .receipt-item-head>span:first-child{display:table-cell;width:calc(100% - ' +
      String(RECEIPT_AMOUNT_COL_MM) +
      'mm);padding-right:' +
      String(RECEIPT_GRID_COL_GAP_PX) +
      'px;vertical-align:top}.receipt-order-simple .receipt-row>span:last-child,.receipt-order-simple .receipt-item-head>span:last-child{display:table-cell;width:' +
      String(RECEIPT_AMOUNT_COL_MM) +
      'mm;text-align:right;vertical-align:top;white-space:normal}.receipt-order-simple .receipt-meta-row{display:table;width:100%;table-layout:fixed;border-collapse:collapse}.receipt-order-simple .receipt-meta-label{display:table-cell;width:22mm;vertical-align:top;white-space:nowrap;padding-right:3mm}.receipt-order-simple .receipt-meta-value{display:table-cell;width:auto;vertical-align:top}' +
      (voidMode ? POS_RECEIPT_VOID_EXTRA_STYLES : ''),
  })
}
