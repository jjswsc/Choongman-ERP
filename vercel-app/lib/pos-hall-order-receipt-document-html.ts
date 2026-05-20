import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import {
  escapeHtmlReceiptEmphasizeChannelTokenAfterHash,
  formatPosReceiptOrderNoDisplay,
  pickPosChannelOrderNo,
} from '@/lib/pos-delivery-platform'
import { splitPosPrintItemLine } from '@/lib/pos-print-item-line'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
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

export function buildPosHallOrderReceiptDocumentHtml(params: {
  payload: HallOrderPayload
  t: (key: string) => string
  lang: string
  resolveOrderItemDisplayName?: (item: HallOrderItem) => string
  menuNameById?: (menuId: string) => string
}): string {
  const { payload, t, lang, resolveOrderItemDisplayName, menuNameById } = params
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
  const itemsRows = payload.items
    .map((it) => {
      const lineName = resolveOrderItemDisplayName ? resolveOrderItemDisplayName(it) : String(it.name ?? '')
      const lineSplit = splitPosPrintItemLine(lineName)
      const lineMain = translatePosMenuLineForReceipt(lineSplit.mainName || lineName, (k) => t(k))
      const lineOption = lineSplit.optionLine
        ? translatePosMenuLineForReceipt(lineSplit.optionLine, (k) => t(k))
        : ''
      const lineNote = normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
      const rawLineNoteLabel = tr('posLineNote', '메모')
      const lineNoteLabel = /^item\s*note$/i.test(rawLineNoteLabel) ? 'Item' : rawLineNoteLabel
      const promoComposeLines =
        Array.isArray(it.promoItems) && it.promoItems.length > 0
          ? it.promoItems.slice(0, 8).map((p) => {
              const menuName =
                String((p as { menuName?: unknown }).menuName ?? '').trim() ||
                (typeof menuNameById === 'function' ? menuNameById(String(p.menuId || '')) : '') ||
                `#${String(p.menuId)}`
              const optName = String((p as { optionName?: unknown }).optionName ?? '').trim()
              const optNameLabel = optName ? ` (${translatePosMenuLineForReceipt(optName, (k) => t(k))})` : ''
              return `${menuName}${optNameLabel} x${Math.max(1, Number(p.quantity) || 1)}`
            })
          : []
      const promoComposeHtml =
        promoComposeLines.length > 0
          ? '<div class="receipt-line-note">' + promoComposeLines.map((line) => '- ' + esc(line)).join('<br/>') + c('div')
          : ''
      const noteHtml = lineNote
        ? '<div class="receipt-line-note">' + esc(lineNoteLabel) + ': ' + esc(lineNote) + c('div')
        : ''
      const optionHtml = lineOption
        ? '<div class="receipt-line-note">- ' + esc(lineOption) + c('div')
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
