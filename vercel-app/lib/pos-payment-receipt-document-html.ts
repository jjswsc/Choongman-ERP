/**
 * 결제(손님) 영수증 전체 HTML — PosReceiptModal·영수증 관리 재인쇄 공통
 */

import type { PosMenu, PosMenuOption, PosPrinterSettings } from '@/lib/api-client'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { buildPosTaxInvoiceThermalHtml, parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import {
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  resolveTaxInvoiceReceiptVatBreakdown,
} from '@/lib/pos-pricing'
import { buildPosReceiptVatPrintLabelEscaped } from '@/lib/pos-receipt-vat-print-label'
import { escapeHtml, formatBahtNum } from '@/lib/utils'
import {
  expandBanbanComposeLineForPrint,
  filterReceiptOptionLinesForBanban,
  parseBanbanFlavorsFromName,
} from '@/lib/pos-banban-utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import {
  buildReceiptChannelOrderNoHeaderHtml,
  formatPosReceiptOrderNoDisplay,
  pickPosChannelOrderNo,
  resolvePosReceiptOrderNoRaw,
  resolveReceiptDeliveryPaymentChannelCode,
  resolveReceiptTableForPrint,
} from '@/lib/pos-delivery-platform'
import { posReceiptItemSkuForBarcode } from '@/lib/pos-receipt-barcode'
import { lineNoteDuplicatesOptions, normalizePosLineNote } from '@/lib/pos-line-note'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import { resolvePosPrintLayoutCalibration } from '@/lib/pos-print-layout-calibration'
import {
  buildReceiptVoidBannerHtml,
  POS_RECEIPT_VOID_EXTRA_STYLES,
} from '@/lib/pos-void-receipt'
import { RECEIPT_AMOUNT_COL_MM, RECEIPT_GRID_COL_GAP_PX } from '@/lib/pos-receipt-layout'
import {
  buildOptionNameByCodeFromMenus,
  collectGrabPrintOptionLines,
  enrichGrabPromoItemsForPrint,
  formatGrabOptionFragmentForPrint,
  formatGrabOrderLineNoteForPrint,
  formatGrabPromoComposeLinesForPrint,
  isGrabInboundPosOrder,
  GRAB_ECO_CUTLERY_RECEIPT_PRINT_CSS,
  GRAB_ECO_CUTLERY_RECEIPT_SIMPLE_CSS,
  buildGrabEcoCutleryReceiptPrintHtml,
  buildGrabEcoCutleryReceiptPrintSimpleRowHtml,
  resolveGrabEcoCutleryReceiptPrintLabelFromItems,
  resolveGrabPrintNoteRequestWithoutEco,
  resolveGrabItemPrintNote,
} from '@/lib/grab-pos-order-enrich'
import {
  buildKitchenMenuNameLookup,
  resolveKitchenMenuNameFromLookup,
} from '@/lib/pos-kitchen-menu-display-name'
import { mergeSetChildrenForReceipt } from '@/lib/pos-hall-order-receipt-document-html'
import { splitPosPrintItemLine } from '@/lib/pos-print-item-line'
import { formatPosOrderNoDigitsOnly } from '@/lib/pos-order-no'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
import {
  allocateDiscountExcludingDrinksAndPromos,
  isCollabDiscountReasonText,
} from '@/lib/pos-collab-discount'
import {
  shouldForceSimplePaymentReceiptForStore,
  shouldForcePaymentReceiptLogoForStore,
  shouldUseLegacyAlignedPaymentReceiptForStore,
} from '@/lib/pos-receipt-store-flags'
import { resolveCashTenderReceiptLines } from '@/lib/pos-receipt-cash-tender'
import {
  buildPaymentReceiptMemberFooterHtml,
  PAYMENT_RECEIPT_MEMBER_BLOCK_CSS,
} from '@/lib/pos-receipt-member-block'
import { resolveMembershipQrLinkUrl, resolveReceiptAssetUrl } from '@/lib/pos-membership-qr-defaults'
import { buildCode128SvgDataUri } from '@/lib/barcode-code128-svg'
import { buildQrDataUri, peekCachedQrDataUri } from '@/lib/qr-svg-sync'

/** 결제 영수증 전용: 2열 grid/table을 쓰지 않고 품명·금액을 세로 블록으로만 배치 (OEM 프린터 분열 방지) */
function receiptPayLine(nameInnerHtml: string, amtInnerHtml: string, extraClass = ''): string {
  const cls = `receipt-pay-line${extraClass ? ` ${extraClass}` : ''}`
  return `<div class="${cls}"><div class="receipt-pay-line-name">${nameInnerHtml}</div><div class="receipt-pay-line-amt">${amtInnerHtml}</div></div>`
}

function receiptSubtotalAndVatForPrint(
  receiptData: ReceiptModalData,
  isTaxInvoice: boolean
): { subtotalPrint: number; vatPrint: number } {
  if (isTaxInvoice) {
    const breakdown = resolveTaxInvoiceReceiptVatBreakdown({
      total: receiptData.total,
      vatFeeAmt: receiptData.vatFeeAmt,
      receiptVatDisplayAmt: receiptData.receiptVatDisplayAmt,
    })
    if (breakdown) {
      return { subtotalPrint: breakdown.subtotalBeforeVat, vatPrint: breakdown.vat }
    }
  }

  const vatPrint = resolveReceiptVatPrintAmount({
    vatFeeAmt: receiptData.vatFeeAmt,
    receiptVatDisplayAmt: receiptData.receiptVatDisplayAmt,
  })
  const subtotalPrint = resolveReceiptSubtotalPrintAmount({
    subtotal: receiptData.subtotal,
    discountAmt: receiptData.discountAmt,
    deliveryFee: receiptData.deliveryFee,
    packagingFee: receiptData.packagingFee,
    vatFeeMode: receiptData.vatFeeMode,
    receiptExclusiveSubtotalDisplay: receiptData.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: receiptData.receiptTaxableGrossForDisplay,
  })
  return { subtotalPrint, vatPrint }
}

function extractDutchSplitBadgeFromMemo(rawMemo: string): {
  plainMemo: string
  splitBadgeLabel: string
} {
  const text = String(rawMemo || '')
  if (!text) return { plainMemo: '', splitBadgeLabel: '' }
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
  let splitBadgeLabel = ''
  const kept: string[] = []
  for (const line of lines) {
    const m = line.match(/^\[DUTCH_SPLIT\]\s*(.+)$/i)
    if (m && m[1]) {
      splitBadgeLabel = m[1].trim()
      continue
    }
    kept.push(line)
  }
  return { plainMemo: kept.join('\n'), splitBadgeLabel }
}

/** @deprecated 외부 API 호출 — buildCode128BarcodeDataUri 사용 */
export function buildCode128BarcodeUrl(raw: string): string {
  return buildCode128BarcodeDataUri(raw)
}

/** Code128 바코드를 로컬 SVG data URI로 생성 (네트워크 불필요) */
export function buildCode128BarcodeDataUri(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  return buildCode128SvgDataUri(text, { barHeight: 38, scale: 2, includeText: true })
}

/** 결제 완료 영수증: 사용된 수단 라벨 (0 초과만, 금액은 합계에 이미 표시) */
function collectReceiptPaymentMethodLabels(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string
): string[] {
  const labels: string[] = []
  const cash = Math.max(0, Number(receiptData.paymentCash ?? 0) || 0)
  const card = Math.max(0, Number(receiptData.paymentCard ?? 0) || 0)
  const qr = Math.max(0, Number(receiptData.paymentQr ?? 0) || 0)
  const other = Math.max(0, Number(receiptData.paymentOther ?? 0) || 0)
  const del = Math.max(0, Number(receiptData.paymentDeliveryApp ?? 0) || 0)
  const eps = 0.005
  if (cash > eps) labels.push(tr('posPaymentCash', 'Cash'))
  if (card > eps) labels.push(tr('posPaymentCard', 'Card'))
  if (qr > eps) labels.push(tr('posPaymentQrCode', 'QR'))
  if (other > eps) labels.push(tr('posPaymentOther', 'Other'))
  if (del > eps) {
    const ch = resolveReceiptDeliveryPaymentChannelCode({
      deliveryAppCode: receiptData.deliveryAppCode,
      deliveryPaymentChannel: receiptData.deliveryPaymentChannel,
      tableName: receiptData.tableName,
      memo: receiptData.memo,
      orderNo: receiptData.orderNo,
      itemDeliveryAppCodes: receiptData.items?.map((it) =>
        'deliveryAppCode' in it ? (it as { deliveryAppCode?: string }).deliveryAppCode : undefined
      ),
    })
    labels.push(
      ch
        ? `${tr('posPaymentDeliveryApp', 'Delivery app')} (${ch})`
        : tr('posPaymentDeliveryApp', 'Delivery app')
    )
  }
  return labels
}

function buildCashTenderReceiptRowsHtml(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string,
  paymentRowHtml: (label: string, value: string, extraClass?: string) => string
): string {
  const lines = resolveCashTenderReceiptLines({
    paymentCash: receiptData.paymentCash,
    paymentCashTendered: receiptData.paymentCashTendered,
  })
  if (!lines) return ''
  return [
    paymentRowHtml(escapeHtml(tr('posReceiptCashCharge', 'Charge')), formatBahtNum(lines.charge)),
    paymentRowHtml(
      escapeHtml(tr('posReceiptCashPaidAmount', 'Paid Amount(Cash)')),
      formatBahtNum(lines.paidCash)
    ),
    paymentRowHtml(escapeHtml(tr('posReceiptCashChange', 'Change')), formatBahtNum(lines.change)),
  ].join('')
}

function buildCashTenderReceiptSimpleLinesHtml(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string,
  esc: (value: string) => string
): string {
  const lines = resolveCashTenderReceiptLines({
    paymentCash: receiptData.paymentCash,
    paymentCashTendered: receiptData.paymentCashTendered,
  })
  if (!lines) return ''
  return [
    `<div class="simple-line"><b>${esc(tr('posReceiptCashCharge', 'Charge'))}</b>: ${formatBahtNum(lines.charge)}</div>`,
    `<div class="simple-line"><b>${esc(tr('posReceiptCashPaidAmount', 'Paid Amount(Cash)'))}</b>: ${formatBahtNum(lines.paidCash)}</div>`,
    `<div class="simple-line"><b>${esc(tr('posReceiptCashChange', 'Change'))}</b>: ${formatBahtNum(lines.change)}</div>`,
  ].join('')
}

function buildAppliedCouponDiscountRowsHtml(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string,
  paymentRowHtml: (label: string, value: string, extraClass?: string) => string
): string {
  const coupons = receiptData.appliedCoupons ?? []
  if (!coupons.length) return ''
  return coupons
    .map((row) => {
      const qty = Math.max(1, Math.trunc(Number(row.quantity ?? 1) || 1))
      const label = `${tr('posPaymentSectionCoupon', '쿠폰')} ${row.code}${qty > 1 ? `×${qty}` : ''}`
      return paymentRowHtml(escapeHtml(label), `-${formatBahtNum(Math.max(0, Number(row.discountAmt ?? 0) || 0))}`)
    })
    .join('')
}

function resolveDiscountReceiptLabel(
  receiptData: ReceiptModalData,
  tr: (key: string, fallback: string) => string
): string {
  const defaultLabel = tr('posDiscount', '할인')
  const collabLabel = tr('posCollabDiscount', '협업 할인')
  const reason = String(receiptData.discountReason ?? '').trim().toLowerCase()
  if (!reason) return defaultLabel

  const collabNeedles = [
    collabLabel.toLowerCase(),
    '협업',
    'collab',
    'collaboration',
  ].filter(Boolean)
  if (collabNeedles.some((needle) => reason.includes(needle))) return collabLabel
  return defaultLabel
}

function allocateDiscountByItem(
  items: ReceiptModalData['items'],
  totalDiscount: number
): number[] {
  const discount = Math.max(0, Number(totalDiscount) || 0)
  if (!Array.isArray(items) || items.length === 0 || discount <= 0.0001) return []
  const lineTotals = items.map((it) => Math.max(0, (Number(it.price) || 0) * (Number(it.qty) || 0)))
  const gross = lineTotals.reduce((sum, v) => sum + v, 0)
  if (gross <= 0.0001) return items.map(() => 0)

  const out = items.map(() => 0)
  let used = 0
  const to2 = (n: number) => Math.round(n * 100) / 100
  for (let i = 0; i < items.length; i += 1) {
    if (i === items.length - 1) {
      out[i] = to2(Math.max(0, discount - used))
      break
    }
    const share = to2((discount * lineTotals[i]) / gross)
    out[i] = share
    used = to2(used + share)
  }
  return out
}

function resolveLineDiscountsForReceipt(
  items: ReceiptModalData['items'],
  totalDiscount: number,
  enabled: boolean,
  discountReason?: string
): number[] {
  if (!enabled || !Array.isArray(items) || items.length === 0) return []
  const total = Math.max(0, Number(totalDiscount) || 0)
  const collabReason = isCollabDiscountReasonText(String(discountReason ?? ''))
  const toReceiptAllocLines = (list: ReceiptModalData['items']) =>
    (list || []).map((it) => ({
      name: it.name,
      price: Number(it.price) || 0,
      qty: Number(it.qty) || 1,
      menuId: it.menuId,
      promoId: it.promoId,
    }))
  const hasSavedLineDiscount = items.some((it) => Math.max(0, Number(it.lineDiscountAmt ?? 0) || 0) > 0.0001)
  if (hasSavedLineDiscount) {
    const saved = items.map((it) => Math.max(0, Number(it.lineDiscountAmt ?? 0) || 0))
    const savedSum = saved.reduce((sum, v) => sum + v, 0)
    if (collabReason && total > 0.0001 && Math.abs(savedSum - total) > 0.02) {
      return allocateDiscountExcludingDrinksAndPromos(toReceiptAllocLines(items), total)
    }
    return saved
  }
  if (collabReason) {
    return allocateDiscountExcludingDrinksAndPromos(toReceiptAllocLines(items), total)
  }
  return allocateDiscountByItem(items, totalDiscount)
}

export type PosPaymentReceiptDesignResolved = {
  receiptBizName: string
  receiptBizTaxId: string
  receiptBizAbn: string
  receiptBizOwner: string
  receiptBizAddress: string
  receiptBizPhone: string
  receiptShowBizAddress: boolean
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
  receiptShowBizAddress: false,
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
    receiptShowBizAddress: Boolean(s?.receiptShowBizAddress),
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
  /** Grab 등 option_code → 표시명 (미전달 시 menus·menuOptions로 구성) */
  optionNameByCode?: Map<string, string> | Record<string, string>
  menuOptions?: PosMenuOption[]
  /**
   * 멤버십 QR img src (data URI 권장).
   * 미지정 시 링크는 로컬 캐시만 사용하고 quickchart 등 외부 URL은 쓰지 않음.
   */
  membershipQrSrcOverride?: string
}

/** 멤버십 QR: 로컬 data URI 우선(네트워크 대기 없음). */
export async function resolvePaymentReceiptMembershipQrSrc(params: {
  receiptShowMembershipQr: boolean
  receiptMembershipQrLinkUrl: string
  receiptMembershipQrImageUrl: string
  origin: string
  membershipQrSrcOverride?: string
}): Promise<string> {
  if (params.membershipQrSrcOverride) return String(params.membershipQrSrcOverride || '').trim()
  if (!params.receiptShowMembershipQr) return ''
  const link = resolveMembershipQrLinkUrl(
    String(params.receiptMembershipQrLinkUrl || '').trim(),
    params.origin
  )
  if (link) {
    const local = await buildQrDataUri(link, 180)
    if (local) return local
  }
  return resolveReceiptAssetUrl(String(params.receiptMembershipQrImageUrl || '').trim(), params.origin)
}

/** 인쇄용: 멤버십 QR을 로컬로 만든 뒤 HTML 생성 (Electron loadFile 지연 방지). */
export async function buildPosPaymentReceiptDocumentHtmlAsync(
  params: BuildPosPaymentReceiptDocumentHtmlParams
): Promise<string> {
  const d = resolvePaymentReceiptDesign(params.printerSettings, params.designOverride)
  const membershipQrSrcOverride =
    params.membershipQrSrcOverride ||
    (await resolvePaymentReceiptMembershipQrSrc({
      receiptShowMembershipQr: d.receiptShowMembershipQr,
      receiptMembershipQrLinkUrl: d.receiptMembershipQrLinkUrl,
      receiptMembershipQrImageUrl: d.receiptMembershipQrImageUrl,
      origin: params.origin,
    }))
  return buildPosPaymentReceiptDocumentHtml({
    ...params,
    membershipQrSrcOverride,
  })
}

export function buildPosPaymentReceiptDocumentHtml(params: BuildPosPaymentReceiptDocumentHtmlParams): string {
  const {
    receiptData,
    menus,
    orderTypeLabels,
    t,
    lang,
    origin,
    printedAt,
    printerSettings,
    designOverride,
    forceSimpleTextMode,
    optionNameByCode: optionNameByCodeParam,
    menuOptions,
    membershipQrSrcOverride,
  } = params
  const receiptPrintLayout = resolvePosPrintLayoutCalibration(printerSettings).receipt
  const optionNameByCode =
    optionNameByCodeParam instanceof Map
      ? optionNameByCodeParam
      : optionNameByCodeParam && typeof optionNameByCodeParam === 'object'
        ? new Map(Object.entries(optionNameByCodeParam))
        : buildOptionNameByCodeFromMenus(menus, menuOptions ?? [])
  const menuNameLookup = buildKitchenMenuNameLookup(menus)
  const menuNameByCode = new Map<string, string>()
  for (const menu of menus) {
    const code = String(menu.code ?? '').trim().toUpperCase()
    const name = String(menu.name ?? '').trim()
    if (!code || !name || menuNameByCode.has(code)) continue
    menuNameByCode.set(code, name)
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
  const resolveMenuNameByIdOrCode = (menuIdRaw: unknown, menuNameRaw: unknown): string => {
    const menuId = String(menuIdRaw ?? '').trim()
    const fromName = String(menuNameRaw ?? '').trim()
    const placeholderToken = parsePromoMenuPlaceholderToken(fromName)
    const candidates = [menuId, placeholderToken].filter(Boolean)
    for (const candidate of candidates) {
      const fromLookup = resolveKitchenMenuNameFromLookup(candidate, menuNameLookup, '')
      if (fromLookup) return fromLookup
      const byId = menus.find((m) => String(m.id) === candidate)?.name?.trim() || ''
      if (byId) return byId
      const byCode = menuNameByCode.get(candidate.toUpperCase()) || ''
      if (byCode) return byCode
    }
    if (fromName && !placeholderToken) return fromName
    return ''
  }
  const resolvePromoMenuNameForPrint = (pi: { menuId?: string | null; menuName?: unknown }) => {
    return resolveMenuNameByIdOrCode(pi.menuId, pi.menuName)
  }
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  const esc = (value: string) => escapeHtml(String(value || ''))
  const discountReceiptLabel = resolveDiscountReceiptLabel(receiptData, tr)
  const couponDiscountTotal = (receiptData.appliedCoupons ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.discountAmt ?? 0) || 0),
    0
  )
  const showCouponDiscountRows =
    printerSettings?.discountSeparatePrint !== false && (receiptData.appliedCoupons?.length ?? 0) > 0
  const nonCouponDiscountAmt = Math.max(0, Number(receiptData.discountAmt ?? 0) - couponDiscountTotal)
  const grabInboundReceipt = isGrabInboundPosOrder({
    memo: receiptData.memo,
    deliveryAppCode: receiptData.deliveryAppCode,
    items: receiptData.items,
  })
  const channelOrderPick = pickPosChannelOrderNo({
    tableName: receiptData.tableName,
    orderNo: receiptData.orderNo,
    memo: receiptData.memo,
  })
  const tableForPrint = receiptData.tableName
    ? resolveReceiptTableForPrint({
        tableName: receiptData.tableName,
        channelPick: channelOrderPick,
        translate: (raw) => translateReceiptTableDisplayName(raw, t),
      })
    : ''
  const orderNoHeaderHtml = buildReceiptChannelOrderNoHeaderHtml({
    posOrderNo: receiptData.orderNo,
    tableName: receiptData.tableName,
    memo: receiptData.memo,
    esc,
  })
  const parsedMemo = parsePosOrderMemo(receiptData.memo)
  const { plainMemo: plainMemoForPrint, splitBadgeLabel } = extractDutchSplitBadgeFromMemo(parsedMemo.plainMemo)
  const taxInvoice = parsedMemo.taxInvoice
  const d = resolvePaymentReceiptDesign(printerSettings ?? null, designOverride)
  const logoUrl = d.receiptLogoImageUrl || `${origin}/company-stamp.png`
  const isPaymentReceipt =
    !receiptData.receiptAutoPrintContext || receiptData.receiptAutoPrintContext === 'payment'
  const showBizCoreOnReceipt = isPaymentReceipt
  const showBizAddressOnReceipt = isPaymentReceipt && d.receiptShowBizAddress
  const hasBizCoreBlock =
    showBizCoreOnReceipt &&
    Boolean(
      d.receiptBizName ||
        d.receiptBizAbn ||
        d.receiptBizTaxId ||
        d.receiptBizPhone ||
        (showBizAddressOnReceipt && d.receiptBizAddress)
    )
  const voidMode = Boolean(receiptData.voidReceiptMode)
  const forceSimple =
    typeof forceSimpleTextMode === 'boolean'
      ? forceSimpleTextMode
      : shouldForceSimplePaymentReceiptForStore(receiptData.storeCode)
  const useLegacyAligned = !forceSimple && shouldUseLegacyAlignedPaymentReceiptForStore(receiptData.storeCode)
  const forceReceiptLogo = shouldForcePaymentReceiptLogoForStore(receiptData.storeCode)
  const paymentRowHtml = (nameInnerHtml: string, amtInnerHtml: string, extraClass = '') =>
    useLegacyAligned
      ? `<div class="receipt-row${extraClass ? ` ${extraClass}` : ''}"><span>${nameInnerHtml}</span><span>${amtInnerHtml}</span></div>`
      : receiptPayLine(nameInnerHtml, amtInnerHtml, extraClass)
  const receiptMetaRowHtml = (labelInnerHtml: string, valueInnerHtml: string, extraClass = '') =>
    useLegacyAligned
      ? `<div class="receipt-meta-row${extraClass ? ` ${extraClass}` : ''}"><span class="receipt-meta-label receipt-muted">${labelInnerHtml}</span><span class="receipt-meta-value">${valueInnerHtml}</span></div>`
      : `<div class="receipt-pay-meta${extraClass ? ` ${extraClass}` : ''}"><div class="receipt-pay-meta-l receipt-muted">${labelInnerHtml}</div><div class="receipt-pay-meta-v">${valueInnerHtml}</div></div>`
  const lineDiscountAlloc = resolveLineDiscountsForReceipt(
    receiptData.items || [],
    receiptData.discountAmt,
    isPaymentReceipt,
    receiptData.discountReason
  )
  const payMethodLabels = isPaymentReceipt ? collectReceiptPaymentMethodLabels(receiptData, tr) : []
  const payMethodsInline =
    payMethodLabels.length > 0 ? payMethodLabels.map((label) => esc(label)).join(', ') : ''
  /** 수단이 한 건도 저장되지 않은 결제 영수증: 하단에 안내(현금/카드 등 미표시 방지) */
  const showPaymentChannelFallback =
    isPaymentReceipt &&
    payMethodLabels.length === 0 &&
    Math.max(0, Number(receiptData.total) || 0) > 0.005
  const paymentRowsHtml =
    payMethodsInline
      ? `
        <div class="receipt-divider"></div>
        ${receiptMetaRowHtml(esc(tr('posReceiptPaymentMethods', 'Payment')), payMethodsInline)}
      `
      : ''
  const paymentChannelFallbackHtml = showPaymentChannelFallback
    ? `
        <div class="receipt-divider"></div>
        <div class="text-xs text-center" style="font-weight:700;margin:4px 0 2px 0;color:#000;line-height:1.4">${esc(
          tr('posReceiptPaymentChannelUnspecified', 'Payment channel: not recorded in system')
        )}</div>
      `
    : ''
  const paymentSimpleLine = payMethodsInline
    ? `<div class="simple-line"><b>${esc(tr('posReceiptPaymentMethods', 'Payment'))}</b>: ${payMethodsInline}</div>`
    : ''
  const cashTenderReceiptRowsHtml = isPaymentReceipt && !voidMode
    ? buildCashTenderReceiptRowsHtml(receiptData, tr, paymentRowHtml)
    : ''
  const cashTenderReceiptSimpleHtml = isPaymentReceipt && !voidMode
    ? buildCashTenderReceiptSimpleLinesHtml(receiptData, tr, esc)
    : ''
  const voidBannerHtml = voidMode ? buildReceiptVoidBannerHtml(tr) : ''
  const showLogo = isPaymentReceipt && (d.receiptShowLogo || forceReceiptLogo)
  const footerPrimaryText =
    String(d.receiptFooterPrimaryText || '').trim() ||
    (d.receiptShowThankYou ? tr('posReceiptThankYou', '감사합니다') : '')
  const footerSecondaryText =
    String(d.receiptFooterSecondaryText || '').trim() ||
    (d.receiptShowCustomerCopy ? tr('posReceiptCustomerCopy', '고객용') : '')
  const showStamp = Boolean(d.receiptShowStamp && d.receiptStampImageUrl && (!d.receiptStampOnlyTaxInvoice || taxInvoice))
  const membershipQrLinkResolved = resolveMembershipQrLinkUrl(
    String(d.receiptMembershipQrLinkUrl || '').trim(),
    origin
  )
  /** quickchart 등 외부 URL 금지 — Electron loadFile이 이미지 대기하며 ~10초 지연 */
  const membershipQrSrc =
    String(membershipQrSrcOverride || '').trim() ||
    (membershipQrLinkResolved ? peekCachedQrDataUri(membershipQrLinkResolved, 180) : '') ||
    resolveReceiptAssetUrl(String(d.receiptMembershipQrImageUrl || ''), origin)
  const showMembershipQr = Boolean(d.receiptShowMembershipQr && membershipQrSrc)
  const membershipQrText = String(d.receiptMembershipQrText || '').trim()
  const memberFooterHtml =
    isPaymentReceipt && !voidMode
      ? buildPaymentReceiptMemberFooterHtml({
          receiptData,
          showMembershipQr,
          membershipQrSrc: String(membershipQrSrc || ''),
          membershipQrText,
          tr,
          esc,
        })
      : ''
  const receiptOrderNoRaw = resolvePosReceiptOrderNoRaw({
    posOrderNo: receiptData.orderNo,
    tableName: receiptData.tableName,
    memo: receiptData.memo,
  })
  const posOrderNoDigits = formatPosOrderNoDigitsOnly(String(receiptData.orderNo ?? '').trim())
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
  const { subtotalPrint, vatPrint } = receiptSubtotalAndVatForPrint(receiptData, isTaxInvoice)
  const showVatRow = vatPrint > 0.0001
  const vatPrintLabelEscaped = buildPosReceiptVatPrintLabelEscaped({
    vatFeeMode: receiptData.vatFeeMode,
    t,
    tr,
    esc,
  })
  if (forceSimple) {
    const lineDiscountAllocSimple = resolveLineDiscountsForReceipt(
      receiptData.items || [],
      receiptData.discountAmt,
      isPaymentReceipt,
      receiptData.discountReason
    )
    const orderTypeLabel = orderTypeLabels[normalizePosOrderTypeKey(receiptData.orderType)] || receiptData.orderType
    const menuCodeByMenuId = Object.fromEntries(
      menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
    )
    const grabInbound = isGrabInboundPosOrder({
      memo: receiptData.memo,
      deliveryAppCode: receiptData.deliveryAppCode,
      items: receiptData.items,
    })
    const mergedItems = mergeSetChildrenForReceipt(
      receiptData.items as Parameters<typeof mergeSetChildrenForReceipt>[0],
      { grabInbound, optionNameByCode }
    )
    const itemRows = (mergedItems || [])
      .map((it, idx) => {
        const banban = parseBanbanFlavorsFromName(it.name)
        const baseLineSplit = splitPosPrintItemLine(it.name)
        const displayName = banban
          ? translatePosMenuLineForReceipt(banban.baseName, t)
          : translatePosMenuLineForReceipt(baseLineSplit.mainName || it.name, t)
        const amt = formatBahtNum((Number(it.price) || 0) * (Number(it.qty) || 0))
        const main = `<tr><td class="simple-item-name">${Number(it.qty) || 1}x ${esc(displayName)}</td><td class="simple-item-amt">${amt}</td></tr>`
        const lineDiscount = Math.max(0, Number(lineDiscountAllocSimple[idx] ?? 0) || 0)
        const lineDiscountRow =
          !grabInbound && lineDiscount > 0.0001
            ? `<tr><td class="simple-item-name simple-item-sub" colspan="2">${esc(tr('posDiscount', '할인'))}: -${formatBahtNum(lineDiscount)}</td></tr>`
            : ''
        const promoRows =
          Array.isArray(it.promoItems) && it.promoItems.length > 0
            ? enrichGrabPromoItemsForPrint(
                it.promoItems.slice(0, 8).map((pi) => ({
                  menuId: String(pi.menuId || ''),
                  optionId: pi.optionId,
                  optionCode: (pi as { optionCode?: string | null }).optionCode ?? null,
                  optionName: String((pi as { optionName?: unknown }).optionName ?? '').trim() || null,
                  menuName:
                    String((pi as { menuName?: unknown }).menuName ?? '').trim() ||
                    resolvePromoMenuNameForPrint(pi),
                  quantity: Math.max(1, Number(pi.quantity) || 1),
                })),
                { optionNameByCode, menuCodeByMenuId }
              )
            : []
        const promoComposeLines =
          promoRows.length > 0
            ? promoRows.flatMap((pi) => {
                const menuName =
                  resolvePromoMenuNameForPrint(pi) ||
                  `#${String(pi.menuId)}`
                const optCode = String((pi as { optionCode?: unknown }).optionCode ?? '').trim()
                const optName =
                  String((pi as { optionName?: unknown }).optionName ?? '').trim() ||
                  (optCode
                    ? formatGrabOrderLineNoteForPrint(`optc:${optCode}`, optionNameByCode)
                    : '')
                return formatGrabPromoComposeLinesForPrint(
                  {
                    menuName: translatePosMenuLineForReceipt(menuName, t),
                    optionName: optName
                      ? translatePosMenuLineForReceipt(
                          formatGrabOptionFragmentForPrint(optName, optionNameByCode),
                          t
                        )
                      : '',
                    quantity: Math.max(1, Number(pi.quantity) || 1),
                    parentItemName: translatePosMenuLineForReceipt(displayName, t),
                  },
                  grabInbound
                )
              })
            : []
        const promoComposeLinesExpanded = promoComposeLines.flatMap(
          (line) => expandBanbanComposeLineForPrint(line) ?? [line]
        )
        const grabPrintNote = grabInbound ? resolveGrabItemPrintNote(it) : String(it.note ?? '')
        const grabOptionLines = grabInbound
          ? collectGrabPrintOptionLines({
              note: grabPrintNote,
              optionFragment: baseLineSplit.optionLine,
              optionNameByCode,
            }).map((line) => translatePosMenuLineForReceipt(line, t))
          : []
        const baseOptionLine =
          grabOptionLines.length > 0
            ? grabOptionLines
            : !banban && baseLineSplit.optionLine
              ? [
                  translatePosMenuLineForReceipt(
                    formatGrabOptionFragmentForPrint(baseLineSplit.optionLine, optionNameByCode),
                    t
                  ),
                ]
              : []
        const banbanFlavorLines = banban
          ? [
              translatePosMenuLineForReceipt(banban.flavor1, t),
              translatePosMenuLineForReceipt(banban.flavor2, t),
            ]
          : []
        const receiptOptionLines = banban
          ? filterReceiptOptionLinesForBanban(baseOptionLine, banban)
          : baseOptionLine
        const lineNote = grabInbound
          ? resolveGrabPrintNoteRequestWithoutEco(grabPrintNote, optionNameByCode, t)
          : normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
        const detailLines = [...receiptOptionLines, ...banbanFlavorLines, ...promoComposeLinesExpanded]
        const detailRows = detailLines
          .map(
            (line) =>
              `<tr><td class="simple-item-name simple-item-sub" colspan="2">- ${esc(line)}</td></tr>`
          )
          .join('')
        const noteRow = lineNote
          ? `<tr><td class="simple-item-name simple-item-sub" colspan="2">${esc(tr('posLineNote', '메모'))}: ${esc(lineNote)}</td></tr>`
          : ''
        return main + lineDiscountRow + detailRows + noteRow
      })
      .join('')
    const grabDiscountPrintAmt = showCouponDiscountRows
      ? nonCouponDiscountAmt
      : Math.max(0, Number(receiptData.discountAmt ?? 0) || 0)
    const grabBundleDiscountSimple =
      grabInbound && grabDiscountPrintAmt > 0.0001
        ? `<tr><td class="simple-item-name simple-item-sub" colspan="2">${esc(tr('posDiscount', '할인'))}: -${formatBahtNum(grabDiscountPrintAmt)}</td></tr>`
        : ''
    const grabCutleryChecklistRow =
      grabInbound && mergedItems.length > 0
        ? buildGrabEcoCutleryReceiptPrintSimpleRowHtml(
            resolveGrabEcoCutleryReceiptPrintLabelFromItems(mergedItems),
            esc
          )
        : ''
    const summaryRows = [
      `<tr><td class="simple-k">${esc(t('posSubtotal') || '소계')}</td><td class="simple-v">${formatBahtNum(subtotalPrint)}</td></tr>`,
      receiptData.discountAmt > 0
        ? `${
            showCouponDiscountRows
              ? buildAppliedCouponDiscountRowsHtml(receiptData, tr, (label, value) =>
                  `<tr><td class="simple-k">${label}</td><td class="simple-v">${value}</td></tr>`
                )
              : ''
          }${
            !grabInbound &&
            (showCouponDiscountRows ? nonCouponDiscountAmt : receiptData.discountAmt) > 0
              ? `<tr><td class="simple-k">${esc(discountReceiptLabel)}</td><td class="simple-v">-${formatBahtNum(showCouponDiscountRows ? nonCouponDiscountAmt : receiptData.discountAmt)}</td></tr>`
              : ''
          }`
        : '',
      (receiptData.deliveryFee ?? 0) > 0
        ? `<tr><td class="simple-k">${esc(t('posDeliveryFee') || '배달 수수료')}</td><td class="simple-v">+${formatBahtNum(receiptData.deliveryFee)}</td></tr>`
        : '',
      (receiptData.packagingFee ?? 0) > 0
        ? `<tr><td class="simple-k">${esc(t('posPackagingFee') || '포장 수수료')}</td><td class="simple-v">+${formatBahtNum(receiptData.packagingFee)}</td></tr>`
        : '',
      showVatRow
        ? `<tr><td class="simple-k">${vatPrintLabelEscaped}</td><td class="simple-v">${formatBahtNum(vatPrint)}</td></tr>`
        : '',
    ]
      .filter(Boolean)
      .join('')
    const simpleHtml = `
      <div class="receipt-content receipt-payment-simple">
        <div class="simple-title">${esc(tr('posReceipt', '영수증'))}</div>
        ${
          splitBadgeLabel
            ? `<div class="simple-split-badge">${esc(splitBadgeLabel)}</div>`
            : ''
        }
        ${
          taxInvoice
            ? `<div class="simple-tax-subtitle">${esc(tr('posReceiptTaxInvoice', '세금계산서'))}</div>`
            : ''
        }
        <div class="simple-line"><b>${esc(tr('posOrderNo', '주문번호'))}</b>: ${orderNoHeaderHtml}</div>
        <div class="simple-line"><b>${esc(tr('date', 'Date'))}</b>: ${esc(printedAtStr)}</div>
        ${
          posOrderNoDigits
            ? `<div class="simple-line"><b>${esc(tr('posOrderNo', '주문번호'))}</b>: ${esc(posOrderNoDigits)}</div>`
            : ''
        }
        <div class="simple-line"><b>${esc(tr('posOrderType', 'Order Type'))}</b>: ${esc(orderTypeLabel)}</div>
        ${tableForPrint ? `<div class="simple-line"><b>${esc(tr('posTable', '테이블'))}</b>: ${esc(tableForPrint)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizName ? `<div class="simple-line simple-biz">${esc(d.receiptBizName)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizAbn ? `<div class="simple-line simple-biz">${esc(tr('posPosIdLabel', 'POS ID'))}: ${esc(d.receiptBizAbn)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizTaxId ? `<div class="simple-line simple-biz">${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(d.receiptBizTaxId)}</div>` : ''}
        ${showBizAddressOnReceipt && d.receiptBizAddress ? `<div class="simple-line simple-biz">${esc(d.receiptBizAddress)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizPhone ? `<div class="simple-line simple-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(d.receiptBizPhone)}</div>` : ''}
        ${taxInvoice ? buildPosTaxInvoiceThermalHtml({ taxInvoice, esc, tr }) : ''}
        ${voidBannerHtml}
        <div class="simple-divider"></div>
        <table class="simple-table">${grabBundleDiscountSimple}${itemRows}${grabCutleryChecklistRow}</table>
        <div class="simple-divider"></div>
        <table class="simple-table simple-summary">${summaryRows}</table>
        <div class="simple-total">${esc(tr('posTotal', '합계'))}: ${formatBahtNum(receiptData.total)}</div>
        ${
          voidMode
            ? `<div class="simple-total">${esc(tr('posReceiptVoidAmount', 'Void Amount'))}: ${formatBahtNum(receiptData.total)}</div>`
            : ''
        }
        ${cashTenderReceiptSimpleHtml ? `<div class="simple-divider"></div>${cashTenderReceiptSimpleHtml}` : ''}
        ${
          paymentSimpleLine
            ? `<div class="simple-divider"></div>${paymentSimpleLine}`
            : showPaymentChannelFallback
              ? `<div class="simple-divider"></div><div class="simple-line" style="font-weight:700;text-align:center">${esc(
                  tr('posReceiptPaymentChannelUnspecified', 'Payment channel: not recorded in system')
                )}</div>`
              : ''
        }
        ${memberFooterHtml}
        ${
          footerPrimaryText || footerSecondaryText
            ? `<div class="simple-divider"></div><div class="simple-line" style="text-align:center">${
                footerPrimaryText ? `<div style="font-weight:800">${esc(footerPrimaryText)}</div>` : ''
              }${footerSecondaryText ? `<div>${esc(footerSecondaryText)}</div>` : ''}</div>`
            : ''
        }
      </div>
    `
    return buildReceiptDocumentHtml({
      title: t('posReceipt') || '영수증',
      htmlLang: lang,
      bodyContent: simpleHtml,
      printLayout: receiptPrintLayout,
      extraStyles: `
        .receipt-payment-simple { color: #000; font-weight: 700; }
        ${PAYMENT_RECEIPT_MEMBER_BLOCK_CSS}
        .simple-title { text-align: center; font-size: 13px; font-weight: 800; margin-bottom: 2px; color: #000; }
        .simple-tax-subtitle { text-align: center; font-size: 11px; font-weight: 800; margin: 0 0 4px 0; color: #000; }
        .simple-split-badge {
          margin: 0 auto 5px auto;
          padding: 2px 8px;
          width: fit-content;
          border: 1px solid #000;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .01em;
          color: #000;
          background: #fff;
        }
        .simple-line { font-size: 11px; line-height: 1.4; margin: 2px 0; word-break: break-word; font-weight: 700; color: #000; }
        .simple-biz { color: #000; font-weight: 700; }
        .simple-divider { border-top: 1px dashed #000; margin: 6px 0; }
        .simple-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .simple-table td { font-size: 11px; line-height: 1.4; padding: 1px 0; vertical-align: top; font-weight: 700; color: #000; }
        .simple-item-name { width: 72%; word-break: break-word; }
        .simple-item-amt { width: 28%; text-align: right; white-space: nowrap; }
        .simple-item-sub { font-weight: 700; color: #000; }
        ${GRAB_ECO_CUTLERY_RECEIPT_SIMPLE_CSS}
        ${GRAB_ECO_CUTLERY_RECEIPT_PRINT_CSS}
        .simple-k { width: 72%; }
        .simple-v { width: 28%; text-align: right; white-space: nowrap; }
        .simple-total { font-size: 12px; font-weight: 800; margin-top: 4px; color: #000; }
        .receipt-order-no-print { color: #000 !important; font-weight: 800 !important; font-size: 22px !important; line-height: 1.2 !important; }
        ${voidMode ? POS_RECEIPT_VOID_EXTRA_STYLES : ''}
      `,
    })
  }
  const taxInvoiceBlock = taxInvoice ? buildPosTaxInvoiceThermalHtml({ taxInvoice, esc, tr }) : ''
  const printContent = `
      <div class="receipt-content receipt-payment${useLegacyAligned ? ' receipt-payment--legacy-safe' : ''} ${isTaxInvoice ? 'receipt-tax-invoice' : ''}">
        <div class="receipt-brand-wrap text-center">
          ${showLogo ? `<img src="${esc(logoUrl)}" alt="Company logo" class="receipt-brand-logo ${esc(d.receiptLogoSize)}" />` : ''}
        </div>
        <div class="receipt-divider"></div>
        ${
          d.receiptShowTitle
            ? taxInvoice
              ? `<div class="receipt-title-block"><div class="receipt-section-title">${esc(tr('posReceipt', '영수증'))}</div><div class="receipt-sub-title">${esc(tr('posReceiptTaxInvoice', '세금계산서'))}</div></div>`
              : `<div class="receipt-title-block"><div class="receipt-section-title">${esc(tr('posReceiptSimpleTaxInvoice', '영수증/간이 세금계산서'))}</div></div>`
            : ''
        }
        ${
          splitBadgeLabel
            ? `<div class="receipt-split-badge-wrap"><span class="receipt-split-badge">${esc(splitBadgeLabel)}</span></div>`
            : ''
        }
        <div class="text-xs">
          ${receiptMetaRowHtml(
            esc(tr('posOrderNo', '주문번호')),
            orderNoHeaderHtml
          )}
          ${
            tableForPrint
              ? receiptMetaRowHtml(
                  esc(tr('posTable', '테이블')),
                  esc(tableForPrint)
                )
              : ''
          }
          ${receiptMetaRowHtml(esc(tr('date', 'Date')), esc(printedAtStr))}
          ${
            posOrderNoDigits
              ? receiptMetaRowHtml(esc(tr('posOrderNo', '주문번호')), esc(posOrderNoDigits))
              : ''
          }
          ${receiptMetaRowHtml(
            esc(tr('posOrderType', 'Order Type')),
            esc(orderTypeLabels[normalizePosOrderTypeKey(receiptData.orderType)] || receiptData.orderType)
          )}
        </div>
        <div class="receipt-divider"></div>
        ${hasBizCoreBlock ? '<div class="text-xs receipt-muted receipt-biz-wrap">' : ''}
        ${showBizCoreOnReceipt && d.receiptBizName ? `<div class="receipt-biz" style="color:#000;font-weight:600">${esc(d.receiptBizName)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizAbn ? `<div class="receipt-biz">${esc(tr('posPosIdLabel', 'POS ID'))}: ${esc(d.receiptBizAbn)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizTaxId ? `<div class="receipt-biz">${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(d.receiptBizTaxId)}</div>` : ''}
        ${showBizAddressOnReceipt && d.receiptBizAddress ? `<div class="receipt-biz">${esc(d.receiptBizAddress)}</div>` : ''}
        ${showBizCoreOnReceipt && d.receiptBizPhone ? `<div class="receipt-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(d.receiptBizPhone)}</div>` : ''}
        ${hasBizCoreBlock ? '</div>' : ''}
        ${taxInvoiceBlock}
        <div class="receipt-divider-strong"></div>
        ${voidBannerHtml}
        ${
          useLegacyAligned
            ? `<div class="receipt-item-head"><span>${esc(tr('posMenuName', '품목'))}</span><span>${esc(tr('amount', '금액'))}</span></div>`
            : receiptPayLine(esc(tr('posMenuName', '품목')), esc(tr('amount', '금액')), 'receipt-pay-line--head')
        }
        ${(() => {
          const grabInbound = isGrabInboundPosOrder({
            memo: receiptData.memo,
            deliveryAppCode: receiptData.deliveryAppCode,
            items: receiptData.items,
          })
          const mergedLegacyItems = mergeSetChildrenForReceipt(
            receiptData.items as Parameters<typeof mergeSetChildrenForReceipt>[0],
            { grabInbound, optionNameByCode }
          )
          const itemsHtml = mergedLegacyItems
            .map((it, idx) => {
            const baseLineSplit = splitPosPrintItemLine(it.name)
            const grabPrintNote = grabInbound ? resolveGrabItemPrintNote(it) : String(it.note ?? '')
            const lineNote = grabInbound
              ? resolveGrabPrintNoteRequestWithoutEco(grabPrintNote, optionNameByCode, t)
              : normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
            const itemCode = posReceiptItemSkuForBarcode(it.id)
            const itemBarcodeUrl = d.itemBarcode && itemCode ? buildCode128BarcodeUrl(itemCode) : ''
            const banban = parseBanbanFlavorsFromName(it.name)
            const displayName = banban ? banban.baseName : baseLineSplit.mainName || it.name
            const menuCodeByMenuId = Object.fromEntries(
              menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
            )
            const promoRows =
              Array.isArray(it.promoItems) && it.promoItems.length > 0
                ? enrichGrabPromoItemsForPrint(
                    it.promoItems.slice(0, 8).map((pi) => ({
                      menuId: String(pi.menuId || ''),
                      optionId: pi.optionId,
                      optionCode: (pi as { optionCode?: string | null }).optionCode ?? null,
                      optionName: String((pi as { optionName?: unknown }).optionName ?? '').trim() || null,
                      menuName:
                        String((pi as { menuName?: unknown }).menuName ?? '').trim() ||
                        resolvePromoMenuNameForPrint(pi),
                      quantity: Math.max(1, Number(pi.quantity) || 1),
                    })),
                    { optionNameByCode, menuCodeByMenuId }
                  )
                : []
            const promoComposeLines =
              promoRows.length > 0
                ? promoRows.flatMap((pi) => {
                    const menuName =
                      resolvePromoMenuNameForPrint(pi) ||
                      `#${String(pi.menuId)}`
                    const optCode = String((pi as { optionCode?: unknown }).optionCode ?? '').trim()
                    const optName =
                      String((pi as { optionName?: unknown }).optionName ?? '').trim() ||
                      (optCode
                        ? formatGrabOrderLineNoteForPrint(`optc:${optCode}`, optionNameByCode)
                        : '')
                    return formatGrabPromoComposeLinesForPrint(
                      {
                        menuName: translatePosMenuLineForReceipt(menuName, t),
                        optionName: optName
                          ? translatePosMenuLineForReceipt(
                              formatGrabOptionFragmentForPrint(optName, optionNameByCode),
                              t
                            )
                          : '',
                        quantity: Math.max(1, Number(pi.quantity) || 1),
                        parentItemName: translatePosMenuLineForReceipt(displayName, t),
                      },
                      grabInbound
                    )
                  })
                : []
            const promoComposeLinesExpanded = promoComposeLines.flatMap(
              (line) => expandBanbanComposeLineForPrint(line) ?? [line]
            )
            const banbanFlavorLines = banban
              ? [
                  translatePosMenuLineForReceipt(banban.flavor1, t),
                  translatePosMenuLineForReceipt(banban.flavor2, t),
                ]
              : []
            const grabOptionLines = grabInbound
              ? collectGrabPrintOptionLines({
                  note: grabPrintNote,
                  optionFragment: baseLineSplit.optionLine,
                  optionNameByCode,
                }).map((line) => translatePosMenuLineForReceipt(line, t))
              : []
            const baseOptionLine =
              grabOptionLines.length > 0
                ? grabOptionLines
                : !banban && baseLineSplit.optionLine
                  ? [
                      translatePosMenuLineForReceipt(
                        formatGrabOptionFragmentForPrint(baseLineSplit.optionLine, optionNameByCode),
                        t
                      ),
                    ]
                  : []
            const receiptOptionLines = banban
              ? filterReceiptOptionLinesForBanban(baseOptionLine, banban)
              : baseOptionLine
            const noteHtml =
              lineNote &&
              !lineNoteDuplicatesOptions(lineNote, [...receiptOptionLines, ...banbanFlavorLines])
                ? `<div class="receipt-line-note">${esc(tr('posLineNote', '메모'))}: ${esc(lineNote)}</div>`
                : ''
            const lineDiscount = Math.max(0, Number(lineDiscountAlloc[idx] ?? 0) || 0)
            const lineDiscountHtml =
              !grabInbound && lineDiscount > 0.0001
                ? `<div class="receipt-line-note">${esc(tr('posDiscount', '할인'))}: -${formatBahtNum(lineDiscount)}</div>`
                : ''
            const promoComposeHtml =
              promoComposeLinesExpanded.length > 0
                ? `<div class="receipt-line-note">${promoComposeLinesExpanded
                    .map((line) => `- ${esc(line)}`)
                    .join('<br/>')}</div>`
                : ''
            const banbanComposeHtml =
              [...receiptOptionLines, ...banbanFlavorLines].length > 0
                ? `<div class="receipt-line-note">${[...receiptOptionLines, ...banbanFlavorLines]
                    .map((line) => `- ${esc(line)}`)
                    .join('<br/>')}</div>`
                : ''
            const barcodeHtml = itemBarcodeUrl
              ? `<div class="text-center" style="margin: 3px 0 5px 0;"><img src="${esc(itemBarcodeUrl)}" alt="Item barcode" style="width: 100%; max-width: 100%; height: auto; object-fit: contain;" /></div>`
              : ''
            return `${paymentRowHtml(
              `${Number(it.qty) || 1}x ${esc(translatePosMenuLineForReceipt(displayName, t))}`,
              formatBahtNum((Number(it.price) || 0) * (Number(it.qty) || 0))
            )}${lineDiscountHtml}${banbanComposeHtml}${promoComposeHtml}${noteHtml}${barcodeHtml}`
          })
            .join('')
          const cutleryHtml = grabInbound
            ? buildGrabEcoCutleryReceiptPrintHtml(
                resolveGrabEcoCutleryReceiptPrintLabelFromItems(mergedLegacyItems),
                esc
              )
            : ''
          const grabDiscountLegacyAmt = showCouponDiscountRows
            ? nonCouponDiscountAmt
            : Math.max(0, Number(receiptData.discountAmt ?? 0) || 0)
          const grabBundleDiscountLegacy =
            grabInbound && grabDiscountLegacyAmt > 0.0001
              ? paymentRowHtml(
                  esc(tr('posDiscount', '할인')),
                  `-${formatBahtNum(grabDiscountLegacyAmt)}`
                )
              : ''
          return grabBundleDiscountLegacy + itemsHtml + cutleryHtml
        })()}
        <div class="receipt-divider"></div>
        ${paymentRowHtml(`<span class="receipt-muted">${esc(t('posSubtotal') || '소계')}</span>`, formatBahtNum(subtotalPrint))}
        ${showCouponDiscountRows ? buildAppliedCouponDiscountRowsHtml(receiptData, tr, paymentRowHtml) : ''}
        ${!grabInboundReceipt && (showCouponDiscountRows ? nonCouponDiscountAmt : receiptData.discountAmt) > 0 ? paymentRowHtml(esc(discountReceiptLabel), `-${formatBahtNum(showCouponDiscountRows ? nonCouponDiscountAmt : receiptData.discountAmt)}`) : ''}
        ${(receiptData.deliveryFee ?? 0) > 0 ? paymentRowHtml(esc(t('posDeliveryFee') || '배달 수수료'), `+${formatBahtNum(receiptData.deliveryFee)}`) : ''}
        ${(receiptData.packagingFee ?? 0) > 0 ? paymentRowHtml(esc(t('posPackagingFee') || '포장 수수료'), `+${formatBahtNum(receiptData.packagingFee)}`) : ''}
        ${showVatRow ? paymentRowHtml(vatPrintLabelEscaped, formatBahtNum(vatPrint)) : ''}
        ${(receiptData.serviceFeeAmt ?? 0) > 0 ? paymentRowHtml(esc(t('posServiceFee') || '서비스비'), `${receiptData.serviceFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.serviceFeeAmt)}`) : ''}
        ${(receiptData.cardFeeAmt ?? 0) > 0 ? paymentRowHtml(esc(t('posCardFee') || '카드비'), `${receiptData.cardFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.cardFeeAmt)}`) : ''}
        ${(receiptData.otherFeeAmt ?? 0) > 0 ? paymentRowHtml(esc(t('posOtherFee') || '기타'), `${receiptData.otherFeeMode === 'separate' ? '+' : ''}${formatBahtNum(receiptData.otherFeeAmt)}`) : ''}
        ${plainMemoForPrint ? `<div class="memo">${esc(tr('posCustomerMemo', '메모'))}: ${esc(plainMemoForPrint)}</div>` : ''}
        ${paymentRowHtml(
          esc(tr('posTotal', '합계')),
          formatBahtNum(receiptData.total),
          useLegacyAligned ? 'receipt-total' : 'receipt-pay-line--total'
        )}
        ${
          voidMode
            ? paymentRowHtml(
                esc(tr('posReceiptVoidAmount', 'Void Amount')),
                formatBahtNum(receiptData.total),
                useLegacyAligned ? 'receipt-total' : 'receipt-pay-line--total'
              )
            : ''
        }
        ${cashTenderReceiptRowsHtml ? '<div class="receipt-divider"></div>' : ''}${cashTenderReceiptRowsHtml}
        ${voidMode ? '' : `${paymentRowsHtml}${paymentChannelFallbackHtml}`}
        <div class="receipt-divider"></div>
        ${receiptBarcodeUrl ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(receiptBarcodeUrl)}" alt="Receipt barcode" style="width: 100%; max-width: 100%; height: auto; object-fit: contain;" /></div>` : ''}
        ${d.signatureLine && isPaymentReceipt && isTaxInvoice ? `<div style="margin-top: 8px; margin-bottom: 8px; font-size: 11px; color:#000;"><div>${esc(tr('posSignature', '서명'))}: ____________________</div></div>` : ''}
        ${d.receiptShowPaidStamp && !voidMode ? `<div class="paid-stamp-wrap"><span class="paid-stamp">${esc(tr('posReceiptPaid', '결제완료'))}</span></div>` : ''}
        ${memberFooterHtml}
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
    printLayout: receiptPrintLayout,
    extraStyles: `
        ${PAYMENT_RECEIPT_MEMBER_BLOCK_CSS}
        .receipt-brand-wrap { text-align: center; }
        .receipt-brand-logo { display: inline-block; width: 120px; height: auto; object-fit: contain; filter: grayscale(100%) contrast(1.35); }
        .receipt-brand-logo.sm { width: 84px; }
        .receipt-brand-logo.md { width: 108px; }
        .receipt-brand-logo.lg { width: 132px; }
        .receipt-store-name { margin-top: 4px; font-size: 11px; color: #000; text-align: center; font-weight: 800; }
        .receipt-title-block { margin: 4px 0 9px 0; }
        .receipt-divider-strong { margin: 10px 0; }
        .receipt-biz-wrap { line-height: 1.42; }
        .receipt-split-badge-wrap { text-align: center; margin: 2px 0 6px 0; }
        .receipt-split-badge {
          display: inline-block;
          border: 1.6px solid #000;
          border-radius: 999px;
          padding: 2px 10px;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.2;
          color: #000;
          background: #fff;
          letter-spacing: .02em;
        }
        .receipt-order-no-print { color: #000 !important; font-weight: 800 !important; font-size: 22px !important; line-height: 1.2 !important; }
        .receipt-payment { color: #000; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt-payment .receipt-line-note {
          font-size: 10px;
          font-weight: 700;
          color: #000 !important;
          padding-left: 2mm;
          margin: -2px 0 4px 0;
          line-height: 1.35;
        }
        ${GRAB_ECO_CUTLERY_RECEIPT_PRINT_CSS}
        .receipt-biz { margin: 2px 0; font-size: 11px; color: #000; font-weight: 700; }
        .receipt-tax-invoice .receipt-section-title { font-size: 13px; }
        .receipt-tax-invoice .receipt-sub-title { font-size: 12px; font-weight: 700; }
        .receipt-payment { position: static !important; left: 0 !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
        ${
          useLegacyAligned
            ? `
        .receipt-payment--legacy-safe .receipt-row,
        .receipt-payment--legacy-safe .receipt-item-head { display: table !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; break-inside: avoid; page-break-inside: avoid; }
        .receipt-payment--legacy-safe .receipt-row > span:first-child,
        .receipt-payment--legacy-safe .receipt-item-head > span:first-child { display: table-cell !important; width: auto !important; padding-right: ${RECEIPT_GRID_COL_GAP_PX}px !important; vertical-align: top !important; word-break: break-word; font-weight: 700; color: #000; }
        .receipt-payment--legacy-safe .receipt-row > span:last-child,
        .receipt-payment--legacy-safe .receipt-item-head > span:last-child { display: table-cell !important; width: ${RECEIPT_AMOUNT_COL_MM}mm !important; min-width: ${RECEIPT_AMOUNT_COL_MM}mm !important; max-width: ${RECEIPT_AMOUNT_COL_MM}mm !important; text-align: right !important; vertical-align: top !important; white-space: nowrap !important; font-weight: 700; color: #000; }
        .receipt-payment--legacy-safe .receipt-item-head { margin-top: 2px; font-weight: 800; color: #000; }
        .receipt-payment--legacy-safe .receipt-row { margin: 5px 0; }
        .receipt-payment--legacy-safe .receipt-total { margin-top: 10px; padding-top: 8px; border-top: 2px solid #000; font-weight: 800; }
        .receipt-payment--legacy-safe .receipt-meta-row { display: table !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; margin: 5px 0; }
        .receipt-payment--legacy-safe .receipt-meta-label { display: table-cell !important; width: 22mm !important; vertical-align: top !important; white-space: nowrap !important; padding-right: 3mm !important; font-size: 10px; font-weight: 700; line-height: 1.3; color: #000; }
        .receipt-payment--legacy-safe .receipt-meta-value { display: table-cell !important; width: auto !important; vertical-align: top !important; font-size: 11px; font-weight: 800; line-height: 1.38; color: #000; word-break: break-word; }
        `
            : `
        .receipt-payment .receipt-pay-meta { margin: 5px 0; break-inside: avoid; page-break-inside: avoid; }
        .receipt-payment .receipt-pay-meta-l { display: block; font-size: 10px; font-weight: 700; line-height: 1.3; color: #000; }
        .receipt-payment .receipt-pay-meta-v { display: block; font-size: 11px; font-weight: 800; color: #000; margin-top: 2px; line-height: 1.38; word-break: break-word; overflow-wrap: anywhere; }
        .receipt-payment .receipt-pay-line { display: block; width: 100%; max-width: 100%; box-sizing: border-box; margin: 5px 0; break-inside: avoid; page-break-inside: avoid; }
        .receipt-payment .receipt-pay-line-name { display: block; width: 100%; font-size: 11px; font-weight: 700; color: #000; line-height: 1.35; word-break: break-word; overflow-wrap: anywhere; }
        .receipt-payment .receipt-pay-line-amt { display: block; width: 100%; text-align: right; font-size: 11px; font-weight: 700; color: #000; margin-top: 2px; line-height: 1.2; }
        .receipt-payment .receipt-pay-line--head { margin-top: 2px; margin-bottom: 2px; }
        .receipt-payment .receipt-pay-line--head .receipt-pay-line-name { font-size: 10px; font-weight: 700; }
        .receipt-payment .receipt-pay-line--head .receipt-pay-line-amt { font-size: 10px; font-weight: 700; margin-top: 1px; }
        .receipt-payment .receipt-pay-line--total { margin-top: 10px; padding-top: 8px; border-top: 2px solid #000; }
        .receipt-payment .receipt-pay-line--total .receipt-pay-line-name,
        .receipt-payment .receipt-pay-line--total .receipt-pay-line-amt { font-size: 12px; font-weight: 800; }
        `
        }
        ${voidMode ? POS_RECEIPT_VOID_EXTRA_STYLES : ''}
      `,
  })
}
