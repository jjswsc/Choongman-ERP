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
import { kitchenSlipPrintI18n } from '@/lib/pos-kitchen-slip-print-i18n'
import {
  buildKitchenSlipDocumentHtml,
  resolveKitchenSlipDesign,
} from '@/lib/pos-kitchen-slip-html'
import { resolvePosReceiptOrderNoRaw } from '@/lib/pos-delivery-platform'
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
} from '@/lib/pos-kitchen-slip-routing'
import { buildOptionNameByCodeFromMenus } from '@/lib/grab-pos-order-enrich'
import { mapKitchenSlipGroupItemsForPrint } from '@/lib/pos-kitchen-slip-display'
import type { PosOrderReceiptLineOptions } from '@/lib/pos-payment-receipt-from-order'
import { buildPosHallOrderReceiptDocumentHtml } from '@/lib/pos-hall-order-receipt-document-html'
import { buildPosPaymentReceiptDocumentHtml } from '@/lib/pos-payment-receipt-document-html'
import { enrichReceiptModalItemsForPromoDisplay } from '@/lib/pos-payment-receipt-from-order'
import {
  printPosHtmlDocument,
  resolveAfterKitchenToReceiptDelayMs,
  resolveBetweenKitchenSlipsDelayMs,
  type PrintPosHtmlDocumentOptions,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import { normalizePosOrderTypeKey } from '@/lib/pos-sales-order-type-filter'
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
    /** 주문 저장 시점 메뉴별 할인 스냅샷(손님 영수증 우선 표시) */
    lineDiscountAmt?: number
    /** items_json menuId1·재인쇄 시 음료 제외 할인 배분 */
    menuId?: string
    note?: string
    /** 추가 주문 줄 — 홀 주문 영수증에 `>` 접두 표시 */
    isAddon?: boolean
    promoId?: string
    promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
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
  appliedCoupons?: import('@/lib/pos-coupon-domain').PosAppliedCouponLine[]
  vatFeeAmt?: number
  vatFeeMode?: 'included' | 'separate'
  /** VAT 포함 시 영수증 소계 행(공급가액). `subtotal`≈`receiptTaxableGrossForDisplay`일 때만 인쇄에 사용 */
  receiptExclusiveSubtotalDisplay?: number
  receiptVatDisplayAmt?: number
  /** 부가세 분해 기준 과세표준(보통 `computePosPricing`의 baseTotal) */
  receiptTaxableGrossForDisplay?: number
  serviceFeeAmt?: number
  serviceFeeMode?: 'included' | 'separate'
  cardFeeAmt?: number
  cardFeeMode?: 'included' | 'separate'
  otherFeeAmt?: number
  otherFeeMode?: 'included' | 'separate'
  /** 결제 완료·재인쇄 영수증에 수단 종류 표시 (주문 접수용 slip에는 생략) */
  paymentCash?: number
  /** 현금 결제 시 손님이 건넨 금액(영수증 Paid Amount·Change) */
  paymentCashTendered?: number
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
  /** 동일 주문의 다중 인쇄(더치 분할 등) 구분용 키 */
  printInstanceKey?: string
  /** 주문 취소·void 시 음수 금액·Voided 배너 영수증 */
  voidReceiptMode?: boolean
  /** 결제 영수증 Date 행 — 미지정 시 인쇄 시각 */
  receiptPrintedAt?: string
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
  /** 자동 인쇄 완료 후 호출 (분할 큐 다음 장 처리) */
  onAutoPrintComplete?: () => void
  /** 보조 POS 등 자동 인쇄 생략 시 — 큐를 비우지 않고 현재 장만 닫음 */
  onSuppressDismiss?: () => void
  /** 결제 영수증 모달에서 KBank Void 후속 처리 */
  onPaymentVoidClick?: () => void | Promise<void>
  paymentVoidEnabled?: boolean
  paymentVoidBusy?: boolean
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
  onAutoPrintComplete,
  onSuppressDismiss,
  onPaymentVoidClick,
  paymentVoidEnabled = false,
  paymentVoidBusy = false,
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
    const optionNameByCode = buildOptionNameByCodeFromMenus(menus, [])
    const itemsForReceipt = enrichReceiptModalItemsForPromoDisplay(receiptData.items, {
      ...kitchenPromoLineEnrich,
      menus,
      optionNameByCode,
    })
    const isHallOrderPrint =
      receiptData.receiptAutoPrintContext === 'order' || receiptData.receiptAutoPrintContext === 'add_order'
    const fullHtml = isHallOrderPrint
      ? buildPosHallOrderReceiptDocumentHtml({
          payload: {
            orderNo: String(receiptData.orderNo ?? ''),
            storeCode: String(receiptData.storeCode ?? ''),
            orderType: String(receiptData.orderType ?? ''),
            tableName: receiptData.tableName ? String(receiptData.tableName) : undefined,
            memo: receiptData.memo ? String(receiptData.memo) : '',
            items: itemsForReceipt.map((it) => ({
              id: String(it.id ?? ''),
              name: String(it.name ?? ''),
              price: Number(it.price ?? 0) || 0,
              qty: Number(it.qty ?? 0) || 0,
              note: String(it.note ?? ''),
              ...(it.isAddon ? { isAddon: true as const } : {}),
              ...(Math.max(0, Number(it.lineDiscountAmt ?? 0) || 0) > 0.0001
                ? { lineDiscountAmt: Math.max(0, Number(it.lineDiscountAmt ?? 0) || 0) }
                : {}),
              promoItems: Array.isArray(it.promoItems) ? it.promoItems : [],
            })),
            subtotal: Number(receiptData.subtotal ?? 0) || 0,
            discountAmt: Number(receiptData.discountAmt ?? 0) || 0,
            couponDiscountAmt: Math.max(
              0,
              Number(
                (receiptData as { couponDiscountAmt?: number }).couponDiscountAmt ??
                  receiptData.appliedCoupons?.reduce((s, c) => s + Math.max(0, Number(c.discountAmt ?? 0) || 0), 0) ??
                  0
              ) || 0
            ),
            discountReason: receiptData.discountReason ? String(receiptData.discountReason) : undefined,
            total: Number(receiptData.total ?? 0) || 0,
            deliveryFee: Number(receiptData.deliveryFee ?? 0) || 0,
            packagingFee: Number(receiptData.packagingFee ?? 0) || 0,
            vatFeeAmt: Number(receiptData.vatFeeAmt ?? 0) || 0,
            vatFeeMode: receiptData.vatFeeMode,
            receiptExclusiveSubtotalDisplay: Number(receiptData.receiptExclusiveSubtotalDisplay ?? 0) || 0,
            receiptVatDisplayAmt: Number(receiptData.receiptVatDisplayAmt ?? 0) || 0,
            receiptTaxableGrossForDisplay: Number(receiptData.receiptTaxableGrossForDisplay ?? 0) || 0,
            serviceFeeAmt: Number(receiptData.serviceFeeAmt ?? 0) || 0,
            serviceFeeMode: receiptData.serviceFeeMode,
            cardFeeAmt: Number(receiptData.cardFeeAmt ?? 0) || 0,
            cardFeeMode: receiptData.cardFeeMode,
            otherFeeAmt: Number(receiptData.otherFeeAmt ?? 0) || 0,
            otherFeeMode: receiptData.otherFeeMode,
          },
          t,
          lang,
          menuNameById: (menuId: string) =>
            menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
          menuCodeByMenuId: Object.fromEntries(
            menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
          ),
          optionNameByCode,
        })
      : buildPosPaymentReceiptDocumentHtml({
          receiptData: { ...receiptData, items: itemsForReceipt },
          menus,
          optionNameByCode,
          orderTypeLabels,
          t,
          lang,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          printedAt: (() => {
            const raw = receiptData.receiptPrintedAt?.trim()
            if (raw) {
              const d = new Date(raw)
              if (!Number.isNaN(d.getTime())) return d
            }
            return new Date()
          })(),
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
      const ki = kitchenSlipPrintI18n(settings, lang)
      const itemsForKitchen = preparePosOrderItemsForKitchenSlip(
        receiptData.items as unknown as Parameters<typeof preparePosOrderItemsForKitchenSlip>[0],
        { ...kitchenPromoLineEnrich, menus }
      ) as ReceiptModalData['items']
      const slips = buildKitchenSlipGroups(
        itemsForKitchen,
        { ...buildKitchenSlipGroupOpts(settings, menus, ki.kLabels), splitPromoKitchenLines: true }
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
      const optionNameByCode = buildOptionNameByCodeFromMenus(menus, [])
      const printOne = async (idx: number): Promise<void> => {
        if (idx >= slips.length) return
        const slip = slips[idx]
        const kitchenMemo = parsePosOrderMemo(receiptData.memo).plainMemo
        const tablePart = receiptData.tableName
          ? ` · ${ki.t('posTable') || '테이블'}: ${translateReceiptTableDisplayName(receiptData.tableName, ki.t)}`
          : ''
        const memoLine =
          kitchenMemo.trim() ? `${ki.t('posCustomerMemo') || '메모'}: ${kitchenMemo.trim()}` : ''
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: kitchenOrderNoRaw,
          storeCode: receiptData.storeCode,
          orderTypeLabel:
            ki.orderTypeLabels[normalizePosOrderTypeKey(receiptData.orderType)] || receiptData.orderType,
          tablePart,
          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
          items: mapKitchenSlipGroupItemsForPrint(slip.items, {
            orderItems: itemsForKitchen,
            optionNameByCode,
            translateName: (name) => translatePosMenuLineForReceipt(name, ki.t),
          }),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          optionNameByCode,
          printColorAdjust: 'economy',
        })
        await printInIframe(html, slip.label, preferSystemPrintDialog, {
          printRole: 'kitchen',
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, resolveBetweenKitchenSlipsDelayMs()))
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
    const key = [
      receiptData.orderNo,
      receiptData.storeCode,
      receiptData.total,
      receiptData.items.length,
      receiptData.printInstanceKey || '',
    ].join('|')
    if (autoPrintedKeyRef.current === key) return
    autoPrintedKeyRef.current = key

    const id = window.setTimeout(() => {
      void (async () => {
        try {
          if (autoKitchenSlip) {
            await handlePrintKitchenSlipRef.current(false)
            if (autoReceipt) {
              await new Promise((r) => setTimeout(r, resolveAfterKitchenToReceiptDelayMs()))
              await handlePrintReceiptRef.current(false)
            }
          } else if (autoReceipt) {
            await handlePrintReceiptRef.current(false)
          }
        } catch {
          /* 인쇄 취소 등 */
        } finally {
          onAutoPrintComplete?.()
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
    onAutoPrintComplete,
  ])

  /** 보조 POS 등 suppress 시 표시만 생략 (분할 큐는 메인 POS에서 인쇄) */
  useEffect(() => {
    if (!receiptData?.suppressReceiptModalAutoPrint) return
    const id = requestAnimationFrame(() => onSuppressDismiss?.())
    return () => cancelAnimationFrame(id)
  }, [receiptData?.suppressReceiptModalAutoPrint, receiptData, onSuppressDismiss])

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
  const showPaymentVoidButton =
    ctxManual === 'payment' && Boolean(onPaymentVoidClick) && paymentVoidEnabled

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
            {showPaymentVoidButton && (
              <Button
                type="button"
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={paymentVoidBusy}
                onClick={() => void onPaymentVoidClick?.()}
              >
                {tr('posKbankVoid', 'Void')}
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
