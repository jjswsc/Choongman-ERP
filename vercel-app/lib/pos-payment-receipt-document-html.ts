/**
 * 결제(손님) 영수증 전체 HTML — PosReceiptModal·영수증 관리 재인쇄 공통
 */

import type { PosMenu, PosPrinterSettings, PosPromoWithItems } from '@/lib/api-client'
import { enrichReceiptModalItemsForPromoDisplay } from '@/lib/pos-payment-receipt-from-order'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { escapeHtml, formatBahtNum } from '@/lib/utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import {
  escapeHtmlReceiptEmphasizeChannelTokenAfterHash,
  formatPosReceiptOrderNoDisplay,
  resolvePosReceiptOrderNoRaw,
} from '@/lib/pos-delivery-platform'
import { posReceiptItemSkuForBarcode } from '@/lib/pos-receipt-barcode'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { RECEIPT_AMOUNT_COL_MM, RECEIPT_GRID_COL_GAP_PX } from '@/lib/pos-receipt-layout'
import { parsePaymentOtherBreakdown, sumPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import {
  shouldForceSimplePaymentReceiptForStore,
  shouldUseTightSimpleReceiptInsetForStore,
} from '@/lib/pos-receipt-store-flags'

function deliveryPaymentChannelLabel(
  raw: string | null | undefined,
  tr: (key: string, fallback: string) => string
): string {
  const c = String(raw || '').trim().toLowerCase()
  if (c === 'grab') return tr('posDeliveryPayGrab', 'Grab')
  if (c === 'lineman') return tr('posDeliveryPayLineman', 'Line Man')
  if (c === 'shopee') return tr('posDeliveryPayShopeeFood', 'Shopee Food')
  if (c === 'dine_in') return tr('posDeliveryPayDineIn', 'Dine in')
  return String(raw || '').trim()
}

function receiptPaymentBreakdownRows(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string
): { label: string; amountStr: string }[] {
  const cash = Math.max(0, Number(receiptData.paymentCash ?? 0) || 0)
  const card = Math.max(0, Number(receiptData.paymentCard ?? 0) || 0)
  const qr = Math.max(0, Number(receiptData.paymentQr ?? 0) || 0)
  const other = Math.max(0, Number(receiptData.paymentOther ?? 0) || 0)
  const del = Math.max(0, Number(receiptData.paymentDeliveryApp ?? 0) || 0)
  const rows: { label: string; amountStr: string }[] = []
  const push = (label: string, n: number) => {
    if (n > 0.005) rows.push({ label, amountStr: formatBahtNum(n) })
  }
  push(tr('posPaymentCash', '현금'), cash)
  push(tr('posPaymentCard', '카드'), card)
  push(tr('posPaymentQr', 'QR'), qr)
  const ob = parsePaymentOtherBreakdown(receiptData.paymentOtherBreakdown)
  const obOk =
    other > 0.005 &&
    ob != null &&
    Math.abs(sumPaymentOtherBreakdown(ob) - other) <= 0.02
  if (obOk && ob) {
    if ((ob.trueMoney ?? 0) > 0.005) push(`· ${tr('posPaymentTrueMoney', 'TrueMoney')}`, Number(ob.trueMoney) || 0)
    if ((ob.weChat ?? 0) > 0.005) push(`· ${tr('posPaymentWeChat', 'WeChat')}`, Number(ob.weChat) || 0)
    if ((ob.alipay ?? 0) > 0.005) push(`· ${tr('posPaymentAlipay', 'Alipay')}`, Number(ob.alipay) || 0)
    if ((ob.linePay ?? 0) > 0.005) push(`· ${tr('posPaymentLinePay', 'LINE Pay')}`, Number(ob.linePay) || 0)
    if ((ob.shopeePay ?? 0) > 0.005) push(`· ${tr('posPaymentShopeePay', 'Shopee Pay')}`, Number(ob.shopeePay) || 0)
    if ((ob.misc ?? 0) > 0.005) push(`· ${tr('posPaymentOtherEtc', '기타')}`, Number(ob.misc) || 0)
    if (ob.admin && typeof ob.admin === 'object') {
      for (const [wid, rawAmt] of Object.entries(ob.admin)) {
        const label = String(wid || '').trim() || 'Wallet'
        push(`· ${label}`, Number(rawAmt) || 0)
      }
    }
  } else {
    push(tr('posPaymentOther', '기타'), other)
  }
  const ch = deliveryPaymentChannelLabel(receiptData.deliveryPaymentChannel, tr)
  const delLabel =
    del > 0.005 && ch
      ? `${tr('posPaymentDeliveryApp', '배달앱')} (${ch})`
      : tr('posPaymentDeliveryApp', '배달앱')
  push(delLabel, del)
  return rows
}

function receiptPaymentBreakdownHtml(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string,
  esc: (value: string) => string,
  mode: 'simple' | 'grid'
): string {
  const isPaymentReceipt =
    !receiptData.receiptAutoPrintContext || receiptData.receiptAutoPrintContext === 'payment'
  if (!isPaymentReceipt) return ''
  const rows = receiptPaymentBreakdownRows(receiptData, tr)
  if (!rows.length) return ''
  const title = esc(tr('posReceiptPaymentMethods', '결제 수단'))
  if (mode === 'simple') {
    const body = rows
      .map(
        (r) =>
          `<div class="simple-stack"><div class="simple-stack-name">${esc(r.label)}</div><div class="simple-stack-amt">${esc(r.amountStr)}</div></div>`
      )
      .join('')
    return `<div class="simple-divider"></div><div class="simple-line simple-pay-title"><b>${title}</b></div><div class="simple-stack-block">${body}</div>`
  }
  const body = rows
    .map((r) => `<div class="receipt-row"><span>${esc(r.label)}</span><span>${esc(r.amountStr)}</span></div>`)
    .join('')
  return `<div class="receipt-section-title receipt-pay-title">${title}</div>${body}<div class="receipt-divider"></div>`
}

export function buildCode128BarcodeUrl(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  return `https://quickchart.io/barcode?type=code128&text=${encodeURIComponent(text)}&scale=2&height=38&includetext=true`
}

export type PosPaymentReceiptDesignResolved = {
  receiptBizName: string
  receiptBizTaxId: string
  receiptBizAbn: string
  receiptBizOwner: string
  receiptBizAddress: string
  receiptBizPhone: string
  receiptLogoSize: 'sm' | 'md' | 'lg'
  receiptShowTitle: boolean
  receiptShowPaidStamp: boolean
  receiptShowThankYou: boolean
  receiptShowCustomerCopy: boolean
  receiptFooterPrimaryText: string
  receiptFooterSecondaryText: string
  receiptLogoImageUrl: string
  receiptStampImageUrl: string
  receiptShowStamp: boolean
  receiptStampOnlyTaxInvoice: boolean
  receiptMembershipQrImageUrl: string
  receiptMembershipQrLinkUrl: string
  receiptMembershipQrText: string
  receiptShowMembershipQr: boolean
  signatureLine: boolean
  receiptBarcode: boolean
  itemBarcode: boolean
  /** false면 결제 영수증에서도 로고 숨김(매장 설정 logoPrint) */
  receiptShowLogo: boolean
}

const DEFAULT_DESIGN: PosPaymentReceiptDesignResolved = {
  receiptBizName: '',
  receiptBizTaxId: '',
  receiptBizAbn: '',
  receiptBizOwner: '',
  receiptBizAddress: '',
  receiptBizPhone: '',
  receiptLogoSize: 'md',
  receiptShowTitle: true,
  receiptShowPaidStamp: true,
  receiptShowThankYou: true,
  receiptShowCustomerCopy: true,
  receiptFooterPrimaryText: '',
  receiptFooterSecondaryText: '',
  receiptLogoImageUrl: '',
  receiptStampImageUrl: '',
  receiptShowStamp: true,
  receiptStampOnlyTaxInvoice: true,
  receiptMembershipQrImageUrl: '',
  receiptMembershipQrLinkUrl: '',
  receiptMembershipQrText: '',
  receiptShowMembershipQr: false,
  signatureLine: false,
  receiptBarcode: false,
  itemBarcode: false,
  receiptShowLogo: true,
}

export function resolvePaymentReceiptDesign(
  printerSettings: PosPrinterSettings | null | undefined,
  override?: Partial<PosPaymentReceiptDesignResolved>
): PosPaymentReceiptDesignResolved {
  const s = printerSettings ?? null
  const logoSize =
    s?.receiptLogoSize === 'sm' ? 'sm' : s?.receiptLogoSize === 'lg' ? 'lg' : ('md' as const)
  const base: PosPaymentReceiptDesignResolved = {
    ...DEFAULT_DESIGN,
    receiptBizName: String(s?.receiptBizName ?? ''),
    receiptBizTaxId: String(s?.receiptBizTaxId ?? ''),
    receiptBizAbn: String(s?.receiptBizAbn ?? ''),
    receiptBizOwner: String(s?.receiptBizOwner ?? ''),
    receiptBizAddress: String(s?.receiptBizAddress ?? ''),
    receiptBizPhone: String(s?.receiptBizPhone ?? ''),
    receiptLogoSize: logoSize,
    receiptShowTitle: s?.receiptShowTitle !== false,
    receiptShowPaidStamp: s?.receiptShowPaidStamp !== false,
    receiptShowThankYou: s?.receiptShowThankYou !== false,
    receiptShowCustomerCopy: s?.receiptShowCustomerCopy !== false,
    receiptFooterPrimaryText: String(s?.receiptFooterPrimaryText ?? ''),
    receiptFooterSecondaryText: String(s?.receiptFooterSecondaryText ?? ''),
    receiptLogoImageUrl: String(s?.receiptLogoImageUrl ?? ''),
    receiptStampImageUrl: String(s?.receiptStampImageUrl ?? ''),
    receiptShowStamp: s?.receiptShowStamp !== false,
    receiptStampOnlyTaxInvoice: s?.receiptStampOnlyTaxInvoice !== false,
    receiptMembershipQrImageUrl: String(s?.receiptMembershipQrImageUrl ?? ''),
    receiptMembershipQrLinkUrl: String(s?.receiptMembershipQrLinkUrl ?? ''),
    receiptMembershipQrText: String(s?.receiptMembershipQrText ?? ''),
    receiptShowMembershipQr: Boolean(s?.receiptShowMembershipQr),
    signatureLine: Boolean(s?.signatureLine),
    receiptBarcode: Boolean(s?.receiptBarcode),
    itemBarcode: Boolean(s?.itemBarcode),
    receiptShowLogo: s?.logoPrint !== false,
  }
  return { ...base, ...override }
}

export type BuildPosPaymentReceiptDocumentHtmlParams = {
  receiptData: ReceiptModalData
  menus: PosMenu[]
  /** 세트 구성 보강(주방 주문서와 동일한 카탈로그·미러 메뉴 역추적). 없으면 items_json 에 promoItems 가 있을 때만 표시 */
  promoCatalogById?: Map<string, PosPromoWithItems>
  orderTypeLabels: Record<string, string>
  t: (k: string) => string
  lang: string
  origin: string
  /** 영수증 상단 일시(방콕 표기). 생략 시 즉시 시각 */
  printedAt?: Date
  printerSettings?: PosPrinterSettings | null
  /** 모달 등: API 설정 위에 덮어쓸 필드 */
  designOverride?: Partial<PosPaymentReceiptDesignResolved>
  /** true면 2열 레이아웃(grid/flex/table)을 쓰지 않는 초단순 텍스트 모드 강제 */
  forceSimpleTextMode?: boolean
}

export function buildPosPaymentReceiptDocumentHtml(params: BuildPosPaymentReceiptDocumentHtmlParams): string {
  const {
    receiptData,
    menus,
    promoCatalogById,
    orderTypeLabels,
    t,
    lang,
    origin,
    printedAt,
    printerSettings,
    designOverride,
    forceSimpleTextMode,
  } = params
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  const esc = (value: string) => escapeHtml(String(value || ''))
  const tableForPrint = receiptData.tableName
    ? translateReceiptTableDisplayName(receiptData.tableName, t)
    : ''
  const parsedMemo = parsePosOrderMemo(receiptData.memo)
  const taxInvoice = parsedMemo.taxInvoice
  const d = resolvePaymentReceiptDesign(printerSettings ?? null, designOverride)
  const logoUrl = d.receiptLogoImageUrl || `${origin}/company-stamp.png`
  const isPaymentReceipt =
    !receiptData.receiptAutoPrintContext || receiptData.receiptAutoPrintContext === 'payment'
  const showLogo = isPaymentReceipt && d.receiptShowLogo
  const footerPrimaryText =
    String(d.receiptFooterPrimaryText || '').trim() ||
    (d.receiptShowThankYou ? tr('posReceiptThankYou', '감사합니다') : '')
  const footerSecondaryText =
    String(d.receiptFooterSecondaryText || '').trim() ||
    (d.receiptShowCustomerCopy ? tr('posReceiptCustomerCopy', '고객용') : '')
  const showStamp = Boolean(d.receiptShowStamp && d.receiptStampImageUrl && (!d.receiptStampOnlyTaxInvoice || taxInvoice))
  const membershipQrSrc = String(d.receiptMembershipQrLinkUrl || '').trim()
    ? `https://quickchart.io/qr?text=${encodeURIComponent(String(d.receiptMembershipQrLinkUrl || '').trim())}&size=180&margin=1&format=png`
    : d.receiptMembershipQrImageUrl
  const showMembershipQr = Boolean(d.receiptShowMembershipQr && membershipQrSrc)
  const membershipQrText = String(d.receiptMembershipQrText || '').trim()
  const receiptOrderNoRaw = resolvePosReceiptOrderNoRaw({
    posOrderNo: receiptData.orderNo,
    tableName: receiptData.tableName,
    memo: receiptData.memo,
  })
  /** 품목열 전용: 주방·홀 주문서와 같이 promoItems 를 카탈로그로 보강 */
  const itemsForPrint = enrichReceiptModalItemsForPromoDisplay(receiptData.items || [], {
    promoCatalogById,
    menus,
  })
  const receiptBarcodeUrl = d.receiptBarcode ? buildCode128BarcodeUrl(receiptOrderNoRaw) : ''
  const at = printedAt && !Number.isNaN(printedAt.getTime()) ? printedAt : new Date()
  const printedAtStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(at)
  const isTaxInvoice = !!taxInvoice
  const paymentBreakdownSimpleHtml = receiptPaymentBreakdownHtml(receiptData, tr, esc, 'simple')
  const paymentBreakdownGridHtml = receiptPaymentBreakdownHtml(receiptData, tr, esc, 'grid')
  const forceSimple =
    typeof forceSimpleTextMode === 'boolean'
      ? forceSimpleTextMode
      : shouldForceSimplePaymentReceiptForStore(receiptData.storeCode)
  const tightSimpleInset = shouldUseTightSimpleReceiptInsetForStore(receiptData.storeCode)
  if (forceSimple) {
    const orderTypeLabel = orderTypeLabels[receiptData.orderType] || receiptData.orderType
    const useLegacySimpleTable = tightSimpleInset
    const simpleStack = (nameHtml: string, amtHtml: string) =>
      useLegacySimpleTable
        ? `<tr><td class="simple-item-name">${nameHtml}</td><td class="simple-item-amt">${amtHtml}</td></tr>`
        : `<div class="simple-row"><div class="simple-row-name">${nameHtml}</div><div class="simple-row-amt">${amtHtml}</div></div>`
    const itemRows = (itemsForPrint || [])
      .map((it) => {
        const name = translatePosMenuLineForReceipt(it.name, t)
        const amt = formatBahtNum((Number(it.price) || 0) * (Number(it.qty) || 0))
        const main = simpleStack(`${Number(it.qty) || 1}x ${esc(name)}`, amt)
        const promoItems = it.promoItems
        const promoComposeLines =
          Array.isArray(promoItems) && promoItems.length > 0
            ? promoItems.slice(0, 16).map((pi) => {
                const menuName =
                  menus.find((m) => String(m.id) === String(pi.menuId))?.name?.trim() ||
                  `#${String(pi.menuId)}`
                return `${menuName} x${Math.max(1, Number(pi.quantity) || 1)}`
              })
            : []
        const promoMore =
          Array.isArray(promoItems) && promoItems.length > 16 ? promoItems.length - 16 : 0
        const promoBody =
          promoComposeLines
            .map(
              (line) =>
                `<div class="simple-promo-line">· ${esc(translatePosMenuLineForReceipt(line, t))}</div>`
            )
            .join('') +
          (promoMore > 0 ? `<div class="simple-promo-line simple-promo-more">+${promoMore}</div>` : '')
        const promoBlock =
          promoComposeLines.length > 0
            ? useLegacySimpleTable
              ? `<tr><td class="simple-promo-cell" colspan="2">${promoBody}</td></tr>`
              : `<div class="simple-promo-lines">${promoBody}</div>`
            : ''
        return main + promoBlock
      })
      .join('')
    const summaryRows = [
      simpleStack(esc(t('posSubtotal') || '소계'), formatBahtNum(receiptData.subtotal)),
      receiptData.discountAmt > 0
        ? simpleStack(esc(t('posDiscount') || '할인'), `-${formatBahtNum(receiptData.discountAmt)}`)
        : '',
      (receiptData.deliveryFee ?? 0) > 0
        ? simpleStack(esc(t('posDeliveryFee') || '배달 수수료'), `+${formatBahtNum(receiptData.deliveryFee)}`)
        : '',
      (receiptData.packagingFee ?? 0) > 0
        ? simpleStack(esc(t('posPackagingFee') || '포장 수수료'), `+${formatBahtNum(receiptData.packagingFee)}`)
        : '',
      (receiptData.vatFeeAmt ?? 0) > 0
        ? simpleStack(
            esc(t('posVatLabel') || '부가세'),
            `${receiptData.vatFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.vatFeeAmt)}`
          )
        : '',
    ]
      .filter(Boolean)
      .join('')
    const simpleHtml = `
      <div class="receipt-content receipt-payment-simple" dir="ltr">
        ${showLogo ? `<div class="simple-logo-wrap"><img src="${esc(logoUrl)}" alt="Company logo" class="simple-logo" /></div>` : ''}
        <div class="simple-title">${esc(tr('posReceipt', '영수증'))}</div>
        <div class="simple-subtitle">${esc(tr('posReceiptSimpleTaxInvoice', '간이 세금계산서'))}</div>
        <div class="simple-store">${esc(receiptData.storeCode)}</div>
        <div class="simple-line"><b>${esc(tr('posOrderNo', '주문번호'))}</b>: ${esc(formatPosReceiptOrderNoDisplay({ posOrderNo: receiptData.orderNo, tableName: receiptData.tableName, memo: receiptData.memo }))}</div>
        <div class="simple-line"><b>${esc(tr('date', 'Date'))}</b>: ${esc(printedAtStr)}</div>
        <div class="simple-line"><b>${esc(tr('posOrderType', 'Order Type'))}</b>: ${esc(orderTypeLabel)}</div>
        ${tableForPrint ? `<div class="simple-line"><b>${esc(tr('posTable', '테이블'))}</b>: ${escapeHtmlReceiptEmphasizeChannelTokenAfterHash(tableForPrint)}</div>` : ''}
        ${d.receiptBizName ? `<div class="simple-line simple-biz">${esc(d.receiptBizName)}</div>` : ''}
        ${d.receiptBizAddress ? `<div class="simple-line simple-biz">${esc(d.receiptBizAddress)}</div>` : ''}
        ${d.receiptBizPhone ? `<div class="simple-line simple-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(d.receiptBizPhone)}</div>` : ''}
        <div class="simple-divider"></div>
        ${
          useLegacySimpleTable
            ? `<table class="simple-table" dir="ltr"><tbody>${itemRows}</tbody></table>`
            : `<div class="simple-stack-block">${itemRows}</div>`
        }
        <div class="simple-divider"></div>
        ${
          useLegacySimpleTable
            ? `<table class="simple-table simple-summary-table" dir="ltr"><tbody>${summaryRows}</tbody></table>`
            : `<div class="simple-stack-block">${summaryRows}</div>`
        }
        <div class="simple-total">${esc(tr('posTotal', '합계'))}: ${formatBahtNum(receiptData.total)}</div>
        ${paymentBreakdownSimpleHtml}
        ${d.receiptShowPaidStamp ? `<div class="simple-paid">${esc(tr('posReceiptPaid', '결제완료'))}</div>` : ''}
        ${footerPrimaryText || footerSecondaryText ? '<div class="simple-footer">' : ''}
        ${footerPrimaryText ? `<div class="simple-footer-strong">${esc(footerPrimaryText)}</div>` : ''}
        ${footerSecondaryText ? `<div>${esc(footerSecondaryText)}</div>` : ''}
        ${footerPrimaryText || footerSecondaryText ? '</div>' : ''}
      </div>
    `
    return buildReceiptDocumentHtml({
      title: t('posReceipt') || '영수증',
      htmlLang: lang,
      bodyContent: simpleHtml,
      extraStyles: `
        /* 손님 결제 간단 영수증: 전역 .receipt-content 좌 nudge·bidi가 CP-802에서 본문을 오른쪽으로 밀거나 2열처럼 보이게 함 → 전부 제거·1열 스택만 */
        html, body { direction: ltr; unicode-bidi: isolate; }
        .receipt-payment-simple.receipt-content { left: 0 !important; margin-left: 0 !important; margin-right: 0 !important; position: relative !important; width: 100% !important; max-width: 100% !important; }
        .receipt-payment-simple { color: #000; direction: ltr; unicode-bidi: isolate; text-align: left; }
        .simple-logo-wrap { text-align: center; margin-bottom: 2px; }
        .simple-logo { width: 82px; height: auto; object-fit: contain; filter: grayscale(100%) contrast(1.1); }
        .simple-title { text-align: center; font-size: 13px; font-weight: 700; margin-bottom: 1px; }
        .simple-subtitle { text-align: center; font-size: 10px; margin-bottom: 3px; }
        .simple-store { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 6px; }
        .simple-line { font-size: 11px; line-height: 1.4; margin: 2px 0; word-break: break-word; text-align: left; }
        .simple-biz { color: #111; }
        .simple-divider { border-top: 1px dashed #000; margin: 6px 0; }
        .simple-stack-block { width: 100%; box-sizing: border-box; }
        .simple-table { width: 100%; border-collapse: collapse; table-layout: fixed; direction: ltr !important; unicode-bidi: isolate !important; }
        .simple-table tr { direction: ltr !important; unicode-bidi: isolate !important; }
        .simple-table td { padding: 2px 0; vertical-align: top; }
        .simple-item-name { font-size: 11px; line-height: 1.35; text-align: left; word-break: break-word; }
        .simple-item-amt { width: 20mm; font-size: 11px; line-height: 1.25; text-align: right; white-space: nowrap; font-weight: 700; font-variant-numeric: tabular-nums; }
        .simple-promo-cell { padding: 0 0 4px 2mm !important; }
        /* 일부 드라이버에서 flex/grid 깨짐: 금액 칼럼을 절대 위치로 고정 */
        .simple-row { margin: 6px 0; direction: ltr; unicode-bidi: isolate; width: 100%; box-sizing: border-box; position: relative; padding-right: 22mm; min-height: 1.25em; }
        .simple-row-name { min-width: 0; display: block; font-size: 11px; line-height: 1.35; text-align: left; word-break: break-word; color: #000; }
        .simple-row-amt { position: absolute; top: 0; right: 0; width: 20mm; font-size: 11px; line-height: 1.25; text-align: right; white-space: nowrap; font-weight: 700; color: #000; font-variant-numeric: tabular-nums; }
        .simple-promo-lines { margin: -2px 0 6px 0; padding: 0 0 0 2mm; }
        .simple-promo-line { font-size: 10px; line-height: 1.32; color: #222; text-align: left; font-weight: 500; }
        .simple-promo-more { font-size: 9px; color: #444; }
        .simple-total { font-size: 12px; font-weight: 700; margin-top: 4px; border-top: 2px solid #000; padding-top: 4px; clear: both; direction: ltr; text-align: left; }
        .simple-pay-title { font-size: 11px; margin-top: 4px; text-align: left; }
        .simple-paid { display: inline-block; border: 1px solid #000; padding: 1px 10px; font-size: 10px; font-weight: 700; margin-top: 8px; }
        .simple-footer { margin-top: 6px; text-align: center; font-size: 10px; }
        .simple-footer-strong { font-weight: 700; }
        ${tightSimpleInset ? 'body { padding-left: 1mm !important; padding-right: 1mm !important; } @media print { body { padding-left: 1mm !important; padding-right: 1mm !important; } } .receipt-payment-simple.receipt-content { left: -0.5mm !important; }' : ''}
        @media print {
          .receipt-payment-simple.receipt-content { left: 0 !important; }
        }
      `,
    })
  }
  const taxCustType = taxInvoice
    ? taxInvoice.customerType === 'company'
      ? tr('posTaxCustomerCorporate', '법인')
      : tr('posTaxCustomerIndividual', '개인')
    : ''
  const taxInvoiceBlock = taxInvoice
    ? `
        <div class="tax-invoice-premium">
          <div class="tax-invoice-header">${esc(tr('posReceiptTaxInvoice', '세금계산서'))}</div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posTaxCustomerTypeLabel', '구분'))}</span><span>${esc(taxCustType)}</span></div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posName', '이름'))}</span><span>${esc(taxInvoice.name)}</span></div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posTaxIdLabel', 'Tax ID'))}</span><span>${esc(taxInvoice.taxId)}</span></div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posBranchLabel', '지점'))}</span><span>${esc(taxInvoice.branchNo || (taxInvoice.customerType === 'company' ? '00000' : tr('posHeadOffice', '본점')))}</span></div>
          <div class="tax-invoice-row tax-invoice-addr"><span class="tax-invoice-label">${esc(tr('settings_address', '주소'))}</span><span>${esc(taxInvoice.address)}</span></div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posPhone', '전화번호'))}</span><span>${esc(taxInvoice.phone)}</span></div>
          <div class="tax-invoice-row"><span class="tax-invoice-label">${esc(tr('posTaxEmailLabel', 'E-mail'))}</span><span>${esc(taxInvoice.email)}</span></div>
        </div>`
    : ''
  const printContent = `
      <div class="receipt-content receipt-payment ${isTaxInvoice ? 'receipt-tax-invoice' : ''}">
        <div class="receipt-brand-wrap text-center">
          ${showLogo ? `<img src="${esc(logoUrl)}" alt="Company logo" class="receipt-brand-logo ${esc(d.receiptLogoSize)}" />` : ''}
          <div class="receipt-store-name">${esc(receiptData.storeCode)}</div>
        </div>
        <div class="receipt-divider"></div>
        ${
          d.receiptShowTitle
            ? `<div class="receipt-title-block"><div class="receipt-section-title">${esc(tr('posReceipt', '영수증'))}</div><div class="receipt-sub-title">${esc(taxInvoice ? tr('posReceiptTaxInvoice', '세금계산서') : tr('posReceiptSimpleTaxInvoice', '간이 세금계산서'))}</div></div>`
            : ''
        }
        <div class="text-xs">
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderNo', '주문번호'))}</span><span class="receipt-meta-value receipt-order-no-print">${esc(formatPosReceiptOrderNoDisplay({ posOrderNo: receiptData.orderNo, tableName: receiptData.tableName, memo: receiptData.memo }))}</span></div>
          ${
            tableForPrint
              ? `<div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posTable', '테이블'))}</span><span class="receipt-meta-value">${escapeHtmlReceiptEmphasizeChannelTokenAfterHash(tableForPrint)}</span></div>`
              : ''
          }
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('date', 'Date'))}</span><span class="receipt-meta-value">${esc(printedAtStr)}</span></div>
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderType', 'Order Type'))}</span><span class="receipt-meta-value">${esc(orderTypeLabels[receiptData.orderType] || receiptData.orderType)}</span></div>
        </div>
        <div class="receipt-divider"></div>
        ${(d.receiptBizName || d.receiptBizTaxId || d.receiptBizAbn || d.receiptBizOwner || d.receiptBizAddress || d.receiptBizPhone) ? '<div class="text-xs receipt-muted receipt-biz-wrap">' : ''}
        ${d.receiptBizName ? `<div class="receipt-biz" style="color:#000;font-weight:600">${esc(d.receiptBizName)}</div>` : ''}
        ${d.receiptBizTaxId ? `<div class="receipt-biz">${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(d.receiptBizTaxId)}</div>` : ''}
        ${d.receiptBizAbn ? `<div class="receipt-biz">ABN: ${esc(d.receiptBizAbn)}</div>` : ''}
        ${d.receiptBizOwner ? `<div class="receipt-biz">${esc(tr('posOwner', '대표'))}: ${esc(d.receiptBizOwner)}</div>` : ''}
        ${d.receiptBizAddress ? `<div class="receipt-biz">${esc(d.receiptBizAddress)}</div>` : ''}
        ${d.receiptBizPhone ? `<div class="receipt-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(d.receiptBizPhone)}</div>` : ''}
        ${(d.receiptBizName || d.receiptBizTaxId || d.receiptBizAbn || d.receiptBizOwner || d.receiptBizAddress || d.receiptBizPhone) ? '</div>' : ''}
        ${taxInvoiceBlock}
        <div class="receipt-divider-strong"></div>
        <div class="receipt-item-head"><span>${esc(tr('posMenuName', '품목'))}</span><span>${esc(tr('amount', '금액'))}</span></div>
        ${itemsForPrint
          .map((it) => {
            const lineNote = normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
            const itemCode = posReceiptItemSkuForBarcode(it.id)
            const itemBarcodeUrl = d.itemBarcode && itemCode ? buildCode128BarcodeUrl(itemCode) : ''
            const promoComposeLines =
              Array.isArray(it.promoItems) && it.promoItems.length > 0
                ? it.promoItems.slice(0, 16).map((pi) => {
                    const menuName =
                      menus.find((m) => String(m.id) === String(pi.menuId))?.name?.trim() ||
                      `#${String(pi.menuId)}`
                    return `${menuName} x${Math.max(1, Number(pi.quantity) || 1)}`
                  })
                : []
            const promoComposeMoreCount =
              Array.isArray(it.promoItems) && it.promoItems.length > 16
                ? Math.max(0, it.promoItems.length - 16)
                : 0
            const noteHtml = lineNote
              ? `<div class="receipt-line-note">${esc(tr('posLineNote', '메모'))}: ${esc(lineNote)}</div>`
              : ''
            const promoComposeHtml =
              promoComposeLines.length > 0
                ? `<div class="receipt-line-note">${promoComposeLines
                    .map((line) => `- ${esc(translatePosMenuLineForReceipt(line, t))}`)
                    .join('<br/>')}${promoComposeMoreCount > 0 ? `<br/>+${promoComposeMoreCount}</div>` : '</div>'}`
                : ''
            const barcodeHtml = itemBarcodeUrl
              ? `<div class="text-center" style="margin: 3px 0 5px 0;"><img src="${esc(itemBarcodeUrl)}" alt="Item barcode" style="width: 100%; max-width: 100%; height: auto; object-fit: contain;" /></div>`
              : ''
            return `<div class="receipt-row"><span>${it.qty}x ${esc(translatePosMenuLineForReceipt(it.name, t))}</span><span>${formatBahtNum(it.price * it.qty)}</span></div>${promoComposeHtml}${noteHtml}${barcodeHtml}`
          })
          .join('')}
        <div class="receipt-divider"></div>
        <div class="receipt-row"><span class="receipt-muted">${esc(t('posSubtotal') || '소계')}</span><span>${formatBahtNum(receiptData.subtotal)}</span></div>
        ${receiptData.discountAmt > 0 ? `<div class="receipt-row"><span>${esc(t('posDiscount') || '할인')}</span><span>-${formatBahtNum(receiptData.discountAmt)}</span></div>` : ''}
        ${(receiptData.deliveryFee ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posDeliveryFee') || '배달 수수료')}</span><span>+${formatBahtNum(receiptData.deliveryFee)}</span></div>` : ''}
        ${(receiptData.packagingFee ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posPackagingFee') || '포장 수수료')}</span><span>+${formatBahtNum(receiptData.packagingFee)}</span></div>` : ''}
        ${(receiptData.vatFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posVatLabel') || '부가세')}</span><span>${receiptData.vatFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.vatFeeAmt)}</span></div>` : ''}
        ${(receiptData.serviceFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posServiceFee') || '서비스비')}</span><span>${receiptData.serviceFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.serviceFeeAmt)}</span></div>` : ''}
        ${(receiptData.cardFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posCardFee') || '카드비')}</span><span>${receiptData.cardFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.cardFeeAmt)}</span></div>` : ''}
        ${(receiptData.otherFeeAmt ?? 0) > 0 ? `<div class="receipt-row"><span>${esc(t('posOtherFee') || '기타')}</span><span>${receiptData.otherFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.otherFeeAmt)}</span></div>` : ''}
        ${parsedMemo.plainMemo ? `<div class="memo">${esc(tr('posCustomerMemo', '메모'))}: ${esc(parsedMemo.plainMemo)}</div>` : ''}
        <div class="receipt-divider-strong"></div>
        <div class="receipt-row receipt-total"><span>${esc(tr('posTotal', '합계'))}</span><span>${formatBahtNum(receiptData.total)}</span></div>
        <div class="receipt-divider"></div>
        ${paymentBreakdownGridHtml}
        ${receiptBarcodeUrl ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(receiptBarcodeUrl)}" alt="Receipt barcode" style="width: 100%; max-width: 100%; height: auto; object-fit: contain;" /></div>` : ''}
        ${d.signatureLine && isPaymentReceipt && isTaxInvoice ? `<div style="margin-top: 8px; margin-bottom: 8px; font-size: 11px; color:#000;"><div>${esc(tr('posSignature', '서명'))}: ____________________</div></div>` : ''}
        ${d.receiptShowPaidStamp ? `<div class="paid-stamp-wrap"><span class="paid-stamp">${esc(tr('posReceiptPaid', '결제완료'))}</span></div>` : ''}
        ${showMembershipQr ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(membershipQrSrc)}" alt="Membership QR" style="width:84px;height:84px;object-fit:contain;" />${membershipQrText ? `<div class="text-xs receipt-muted" style="margin-top:2px;">${esc(membershipQrText)}</div>` : ''}</div>` : ''}
        ${showStamp ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(d.receiptStampImageUrl)}" alt="Company stamp" style="width:72px;height:72px;object-fit:contain;" /></div>` : ''}
        ${footerPrimaryText || footerSecondaryText ? '<div class="text-center text-xs receipt-muted">' : ''}
        ${footerPrimaryText ? `<div style="font-weight:600;color:#000">${esc(footerPrimaryText)}</div>` : ''}
        ${footerSecondaryText ? `<div>${esc(footerSecondaryText)}</div>` : ''}
        ${footerPrimaryText || footerSecondaryText ? '</div>' : ''}
      </div>
    `
  return buildReceiptDocumentHtml({
    title: t('posReceipt') || '영수증',
    htmlLang: lang,
    bodyContent: printContent,
    extraStyles: `
        .receipt-brand-wrap { text-align: center; }
        .receipt-brand-logo { display: inline-block; width: 120px; height: auto; object-fit: contain; filter: grayscale(100%) contrast(1.15); }
        .receipt-brand-logo.sm { width: 84px; }
        .receipt-brand-logo.md { width: 108px; }
        .receipt-brand-logo.lg { width: 132px; }
        .receipt-pay-title { font-size: 11px; font-weight: 700; margin: 4px 0 2px; color: #000; }
        .receipt-store-name { margin-top: 4px; font-size: 11px; color: #000; text-align: center; font-weight: 700; }
        .receipt-order-no-print { color: #000 !important; font-weight: 700 !important; }
        .receipt-line-note { font-size: 10px; font-weight: 600; color: #333; padding-left: 2mm; margin: -2px 0 4px 0; line-height: 1.35; }
        .receipt-biz { margin: 2px 0; font-size: 11px; color: #000; }
        .tax-invoice-premium { border: 2px solid #000; padding: 8px 10px; margin-top: 8px; background: #fff; color: #000; }
        .tax-invoice-header { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #000; text-align: center; color: #000; }
        .tax-invoice-row { display: grid; grid-template-columns: 22mm minmax(0, 1fr); gap: 4px; margin: 4px 0; font-size: 11px; color: #000; }
        .tax-invoice-row.tax-invoice-addr { grid-template-columns: 22mm minmax(0,1fr); word-break: break-word; }
        .tax-invoice-label { font-weight: 600; color: #000; }
        .receipt-tax-invoice .receipt-section-title { font-size: 13px; }
        .receipt-tax-invoice .receipt-sub-title { font-size: 12px; font-weight: 700; }
        /* 메타(주문번호·테이블·일시): 화면 미리보기·인쇄 공통 — 값 우측 정렬은 긴 배달 문자열이 잘림 → flex + 좌측 정렬 */
        .receipt-payment .receipt-meta-row { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: flex-start; justify-content: flex-start; width: 100%; max-width: 100%; overflow: visible; margin: 3px 0; padding: 0; column-gap: 3mm; box-sizing: border-box; }
        .receipt-payment .receipt-meta-row::after { content: none; display: none; }
        .receipt-payment .receipt-meta-label { float: none; flex: 0 0 auto; max-width: 42%; min-width: 0; padding-right: 0; white-space: normal; }
        .receipt-payment .receipt-meta-value { float: none; flex: 1 1 0; min-width: 0; max-width: none; text-align: left; width: auto; box-sizing: border-box; }
        /* 일부 하이브리드+드라이버 조합(CP-802 등)에서 CSS grid/mm 폭 조합이 깨지는 경우 → 인쇄 시 금액 행만 float 2열로 고정 */
        @media print {
          .receipt-payment { position: static !important; left: 0 !important; width: 100% !important; max-width: 100% !important; }
          .receipt-payment .receipt-row::after,
          .receipt-payment .receipt-item-head::after,
          .receipt-payment .tax-invoice-row::after { content: "" !important; display: table !important; clear: both !important; }
          .receipt-payment .receipt-row,
          .receipt-payment .receipt-item-head { display: block !important; width: 100% !important; overflow: hidden !important; margin: 4px 0 !important; padding: 0 !important; column-gap: 0 !important; grid-template-columns: none !important; }
          .receipt-payment .receipt-row > span:first-child,
          .receipt-payment .receipt-item-head > span:first-child { float: left !important; max-width: calc(100% - ${RECEIPT_AMOUNT_COL_MM}mm - ${RECEIPT_GRID_COL_GAP_PX}px) !important; padding-right: ${RECEIPT_GRID_COL_GAP_PX}px !important; text-align: left !important; min-width: 0 !important; }
          .receipt-payment .receipt-row > span:last-child,
          .receipt-payment .receipt-item-head > span:last-child { float: right !important; max-width: ${RECEIPT_AMOUNT_COL_MM}mm !important; text-align: right !important; white-space: normal !important; min-width: 0 !important; }
          .receipt-payment .receipt-meta-row { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; align-items: flex-start !important; justify-content: flex-start !important; width: 100% !important; max-width: 100% !important; overflow: visible !important; margin: 3px 0 !important; padding: 0 !important; column-gap: 3mm !important; grid-template-columns: none !important; box-sizing: border-box !important; }
          .receipt-payment .receipt-meta-row::after { content: none !important; display: none !important; }
          .receipt-payment .receipt-meta-label { float: none !important; flex: 0 0 auto !important; max-width: 42% !important; padding-right: 0 !important; white-space: normal !important; min-width: 0 !important; }
          .receipt-payment .receipt-meta-value { float: none !important; flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; text-align: left !important; width: auto !important; box-sizing: border-box !important; }
          .receipt-payment .tax-invoice-row { display: block !important; width: 100% !important; overflow: hidden !important; margin: 4px 0 !important; grid-template-columns: none !important; }
          .receipt-payment .tax-invoice-row > .tax-invoice-label { float: left !important; max-width: 34% !important; padding-right: 4px !important; min-width: 0 !important; }
          .receipt-payment .tax-invoice-row > span:last-child { float: right !important; max-width: 64% !important; text-align: left !important; min-width: 0 !important; }
        }
      `,
  })
}
