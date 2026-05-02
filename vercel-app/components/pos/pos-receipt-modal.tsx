'use client'
import { appAlert } from "@/lib/app-message"

import { useEffect, useRef, type RefObject } from 'react'
import { getPosPrinterSettings, type PosPrinterSettings } from '@/lib/api-client'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { escapeHtml } from '@/lib/utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import type { PosMenu } from '@/lib/api-client'
import { useLang } from '@/lib/lang-context'
import { tr as i18nTr } from '@/lib/i18n'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import {
  buildKitchenSlipDocumentHtml,
  resolveKitchenSlipDesign,
} from '@/lib/pos-kitchen-slip-html'
import { resolvePosReceiptOrderNoRaw } from '@/lib/pos-delivery-platform'
import { buildKitchenSlipGroupOpts, buildKitchenSlipGroups } from '@/lib/pos-kitchen-slip-routing'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import {
  printPosHtmlDocument,
  POS_THERMAL_AFTER_KITCHEN_TO_RECEIPT_MS,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  type PrintPosHtmlDocumentOptions,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import { Button } from '@/components/ui/button'
import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
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
    /** 줄 단위 배달 플랫폼(있으면 영수증 채널 유추에 사용) */
    deliveryAppCode?: string
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
  /** 결제 완료·재인쇄 영수증에 수단별 금액 표시 (주문 접수용 slip에는 생략) */
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  /** 주문의 `delivery_app_code` — 영수증 배달 채널 표시 시 결제 필드보다 우선 */
  deliveryAppCode?: string | null
  /** 모달 자동 영수증 인쇄 시 어떤 설정을 따를지 (주문/추가주문/결제) */
  receiptAutoPrintContext?: 'order' | 'add_order' | 'payment'
  /** 실시간/폴링 등에서 이미 자동 인쇄된 주문이면 모달 자동 인쇄 생략 */
  suppressReceiptModalAutoPrint?: boolean
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
  /** 주방 인쇄 시 프로모 세트 구성 스냅샷 보강(카탈로그·메뉴) — POS 터미널 등에서 전달 */
  kitchenPromoLineEnrich?: PosOrderReceiptLineOptions
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
  kitchenPromoLineEnrich,
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
    const fullHtml = buildPosPaymentReceiptDocumentHtml({
      receiptData,
      menus,
      orderTypeLabels,
      t,
      lang,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      printedAt: new Date(),
      forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(receiptData.storeCode),
      designOverride: {
        receiptBizName,
        receiptBizTaxId,
        receiptBizAbn,
        receiptBizOwner,
        receiptBizAddress,
        receiptBizPhone,
        receiptLogoSize,
        receiptShowTitle,
        receiptShowPaidStamp,
        receiptShowThankYou,
        receiptShowCustomerCopy,
        receiptFooterPrimaryText,
        receiptFooterSecondaryText,
        receiptLogoImageUrl,
        receiptStampImageUrl,
        receiptShowStamp,
        receiptStampOnlyTaxInvoice,
        receiptMembershipQrImageUrl,
        receiptMembershipQrLinkUrl,
        receiptMembershipQrText,
        receiptShowMembershipQr,
        signatureLine,
        receiptBarcode,
        itemBarcode,
        receiptShowLogo: true,
      },
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
      const itemsForKitchen = enrichPosOrderLikeItemsWithPromoSnapshot(
        receiptData.items as unknown as Record<string, unknown>[],
        kitchenPromoLineEnrich
      ) as ReceiptModalData['items']
      const slips = buildKitchenSlipGroups(
        itemsForKitchen,
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
