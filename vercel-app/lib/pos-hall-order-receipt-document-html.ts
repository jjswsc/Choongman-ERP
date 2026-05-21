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
  formatGrabOptionFragmentForPrint,
  formatGrabOrderLineNoteForPrint,
  formatGrabPromoComposeLinesForPrint,
  isGrabInboundPosOrder,
  resolveGrabPrintNoteRequest,
} from '@/lib/grab-pos-order-enrich'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { buildPosTaxInvoiceThermalHtml, parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { formatBahtNum } from '@/lib/utils'
import { RECEIPT_AMOUNT_COL_MM, RECEIPT_GRID_COL_GAP_PX } from '@/lib/pos-receipt-layout'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'

type HallOrderItem = {
  id: string
  name: string
  price: number
  qty: number
  note?: string
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

type HallOrderPayload = {
  orderNo: string
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  items: HallOrderItem[]
  subtotal: number
  discountAmt: number
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
}

function parseReceiptSetChildLineName(name: string): { promoLabel: string; childName: string } | null {
  const trimmed = String(name ?? '').trim()
  const lastBracket = trimmed.lastIndexOf(']')
  if (lastBracket < 0 || lastBracket >= trimmed.length - 1) return null
  const childName = trimmed.slice(lastBracket + 1).trim()
  if (!childName) return null
  const prefix = trimmed.slice(0, lastBracket + 1)
  if (!prefix.includes('[')) return null
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
  if (childRows.length === 0) return out
  const childIndexSet = new Set(childRows.map((x) => x.index))
  const hide = new Set<number>()

  const findParentIndex = (promoLabel: string) => {
    const key = normalizeReceiptTextKey(promoLabel)
    if (!key) return -1
    let best = -1
    let score = 0
    for (let i = 0; i < out.length; i++) {
      if (childIndexSet.has(i)) continue
      const nk = normalizeReceiptTextKey(String(out[i].name ?? ''))
      if (!nk) continue
      let s = 0
      if (nk === key) s = 100
      else if (nk.includes(key) || key.includes(nk)) s = 80
      if (s > score) {
        score = s
        best = i
      }
    }
    return best
  }

  for (const child of childRows) {
    const parentIdx = findParentIndex(child.promoLabel)
    if (parentIdx < 0 || parentIdx === child.index) continue
    const parent = out[parentIdx]
    const list = Array.isArray(parent.promoItems) ? [...parent.promoItems] : []
    const opt = String(out[child.index].note ?? '').trim()
    let optionName = opt
    if (opt && opts?.grabInbound) {
      const chips = collectGrabPrintOptionLines({
        note: opt,
        optionNameByCode: opts.optionNameByCode,
      })
      if (chips.length) optionName = chips.join(', ')
      else {
        const parsed = formatGrabOrderLineNoteForPrint(opt, opts.optionNameByCode)
        if (parsed) optionName = parsed
      }
    }
    list.push({
      menuId: '',
      optionId: null,
      ...(optionName ? { optionName } : {}),
      menuName: child.childName,
      quantity: Math.max(1, Number(out[child.index].qty ?? 1) || 1),
    } as HallOrderPromoItem)
    out[parentIdx] = { ...parent, promoItems: list }
    hide.add(child.index)
  }

  return out.filter((_, idx) => !hide.has(idx))
}

export function buildPosHallOrderReceiptDocumentHtml(params: {
  payload: HallOrderPayload
  t: (key: string) => string
  lang: string
  resolveOrderItemDisplayName?: (item: HallOrderItem) => string
  menuNameById?: (menuId: string) => string
  optionNameByCode?: Map<string, string> | Record<string, string>
}): string {
  const { payload, t, lang, resolveOrderItemDisplayName, menuNameById, optionNameByCode } = params
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
  const grabInbound = isGrabInboundPosOrder({ memo: payload.memo, items: payload.items })
  const receiptItems = mergeSetChildrenForReceipt(payload.items || [], {
    grabInbound,
    optionNameByCode,
  })
  const itemsRows = receiptItems
    .map((it) => {
      const lineName = resolveOrderItemDisplayName ? resolveOrderItemDisplayName(it) : String(it.name ?? '')
      const lineSplit = splitPosPrintItemLine(lineName)
      const lineMain = translatePosMenuLineForReceipt(lineSplit.mainName || lineName, (k) => t(k))
      const lineOption = lineSplit.optionLine
        ? translatePosMenuLineForReceipt(
            formatGrabOptionFragmentForPrint(lineSplit.optionLine, optionNameByCode),
            (k) => t(k)
          )
        : ''
      const grabOptionLines = grabInbound
        ? collectGrabPrintOptionLines({
            note: it.note,
            optionFragment: lineSplit.optionLine,
            optionNameByCode,
          }).map((opt) => translatePosMenuLineForReceipt(opt, (k) => t(k)))
        : []
      const lineOptionTokens = grabInbound
        ? grabOptionLines
        : splitReceiptOptionTokens(lineOption)
      const lineNote = grabInbound
        ? resolveGrabPrintNoteRequest(String(it.note ?? ''), optionNameByCode)
        : formatGrabOrderLineNoteForPrint(String(it.note ?? ''), optionNameByCode) ||
          normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
      const rawLineNoteLabel = tr('posLineNote', '메모')
      const lineNoteLabel = /^item\s*note$/i.test(rawLineNoteLabel) ? 'Item' : rawLineNoteLabel
      const promoComposeLines =
        Array.isArray(it.promoItems) && it.promoItems.length > 0
          ? it.promoItems.slice(0, 8).flatMap((p) => {
              const menuName =
                String((p as { menuName?: unknown }).menuName ?? '').trim() ||
                (typeof menuNameById === 'function' ? menuNameById(String(p.menuId || '')) : '') ||
                `#${String(p.menuId)}`
              const optCode = String((p as { optionCode?: unknown }).optionCode ?? '').trim()
              const optName =
                String((p as { optionName?: unknown }).optionName ?? '').trim() ||
                (optCode
                  ? formatGrabOrderLineNoteForPrint(`optc:${optCode}`, optionNameByCode)
                  : '')
              return formatGrabPromoComposeLinesForPrint(
                {
                  menuName: translatePosMenuLineForReceipt(menuName, (k) => t(k)),
                  optionName: optName
                    ? translatePosMenuLineForReceipt(optName, (k) => t(k))
                    : '',
                  quantity: Math.max(1, Number(p.quantity) || 1),
                },
                grabInbound
              )
            })
          : []
      const promoComposeHtml =
        promoComposeLines.length > 0
          ? '<div class="receipt-line-note">' + promoComposeLines.map((line) => '- ' + esc(line)).join('<br/>') + c('div')
          : ''
      const optionHtml =
        lineOptionTokens.length > 0
          ? '<div class="receipt-line-note">' + lineOptionTokens.map((opt) => '- ' + esc(opt)).join('<br/>') + c('div')
          : ''
      const noteHtml = lineNote
        ? '<div class="receipt-line-note">' + esc(lineNoteLabel) + ': ' + esc(lineNote) + c('div')
        : ''
      return (
        '<div class="receipt-row"><span>' +
        String(it.qty) +
        'x ' +
        esc(lineMain) +
        c('span') +
        '<span>' +
        formatBahtNum((Number(it.price) || 0) * (Number(it.qty) || 0)) +
        c('span') +
        c('div') +
        optionHtml +
        promoComposeHtml +
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
  const discountRow =
    payload.discountAmt > 0
      ? '<div class="receipt-row discount"><span>' +
        esc(t('posDiscount') || '할인') +
        c('span') +
        '<span>-' +
        formatBahtNum(payload.discountAmt) +
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
    '<div class="receipt-content receipt-order-simple"><div class="receipt-order-header text-center"><div class="receipt-store-name">' +
    esc(payload.storeCode) +
    c('div') +
    '<div class="receipt-order-label">' +
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
    c('div') +
    '<div class="receipt-divider">' +
    c('div') +
    '<div class="receipt-item-head"><span>' +
    esc(tr('posMenuName', '품목')) +
    c('span') +
    '<span>' +
    esc(tr('amount', '금액')) +
    c('span') +
    c('div') +
    itemsRows +
    taxInvoiceRow +
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
    formatBahtNum(payload.total) +
    c('span') +
    c('div') +
    c('div')

  return buildReceiptDocumentHtml({
    title: t('posReceipt') || '영수증',
    htmlLang: lang,
    bodyContent: printContent,
    extraStyles:
      '.receipt-order-simple .receipt-order-label{font-weight:800;line-height:1.35}.receipt-order-simple .receipt-order-type-chip{display:inline-block;vertical-align:middle;border:1.4px solid #000;border-radius:999px;font-weight:800;color:#000;background:#fff}.receipt-order-simple .receipt-order-type-chip--inline{margin-left:5px;padding:1px 8px;font-size:10px;letter-spacing:.02em;line-height:1.2}.receipt-order-simple .receipt-line-note{margin-left:2.3mm;color:#111}.receipt-order-simple .receipt-row,.receipt-order-simple .receipt-item-head{display:table;width:100%;table-layout:fixed;border-collapse:collapse}.receipt-order-simple .receipt-row>span:first-child,.receipt-order-simple .receipt-item-head>span:first-child{display:table-cell;width:calc(100% - ' +
      String(RECEIPT_AMOUNT_COL_MM) +
      'mm);padding-right:' +
      String(RECEIPT_GRID_COL_GAP_PX) +
      'px;vertical-align:top}.receipt-order-simple .receipt-row>span:last-child,.receipt-order-simple .receipt-item-head>span:last-child{display:table-cell;width:' +
      String(RECEIPT_AMOUNT_COL_MM) +
      'mm;text-align:right;vertical-align:top;white-space:normal}.receipt-order-simple .receipt-meta-row{display:table;width:100%;table-layout:fixed;border-collapse:collapse}.receipt-order-simple .receipt-meta-label{display:table-cell;width:22mm;vertical-align:top;white-space:nowrap;padding-right:3mm}.receipt-order-simple .receipt-meta-value{display:table-cell;width:auto;vertical-align:top}',
  })
}
