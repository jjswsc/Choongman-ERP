'use client'
import { appAlert } from "@/lib/app-message"

import { useEffect, useRef, type RefObject } from 'react'
import { getPosPrinterSettings, type PosPrinterSettings } from '@/lib/api-client'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { escapeHtml, formatBahtNum } from '@/lib/utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import type { PosMenu } from '@/lib/api-client'
import { useLang } from '@/lib/lang-context'
import { tr as i18nTr } from '@/lib/i18n'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import {
  buildKitchenSlipDocumentHtml,
  resolveKitchenSlipDesign,
} from '@/lib/pos-kitchen-slip-html'
import { formatPosReceiptOrderNoDisplay, resolvePosReceiptOrderNoRaw } from '@/lib/pos-delivery-platform'
import { posReceiptItemSkuForBarcode } from '@/lib/pos-receipt-barcode'
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from '@/lib/pos-kitchen-slip-routing'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { buildReceiptDocumentHtml } from '@/lib/pos-receipt-html'
import {
  printPosHtmlDocument,
  POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  type PrintPosHtmlDocumentOptions,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type ReceiptModalData = {
  orderNo: string
  items: {
    id: string
    name: string
    price: number
    qty: number
    note?: string
    promoId?: string
    promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
  }[]
  subtotal: number
  discountAmt: number
  deliveryFee?: number
  packagingFee?: number
  total: number
  storeCode: string
  orderType: string
  tableName?: string
  memo?: string
  discountReason?: string
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  /** 모달 자동 영수증 인쇄 시 어떤 설정을 따를지 (주문/추가주문/결제) */
  receiptAutoPrintContext?: 'order' | 'add_order' | 'payment'
  /** 실시간/폴링 등에서 이미 자동 인쇄된 주문이면 모달 자동 인쇄 생략 */
  suppressReceiptModalAutoPrint?: boolean
}

function buildCode128BarcodeUrl(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  return `https://quickchart.io/barcode?type=code128&text=${encodeURIComponent(text)}&scale=2&height=38&includetext=true`
}

interface PosReceiptModalProps {
  onOpenChange: (open: boolean) => void
  receiptData: ReceiptModalData | null
  menus: PosMenu[]
  orderTypeLabels: Record<string, string>
  t: (k: string) => string
  autoPrintReceiptOnOrder?: boolean
  autoPrintReceiptOnAddOrder?: boolean
  autoPrintReceiptOnPayment?: boolean
  autoPrintKitchenSlipOnOrder?: boolean
  receiptBizName?: string
  receiptBizTaxId?: string
  receiptBizAbn?: string
  receiptBizOwner?: string
  receiptBizAddress?: string
  receiptBizPhone?: string
  receiptDesignStyle?: 'badge' | 'simple'
  receiptLogoSize?: 'sm' | 'md' | 'lg'
  receiptShowTitle?: boolean
  receiptShowPaidStamp?: boolean
  receiptShowThankYou?: boolean
  receiptShowCustomerCopy?: boolean
  receiptFooterPrimaryText?: string
  receiptFooterSecondaryText?: string
  receiptLogoImageUrl?: string
  receiptStampImageUrl?: string
  receiptShowStamp?: boolean
  receiptStampOnlyTaxInvoice?: boolean
  receiptMembershipQrImageUrl?: string
  receiptMembershipQrLinkUrl?: string
  receiptMembershipQrText?: string
  receiptShowMembershipQr?: boolean
  signatureLine?: boolean
  receiptBarcode?: boolean
  itemBarcode?: boolean
  /**
   * 매장에서 이미 불러 둔 프린터 설정(ref). 있으면 인쇄 클릭 시 await 없이 사용해
   * 사용자 제스처가 만료되어 print()가 무시되는 것을 완화합니다.
   */
  printerSettingsRef?: RefObject<PosPrinterSettings | null>
}

export function PosReceiptModal({
  onOpenChange,
  receiptData,
  menus,
  orderTypeLabels,
  t,
  autoPrintReceiptOnOrder = false,
  autoPrintReceiptOnAddOrder = false,
  autoPrintReceiptOnPayment = false,
  autoPrintKitchenSlipOnOrder = false,
  receiptBizName = '',
  receiptBizTaxId = '',
  receiptBizAbn = '',
  receiptBizOwner = '',
  receiptBizAddress = '',
  receiptBizPhone = '',
  receiptLogoSize = 'md',
  receiptShowTitle = true,
  receiptShowPaidStamp = true,
  receiptShowThankYou = true,
  receiptShowCustomerCopy = true,
  receiptFooterPrimaryText = "",
  receiptFooterSecondaryText = "",
  receiptLogoImageUrl = "",
  receiptStampImageUrl = "",
  receiptShowStamp = true,
  receiptStampOnlyTaxInvoice = true,
  receiptMembershipQrImageUrl = "",
  receiptMembershipQrLinkUrl = "",
  receiptMembershipQrText = "",
  receiptShowMembershipQr = false,
  signatureLine = false,
  receiptBarcode = false,
  itemBarcode = false,
  printerSettingsRef,
}: PosReceiptModalProps) {
  const { lang } = useLang()
  const autoPrintedKeyRef = useRef<string>('')
  const tr = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }

  const printInIframe = (
    fullHtml: string,
    title: string,
    preferSystemPrintDialog = false,
    thermal?: Pick<
      PrintPosHtmlDocumentOptions,
      'printRole' | 'printReceiptKind' | 'kitchenStation' | 'escPosCutOverride'
    >
  ) =>
    new Promise<void>((resolve, reject) => {
      const opts: PrintPosHtmlDocumentOptions = {
        title,
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        focusIframeBeforePrint: false,
        preferSystemPrintDialog,
        ...thermal,
        onPrintUnavailable: () => reject(new Error(t('posPrintUnavailable'))),
        onAfterCleanup: () => resolve(),
      }
      printPosHtmlDocument(fullHtml, opts)
    })

  const handlePrintReceipt = async (preferSystemPrintDialog = false) => {
    if (!receiptData) return
    const esc = (value: string) => escapeHtml(String(value || ''))
    const tableForPrint = receiptData.tableName
      ? translateReceiptTableDisplayName(receiptData.tableName, t)
      : ''
    const parsedMemo = parsePosOrderMemo(receiptData.memo)
    const taxInvoice = parsedMemo.taxInvoice
    const logoUrl = receiptLogoImageUrl || `${window.location.origin}/company-stamp.png`
    const isPaymentReceipt =
      !receiptData.receiptAutoPrintContext || receiptData.receiptAutoPrintContext === 'payment'
    const showLogo = isPaymentReceipt
    const footerPrimaryText =
      String(receiptFooterPrimaryText || '').trim() ||
      (receiptShowThankYou ? tr('posReceiptThankYou', '감사합니다') : '')
    const footerSecondaryText =
      String(receiptFooterSecondaryText || '').trim() ||
      (receiptShowCustomerCopy ? tr('posReceiptCustomerCopy', '고객용') : '')
    const showStamp = Boolean(receiptShowStamp && receiptStampImageUrl && (!receiptStampOnlyTaxInvoice || taxInvoice))
    const membershipQrSrc = String(receiptMembershipQrLinkUrl || '').trim()
      ? `https://quickchart.io/qr?text=${encodeURIComponent(String(receiptMembershipQrLinkUrl || '').trim())}&size=180&margin=1&format=png`
      : receiptMembershipQrImageUrl
    const showMembershipQr = Boolean(receiptShowMembershipQr && membershipQrSrc)
    const membershipQrText = String(receiptMembershipQrText || '').trim()
    const receiptOrderNoRaw = resolvePosReceiptOrderNoRaw({
      posOrderNo: receiptData.orderNo,
      tableName: receiptData.tableName,
      memo: receiptData.memo,
    })
    const receiptBarcodeUrl = receiptBarcode ? buildCode128BarcodeUrl(receiptOrderNoRaw) : ''
    const printedAt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
    /* 결제용 영수증: 로고 포함, 손님용. 세금계산서 시 프리미엄 디자인 */
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
          ${showLogo ? `<img src="${esc(logoUrl)}" alt="Company logo" class="receipt-brand-logo ${esc(receiptLogoSize)}" />` : ''}
          <div class="receipt-store-name">${esc(receiptData.storeCode)}</div>
        </div>
        <div class="receipt-divider"></div>
        ${
          receiptShowTitle
            ? `<div class="receipt-title-block"><div class="receipt-section-title">${esc(tr('posReceipt', '영수증'))}</div><div class="receipt-sub-title">${esc(taxInvoice ? tr('posReceiptTaxInvoice', '세금계산서') : tr('posReceiptSimpleTaxInvoice', '간이 세금계산서'))}</div></div>`
            : ''
        }
        <div class="text-xs">
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderNo', '주문번호'))}</span><span class="receipt-meta-value receipt-order-no-print">${esc(formatPosReceiptOrderNoDisplay({ posOrderNo: receiptData.orderNo, tableName: receiptData.tableName, memo: receiptData.memo }))}</span></div>
          ${
            tableForPrint
              ? `<div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posTable', '테이블'))}</span><span class="receipt-meta-value">${esc(tableForPrint)}</span></div>`
              : ''
          }
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('date', 'Date'))}</span><span class="receipt-meta-value">${esc(printedAt)}</span></div>
          <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${esc(tr('posOrderType', 'Order Type'))}</span><span class="receipt-meta-value">${esc(orderTypeLabels[receiptData.orderType] || receiptData.orderType)}</span></div>
        </div>
        <div class="receipt-divider"></div>
        ${(receiptBizName || receiptBizTaxId || receiptBizAbn || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '<div class="text-xs receipt-muted receipt-biz-wrap">' : ''}
        ${receiptBizName ? `<div class="receipt-biz" style="color:#000;font-weight:600">${esc(receiptBizName)}</div>` : ''}
        ${receiptBizTaxId ? `<div class="receipt-biz">${esc(tr('posTaxIdLabel', 'Tax ID'))}: ${esc(receiptBizTaxId)}</div>` : ''}
        ${receiptBizAbn ? `<div class="receipt-biz">ABN: ${esc(receiptBizAbn)}</div>` : ''}
        ${receiptBizOwner ? `<div class="receipt-biz">${esc(tr('posOwner', '대표'))}: ${esc(receiptBizOwner)}</div>` : ''}
        ${receiptBizAddress ? `<div class="receipt-biz">${esc(receiptBizAddress)}</div>` : ''}
        ${receiptBizPhone ? `<div class="receipt-biz">${esc(tr('posTelLabel', 'TEL'))}: ${esc(receiptBizPhone)}</div>` : ''}
        ${(receiptBizName || receiptBizTaxId || receiptBizAbn || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '</div>' : ''}
        ${taxInvoiceBlock}
        <div class="receipt-divider-strong"></div>
        <div class="receipt-item-head"><span>${esc(tr('posMenuName', '품목'))}</span><span>${esc(tr('amount', '금액'))}</span></div>
        ${receiptData.items
          .map((it) => {
            const lineNote = normalizePosLineNote(String(it.note ?? ''), { keepOptionSummary: false })
            const itemCode = posReceiptItemSkuForBarcode(it.id)
            const itemBarcodeUrl = itemBarcode && itemCode ? buildCode128BarcodeUrl(itemCode) : ''
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
        ${signatureLine && isPaymentReceipt && isTaxInvoice ? `<div style="margin-top: 8px; margin-bottom: 8px; font-size: 11px; color:#000;"><div>${esc(tr('posSignature', '서명'))}: ____________________</div></div>` : ''}
        ${receiptShowPaidStamp ? `<div class="paid-stamp-wrap"><span class="paid-stamp">${esc(tr('posReceiptPaid', '결제완료'))}</span></div>` : ''}
        ${showMembershipQr ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(membershipQrSrc)}" alt="Membership QR" style="width:84px;height:84px;object-fit:contain;" />${membershipQrText ? `<div class="text-xs receipt-muted" style="margin-top:2px;">${esc(membershipQrText)}</div>` : ''}</div>` : ''}
        ${showStamp ? `<div class="text-center" style="margin: 8px 0;"><img src="${esc(receiptStampImageUrl)}" alt="Company stamp" style="width:72px;height:72px;object-fit:contain;" /></div>` : ''}
        ${(footerPrimaryText || footerSecondaryText) ? '<div class="text-center text-xs receipt-muted">' : ''}
        ${footerPrimaryText ? `<div style="font-weight:600;color:#000">${esc(footerPrimaryText)}</div>` : ''}
        ${footerSecondaryText ? `<div>${esc(footerSecondaryText)}</div>` : ''}
        ${(footerPrimaryText || footerSecondaryText) ? '</div>' : ''}
      </div>
    `
    const fullHtml = buildReceiptDocumentHtml({
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
    try {
      const printReceiptKind =
        receiptData.receiptAutoPrintContext === 'order' || receiptData.receiptAutoPrintContext === 'add_order'
          ? 'hall_order'
          : 'payment'
      const hw =
        printerSettingsRef?.current ??
        (await getPosPrinterSettings({ storeCode: receiptData.storeCode }))
      await printInIframe(fullHtml, t('posReceipt') || '영수증', preferSystemPrintDialog, {
        printRole: 'receipt',
        printReceiptKind,
        escPosCutOverride: resolveEscPosCutOverride(hw, { printRole: 'receipt', printReceiptKind }),
      })
    } catch {
      await appAlert(t('posPrintBlockedBrowser'))
    }
  }

  const handlePrintKitchenSlip = async (preferSystemPrintDialog = false) => {
    if (!receiptData || !receiptData.storeCode) return
    try {
      const settings =
        printerSettingsRef?.current ??
        (await getPosPrinterSettings({ storeCode: receiptData.storeCode }))
      const slipLabels = {
        unified: t('posKitchenOrder') || '주방 주문서',
        kitchen1: `${t('posKitchen1') || '주방 1'}`,
        kitchen2: `${t('posKitchen2') || '주방 2'}`,
        kitchen3: `${t('posKitchen3') || '주방 3'}`,
      }
      const slips = buildKitchenSlipGroups(
        receiptData.items,
        { ...buildKitchenSlipGroupOpts(settings, menus, slipLabels), splitPromoKitchenLines: true }
      )
      if (slips.length === 0) {
        await appAlert(t('posKitchenNoItemsToPrint') || '주방으로 출력할 품목이 없습니다.')
        return
      }
      const slipDesign = resolveKitchenSlipDesign(settings)
      const kitchenOrderNoRaw = resolvePosReceiptOrderNoRaw({
        posOrderNo: receiptData.orderNo,
        tableName: receiptData.tableName,
        memo: receiptData.memo,
      })
      const printOne = async (idx: number): Promise<void> => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const kitchenMemo = parsePosOrderMemo(receiptData.memo).plainMemo
        const tablePart = receiptData.tableName
          ? ` · ${t('posTable') || '테이블'}: ${translateReceiptTableDisplayName(receiptData.tableName, t)}`
          : ''
        const memoLine =
          kitchenMemo.trim() ? `${t('posCustomerMemo') || '메모'}: ${kitchenMemo.trim()}` : ''
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: kitchenOrderNoRaw,
          storeCode: receiptData.storeCode,
          orderTypeLabel: orderTypeLabels[receiptData.orderType] || receiptData.orderType,
          tablePart,
          dateStr: formatPosDateTimeMedium(new Date(), lang),
          items: slip.items.map((it) => ({
            name: translatePosMenuLineForReceipt(it.name, t),
            qty: it.qty,
            note: it.note,
          })),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printColorAdjust: 'economy',
        })
        await printInIframe(html, slip.label, preferSystemPrintDialog, {
          printRole: 'kitchen',
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
          await printOne(idx + 1)
        }
      }
      await printOne(0)
    } catch (e) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
    }
  }

  const handlePrintReceiptRef = useRef(handlePrintReceipt)
  const handlePrintKitchenSlipRef = useRef(handlePrintKitchenSlip)
  handlePrintReceiptRef.current = handlePrintReceipt
  handlePrintKitchenSlipRef.current = handlePrintKitchenSlip

  useEffect(() => {
    if (!receiptData) return
    if (receiptData.suppressReceiptModalAutoPrint) return
    const ctx = receiptData.receiptAutoPrintContext
    const autoReceipt =
      ctx === 'payment'
        ? autoPrintReceiptOnPayment
        : ctx === 'add_order'
          ? (autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder)
          : ctx === 'order'
            ? autoPrintReceiptOnOrder
            : false
    // 주방 자동 인쇄는 "주문" 맥락에서만 (결제 완료 영수증 모달에서는 제외)
    const autoKitchenSlip =
      autoPrintKitchenSlipOnOrder && (ctx === 'order' || ctx === 'add_order')
    if (!autoReceipt && !autoKitchenSlip) return
    const key = `${receiptData.orderNo}|${receiptData.storeCode}|${receiptData.total}|${receiptData.items.length}`
    if (autoPrintedKeyRef.current === key) return
    autoPrintedKeyRef.current = key

    const id = window.setTimeout(() => {
      void (async () => {
        try {
          if (autoKitchenSlip) {
            await handlePrintKitchenSlipRef.current(false)
            if (autoReceipt) {
              await new Promise((r) => setTimeout(r, POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS))
              await handlePrintReceiptRef.current(false)
            }
          } else if (autoReceipt) {
            await handlePrintReceiptRef.current(false)
          }
        } catch {
          /* 인쇄 취소 등 */
        }
      })()
    }, 180)
    return () => window.clearTimeout(id)
  }, [
    receiptData,
    autoPrintReceiptOnOrder,
    autoPrintReceiptOnAddOrder,
    autoPrintReceiptOnPayment,
    autoPrintKitchenSlipOnOrder,
  ])

  /** 보조 POS 등 suppress 시 즉시 닫기 (수동 인쇄 UI 없음) */
  useEffect(() => {
    if (!receiptData?.suppressReceiptModalAutoPrint) return
    const id = requestAnimationFrame(() => onOpenChange(false))
    return () => cancelAnimationFrame(id)
  }, [receiptData?.suppressReceiptModalAutoPrint, receiptData, onOpenChange])

  if (!receiptData) return null
  if (receiptData.suppressReceiptModalAutoPrint) return null

  const ctxManual = receiptData.receiptAutoPrintContext
  const autoReceiptManual =
    ctxManual === 'payment'
      ? autoPrintReceiptOnPayment
      : ctxManual === 'add_order'
        ? (autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder)
        : ctxManual === 'order'
          ? autoPrintReceiptOnOrder
          : false
  const autoKitchenSlipManual =
    autoPrintKitchenSlipOnOrder && (ctxManual === 'order' || ctxManual === 'add_order')
  const showManualPrintDialog = !autoReceiptManual && !autoKitchenSlipManual
  const showKitchenButton =
    (ctxManual === 'order' || ctxManual === 'add_order') && receiptData.items.length > 0

  if (showManualPrintDialog) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onOpenChange(false)
        }}
      >
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{tr('posPrintManualTitle', '인쇄')}</DialogTitle>
            <DialogDescription>
              {tr(
                'posPrintManualHint',
                '인쇄할 항목을 선택하세요. 메인 포스에 설정된 영수증·주방 프린터로 인쇄되며, 자동 인쇄와 같은 크기(80mm 열전사 경로)로 나갑니다.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => void handlePrintReceipt(true)}
            >
              {tr('posPrintReceiptOnly', '영수증 인쇄')}
            </Button>
            {showKitchenButton && (
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void handlePrintKitchenSlip(true)}
              >
                {tr('posPrintKitchenOnly', '주방 주문서 인쇄')}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              {tr('posPrintClose', '닫기')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
