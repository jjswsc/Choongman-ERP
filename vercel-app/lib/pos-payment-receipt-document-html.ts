/**
 * 결제(손님) 영수증 전체 HTML — PosReceiptModal·영수증 관리 재인쇄 공통
 */

import type { PosMenu, PosPrinterSettings } from '@/lib/api-client'
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
  orderTypeLabels: Record<string, string>
  t: (k: string) => string
  lang: string
  origin: string
  /** 영수증 상단 일시(방콕 표기). 생략 시 즉시 시각 */
  printedAt?: Date
  printerSettings?: PosPrinterSettings | null
  /** 모달 등: API 설정 위에 덮어쓸 필드 */
  designOverride?: Partial<PosPaymentReceiptDesignResolved>
}

export function buildPosPaymentReceiptDocumentHtml(params: BuildPosPaymentReceiptDocumentHtmlParams): string {
  const { receiptData, menus, orderTypeLabels, t, lang, origin, printedAt, printerSettings, designOverride } = params
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
        ${receiptData.items
          .map((it) => {
            const lineNote = normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
            const itemCode = posReceiptItemSkuForBarcode(it.id)
            const itemBarcodeUrl = d.itemBarcode && itemCode ? buildCode128BarcodeUrl(itemCode) : ''
            const promoComposeLines =
              Array.isArray(it.promoItems) && it.promoItems.length > 0
                ? it.promoItems.slice(0, 4).map((pi) => {
                    const menuName =
                      menus.find((m) => String(m.id) === String(pi.menuId))?.name?.trim() ||
                      `#${String(pi.menuId)}`
                    return `${menuName} x${Math.max(1, Number(pi.quantity) || 1)}`
                  })
                : []
            const noteHtml = lineNote
              ? `<div class="receipt-line-note">${esc(tr('posLineNote', '메모'))}: ${esc(lineNote)}</div>`
              : ''
            const promoComposeHtml =
              promoComposeLines.length > 0
                ? `<div class="receipt-line-note">${promoComposeLines
                    .map((line) => `- ${esc(line)}`)
                    .join('<br/>')}</div>`
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
      `,
  })
}
