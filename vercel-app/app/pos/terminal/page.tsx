'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type ComponentProps } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { POSHeader } from '@/components/pos/pos-header'
import { TableFloorView } from '@/components/pos/table-floor-view'
import { TableOrderPanel } from '@/components/pos/table-order-panel'
import { DeliveryOrderPanel } from '@/components/pos/delivery-order-panel'
import { TakeoutOrderPanel } from '@/components/pos/takeout-order-panel'
import { OrderBarList, type OrderBarItem, type OrderBarStatus } from '@/components/pos/order-bar-list'
import { resolveOrderBarCookElapsedEndAt } from '@/lib/pos-order-bar-cook-elapsed'
import { PosTerminalMenuScreen } from '@/components/pos/pos-terminal-menu-screen'
import type { PosTerminalParentCatalog } from '@/components/pos/pos-terminal-menu-screen'
import {
  CartPanel,
  type CartPanelHandle,
  type CartPanelAddItemPayload,
  type CartPanelPaymentPayload,
  type CartPanelSplitReceiptPayload,
  readPosCartItemsCache,
  writePosCartItemsCache,
} from '@/components/pos/cart-panel'
import { replacePosCartItemsCache } from '@/lib/pos-cart-items-cache'
import { PosTerminalDialogs, type KbankOutcomeState } from '@/components/pos/terminal/pos-terminal-dialogs'
import { usePosStore } from '@/hooks/use-pos-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useScrollIntoViewOnFocus } from '@/hooks/use-scroll-into-view-on-focus'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { useStoreList } from '@/lib/use-store-list'
import {
  buildPosStoreCodeMatchVariants,
  posStoreCodeMatchesVariants,
} from '@/lib/pos-store-code-match-variants'
import { LayoutGrid, Bike, Package, Search } from 'lucide-react'
import {
  getMembers,
  getPosMenus,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosOrders,
  getPosPrinterSettings,
  getPosTodaySales,
  getPosDeliveryApps,
  getPosTaxInvoiceRecipients,
  getPosPaymentAttempts,
  executeKbankCancelQr,
  executeKbankCheckStatus,
  executeKbankGenerateQr,
  executeKbankSettlement,
  executeKbankVoidPayment,
  executeLinkposDisplayQr,
  executeLinkposClearQr,
  executeLinkposPayment,
  probeLinkposLocalReady,
  grabCancelOrderByStoreApi,
  upsertPosTaxInvoiceRecipient,
  updatePosOrder,
  updatePosOrderStatus,
  type PosMenu,
  type PosMenuOption,
  type PosDeliveryApp,
  type LinkposPaymentSummary,
  type PosOrder,
  type PosOrderItem,
  type PosTableItem,
  type PosPrinterSettings,
  type PosPromoWithItems,
  type PosPaymentAttempt,
  type PosTaxInvoiceRecipientRow,
} from '@/lib/api-client'
import { isLinkposCardApiEnabled, shouldSkipLinkposTerminalForCard } from '@/lib/linkpos-card-api-enabled'
import { mergeQueuedSavePosOrderByLocalOrderNo, savePosOrderWithOffline } from '@/lib/offline'
import {
  consumeSuppressMainPosAutoPrintForQueuedSync,
  registerLocallyPrintedQueuedOrderNo,
} from '@/lib/offline/pos-queued-sync-print-suppress'
import {
  posPaymentAutoPrintDedupeKey,
  reservePosAutoPrintKey,
  reservePosAutoPrintKeys,
  releasePosAutoPrintKeys,
  hasRecentPosAutoPrintKey,
} from '@/lib/pos-auto-print-dedupe'
import { usePosMenusCatalogLiveRefresh } from '@/lib/offline/use-pos-menus-catalog-live-refresh'
import { isSaasModuleEnabled, useSaasEnabledModules } from '@/lib/use-saas-enabled-modules'
import {
  cartLinesToPosOrderItems,
  mergeDineInAddonCartPosItemsWithExisting,
  mergeDineInPaymentCartWithServerItems,
  normalizeCartLineIdForSave,
  orderUiItemsToPosOrderItems,
  resolveCartLineQuantityForSave,
} from '@/lib/pos-order-item-map'
import {
  fetchPosOrderItemsForPaymentMerge,
  mapPosOrderItemsToTerminalOrderSnapshot,
  reconcilePayloadItemsWithTerminalCart,
} from '@/lib/pos-terminal-order-items'
import { OfflineBanner } from '@/components/offline-banner'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { useAuth } from '@/lib/auth-context'
import { useAppBrandConfig } from '@/components/app-brand-provider'
import { isLangCode, useLang, type LangCode } from '@/lib/lang-context'
import { tr, useT } from '@/lib/i18n'
import { localizeApiMessage, translateApiMessage } from '@/lib/translate-api-message'
import type { Order, OrderItem, Table } from '@/lib/pos-types'
import { getPosCartSessionKey } from '@/lib/pos-cart-session'
import { mergeCartPanelAddItem } from '@/lib/pos-cart-merge'
import {
  computePosPricing,
  normalizeFeeStackMode,
  normalizeFeeStackOrder,
  receiptTaxDisplayFieldsFromPricing,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'
import { newPosOrderClientRequestId } from '@/lib/pos-order-client-request-id'
import { posOrderCouponFieldsFromOrderRow, posOrderCouponFieldsFromPayload } from '@/lib/pos-order-coupon-fields'
import { posOrderTierDiscountFieldsFromPayload } from '@/lib/pos-order-tier-discount-fields'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { mapDineInAddonCartLineForKitchenPrint, mapPosOrderRowForKitchenPrint } from '@/lib/pos-kitchen-print-item-map'
import {
  classifyKitchenAutoprintFailure,
  shouldShowKitchenAutoprintNotice,
} from '@/lib/pos-kitchen-autoprint-notice'
import { markKitchenPrintFailure } from '@/lib/pos-kitchen-print-tracking'
import { isBanbanKitchenLine } from '@/lib/pos-banban-utils'
import {
  buildOptionNameByCodeFromMenus,
  formatGrabLineNoteForKitchenPrint,
  resolveGrabItemPrintNote,
} from '@/lib/grab-pos-order-enrich'
import {
  parsePosOrderMemo,
  upsertPosOrderTaxInvoiceMemo,
  type PosTaxInvoiceData,
} from '@/lib/pos-tax-invoice'
import { escapeHtml, cn } from '@/lib/utils'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { formatPosDateTimeMedium } from '@/lib/pos-datetime-locale'
import { kitchenSlipPrintI18n, resolveKitchenSlipOrderTypeLabel } from '@/lib/pos-kitchen-slip-print-i18n'
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from '@/lib/pos-kitchen-slip-html'
import { formatPosOrderNoForPrint } from '@/lib/pos-order-no'
import {
  getPosDeliveryPlatformName,
  isApiInboundDeliveryOrderMemo,
  pickPosChannelOrderNo,
} from '@/lib/pos-delivery-platform'
import { isMemberPortalPaymentPendingOrder } from '@/lib/member-portal-payment-pending'
import { formatGrabDeliveryTableDisplayName } from '@/lib/pos-grab-manual-delivery-guard'
import {
  buildDineInAddKitchenAutoPrintDedupeKey,
  buildDineInAddKitchenPrintDedupeSuffix,
  buildDineInQtySnapshotMap,
  buildKitchenCartLinesFromSnapshotDelta,
  collectDineInSnapshotIncreasedKeys,
  resolveDineInKitchenLinesForAddSubmit,
  resolveDineInKitchenSnapshotItemKey,
} from '@/lib/pos-kitchen-dine-in-delta'
import { isPosDineInTableNameOnlyUpdate, isPosOrderItemsJsonPackagingOnlyUpdate, posOrderRealtimePricingFieldsChanged } from '@/lib/pos-dine-in-realtime-update'
import {
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  preparePosOrderItemsForKitchenSlip,
  buildPartialCancelKitchenSlips,
  type KitchenSlipRoutingItem,
  type PosKitchenReprintPayload,
} from '@/lib/pos-kitchen-slip-routing'
import { mapKitchenSlipGroupItemsForPrint } from '@/lib/pos-kitchen-slip-display'
import {
  printPosHtmlDocument,
  POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS,
  resolveBetweenKitchenSlipsDelayMs,
  resolveBetweenSplitReceiptsDelayMs,
  resolveAfterReceiptToKitchenDelayMs,
} from '@/lib/pos-print-html'
import { resolveEscPosCutOverride } from '@/lib/pos-thermal-escpos-cut'
import {
  translatePosMenuLineForReceipt,
  translateReceiptTableDisplayName,
  translateTakeoutOrderDisplayLabel,
  extractTakeoutSlotNumberFromLabel,
} from '@/lib/pos-print-translate'
import {
  buildMemberPortalTakeoutBarSubLabel,
  buildMemberPortalTakeoutDisplayLabel,
  buildPosCustomerMemoLineForPrint,
  resolveMemberPortalTakeoutMeta,
  resolveMemberPortalTakeoutTableDisplay,
} from '@/lib/pos-member-portal-takeout-label'
import {
  layoutHasMultipleFloors,
  parsePosTableFloorFromLabel,
  posDineInTableMatchKey,
} from '@/lib/pos-table-floor-match'
import {
  buildPosHallOrderReceiptDocumentHtml,
  mergeSetChildrenForReceipt,
} from '@/lib/pos-hall-order-receipt-document-html'
import {
  enrichPosOrderLikeItemsWithPromoSnapshot,
  enrichReceiptModalItemsForPromoDisplay,
  isPosOrderPaidLikeStatus,
  posOrderPaymentSum,
  posOrderRowPaymentSum,
  receiptModalDataFromPosOrderForPayment,
  receiptModalDataFromTerminalOrderTaxReprint,
  hallOrderReceiptPayloadFromPosOrder,
  hallOrderReceiptPayloadFromOrderFields,
  buildCheckoutPaymentReceiptModalData,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import { buildPosPaymentReceiptDocumentHtmlAsync } from '@/lib/pos-payment-receipt-document-html'
import {
  mergeMemberReceiptFields,
  pickMemberReceiptFieldsFromApi,
  type PosReceiptMemberSnapshot,
} from '@/lib/pos-receipt-member-block'
import {
  posOrderToCheckoutDiscountSnapshot,
  type PosExistingOrderCheckoutDiscount,
} from '@/lib/pos-existing-order-checkout-discount'
import {
  posOrderToCheckoutMemberSnapshot,
  resolvePosOrderMemberFieldsForAddonUpdate,
  type PosExistingOrderCheckoutMember,
} from '@/lib/pos-existing-order-checkout-member'
import { shouldForceSimplePaymentReceiptForStore } from '@/lib/pos-receipt-store-flags'
import { printPosVoidReceiptForOrder } from '@/lib/print-pos-void-receipt'
import {
  posOrderPaymentFieldsFromSnapshot,
  receiptPaymentFieldsFromSnapshot,
} from '@/lib/pos-receipt-cash-tender'
import {
  normalizePosSplitReceiptSnapshots,
  upsertPosSplitReceiptsInMemo,
} from '@/lib/pos-split-receipt-memo'
import { buildSplitPaymentReceiptBatch } from '@/lib/pos-split-payment-receipt-batch'
import { mergeGrabOrderItemsForKitchenPrint } from '@/lib/grab-kitchen-print-items'
import { mergeGrabSetChildLinesIntoPromoParents, parseGrabSetChildLineName } from '@/lib/grab-set-pos-lines'
import { buildGrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import { orderPaymentsSum } from '@/lib/pos-order-line-update'
import { coercePosReceiptLineDiscountAmt } from '@/lib/pos-receipt-line-discount'
import {
  inferPosOrderTypeFromRow,
  normalizePosOrderTypeKey,
  resolvePosOrderTypeReceiptLabel,
} from '@/lib/pos-sales-order-type-filter'
import { normalizePosPaymentTender } from '@/lib/pos-payment-tender-normalize'
import {
  extractKbankQrResponseMeta,
  extractKbankPaymentTxnNo,
  isKbankCreditCardQrUnavailableError,
  isKbankPaymentTxnNo,
  isKbankPaymentAttemptApproved,
  isKbankInquiryResponseApproved,
  isKbankQrSessionTxnNo,
  isKbankRateLimitError,
  KBANK_RATE_LIMIT_BACKOFF_MS,
  resolveKbankInquiryTxnNoForRequest,
  resolveKbankVoidTxnNoForRequest,
  resolveKbankCreditCardBrandLabels,
  resolveKbankDisplayQrTypeDetails,
  type KbankDisplayQrTypeSource,
} from '@/lib/payments/kbank-api-reference'
import {
  subscribePosOrdersInsert,
  subscribePosOrdersUpdate,
  type PosRealtimeSubscribeStatus,
} from '@/lib/supabase-client'
import {
  isMainPosRealtimeInsertChannelHealthy,
  isMainPosRealtimeRecentlyActive,
  mainPosPrimaryInsertChannelKey,
  MAIN_POS_REALTIME_RESUBSCRIBE_DELAY_MS,
  MAIN_POS_REALTIME_RESUBSCRIBE_MIN_MS,
  MAIN_POS_TRIGGER_POLL_MIN_MS,
  resolveMainPosPollIntervalMs,
  shouldUseMainPosHeavyOrderScanFallback,
} from '@/lib/pos-main-poll-interval'
import {
  applyGrabCancelWatchRealtimeRow,
  syncGrabCancelWatchSnapshot,
  type GrabCancelWatchSnap,
} from '@/lib/pos-grab-cancel-watch'
import {
  consumePosSelfInitiatedGrabCancel,
  markPosSelfInitiatedGrabCancel,
} from '@/lib/pos-grab-cancel-alert-suppress'
import { usePosCashDrawerOpen } from '@/components/pos/pos-drawer-pin-provider'
import {
  formatPosCashDrawerFailureMessage,
  shouldWarnPosCashDrawerFailure,
} from '@/lib/pos-cash-drawer'
import {
  publishPosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from '@/lib/pos-customer-display-state'
import {
  applyPosOrderStatusWithRetry,
  notifyQueuedPosSave,
} from '@/app/pos/terminal/lib/terminal-order-actions'
import {
  getPosTourScenarioIdFromQuery,
  isPosDemoFromQuery,
  PosTerminalTourController,
  PosTourTerminalManualNextGates,
  PosTourOverlay,
  PosTourProvider,
  usePosTour,
} from '@/lib/pos-tour'
import { PosBusinessOpenGateBlock } from '@/components/pos/pos-business-open-gate-block'
import { usePosBusinessOpenGate } from '@/lib/use-pos-business-open-gate'
import { ensurePosBusinessOpenForOrder } from '@/lib/pos-business-open-gate-client'
import {
  buildCustomerDisplayPaymentLines,
  resolveCardPaymentAmountForPricing,
} from '@/lib/pos-terminal-customer-display'
import {
  buildKbankGenerateAuditPaste,
  extractAmountFromEmvQrPayload,
  extractKbankGenerateResponseInfo,
  kbankOrigPartnerTxnUidForFollowup,
} from '@/lib/pos-terminal-kbank-helpers'
import {
  MAIN_POS_META_SCAN_INTERVAL_MS,
  MAIN_POS_STARTUP_CATCHUP_DURATION_MS,
  MAIN_POS_STARTUP_CATCHUP_WINDOW_MS,
  KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS,
  DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS,
  coercePosOrderIdFromRealtime,
  isPosPrintDebugEnabledInBrowser,
  isSessionNewOrder,
  mergeStoreAutoPrintFlags,
  posGuestCountSpread,
  posKitchenGuestSpread,
  readMainPosLastSeenOrderId,
  storeAutoPrintFlagsFromSettings,
  writeMainPosLastSeenOrderId,
  type StoreAutoPrintFlags,
} from '@/lib/pos-terminal-auto-print'
import { getPosIncomingWavDataUri } from '@/lib/pos-incoming-order-sound'
import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'


/** 배달앱 코드 (API에서 동적 로드 가능) */
export type DeliveryApp = string
type TakeoutMode = 'slot' | 'member'
/** 신규 배달 유입 시 탭 포커스·수락 안내에 쓰는 파라미터 */
type IncomingDeliveryFocusParams = {
  orderId: number
  orderType?: string
  deliveryAppCode?: string
  status?: string
  createdAt?: string
  storeCode?: string
  memo?: string
}
type PendingPayRequest = {
  tableName: string
  items: { id: string; name: string; price: number; quantity: number; note?: string; menuId?: string }[]
  /** 기존 주문 결제 시 영수증용 */
  orderNo?: string
  /** 기존 pos_orders 행 id (결제 updatePosOrder용) */
  existingOrderId?: number | null
  /** DB·플랫폼 할인·합계 — 결제 모달에서 0으로 초기화하지 않음 */
  orderDiscount?: PosExistingOrderCheckoutDiscount
  /** 기존 주문에 연결된 회원 — 결제 시 포인트 적립용 */
  orderMember?: PosExistingOrderCheckoutMember
  /** 기존 주문 memo — 결제 모달에서 세금계산서 복원 */
  orderMemo?: string
} | null

/** 테이블 현황 + 배달/포장 주문 + 장바구니. 테이블 선택 시 메뉴로 주문 추가. */
const FLOOR_PREF_KEY = 'pos-terminal-floor:'
/** 720×480 바닥 기준 3×3. 관리자 테이블 구성과 동일한 1:1 배율 기준 */
const DEMO_FLOOR_3X3_SLOTS = [
  { x: 44, y: 48 }, { x: 276, y: 48 }, { x: 508, y: 48 },
  { x: 44, y: 196 }, { x: 276, y: 196 }, { x: 508, y: 196 },
  { x: 44, y: 344 }, { x: 276, y: 344 }, { x: 508, y: 344 },
] as const

function TableFloorWithW13dTimeTour(props: ComponentProps<typeof TableFloorView> & { isPosDemo: boolean }) {
  const { isPosDemo, layout, ...rest } = props
  const { currentStep } = usePosTour()
  const timeTourSpotlights = useMemo(() => {
    if (currentStep?.id !== 'w13d_table_time_guide' || !isPosDemo) return null
    const a = layout[0]?.id
    const b = layout[1]?.id
    const c = layout[2]?.id
    if (!a || !b || !c) return null
    return {
      elapsedTableId: a,
      freshSurfaceTableId: a,
      warningSurfaceTableId: b,
      urgentSurfaceTableId: c,
      orderClockTableId: a,
    }
  }, [currentStep?.id, isPosDemo, layout])
  return <TableFloorView {...rest} layout={layout} timeTourSpotlights={timeTourSpotlights} />
}

/**
 * `CartPanel`이 넘긴 `payload.items`와 실제 `terminalCartLines`가 한 틱 어긋나거나(0·qty 혼용),
 * 카트 줄 id가 과거에 중복이면 `find`로 잘못 붙을 수 있어, **동일 id가 터미널에 있으면 터미널 수량을 단일 소스로** 쓴다.
 */
export default function PosTerminalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type') ?? 'dine_in'
  /** 테이블 오더 등 손님 단말: URL `audience=guest` — 메뉴 설명 표시(직원 POS는 미사용) */
  const showGuestMenuDescriptions = searchParams.get('audience') === 'guest'
  const orderType = useMemo(() => {
    if (typeParam === 'takeout') return 'takeout' as const
    if (typeParam === 'delivery') return 'delivery' as const
    return 'dine-in' as const
  }, [typeParam])

  const { auth } = useAuth()
  const brand = useAppBrandConfig()
  /** 결제「처리중…」단축·백그라운드 후처리 — Omni만. 충만은 기존 동기 경로 유지. */
  const isOmniPaymentFastPath = brand.key === 'omnifoodtech'
  const { lang } = useLang()
  const t = useT(lang)
  const localizeApiPopupMessage = useCallback((msg: string | undefined, fallback: string): string => {
    const translated = translateApiMessage(msg, t).trim()
    if (translated) {
      // Non-Korean locales should never show raw Korean text in frontline POS popups.
      if (lang !== 'ko' && /[가-힣]/.test(translated)) return fallback
      return translated
    }
    const original = String(msg || '').trim()
    if (!original) return fallback
    if (lang !== 'ko' && /[가-힣]/.test(original)) return fallback
    return original
  }, [lang, t])
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const tourScenarioId = getPosTourScenarioIdFromQuery(searchParams)
  const [tourMainDeviceTouched, setTourMainDeviceTouched] = useState(false)
  const [tourCartGuestCount, setTourCartGuestCount] = useState(0)
  const posDemoRef = useRef(false)
  const cartRef = useRef<CartPanelHandle>(null)
  useEffect(() => {
    posDemoRef.current = isPosDemo
  }, [isPosDemo])
  useEffect(() => {
    if (!isPosDemo) {
      setTourMainDeviceTouched(false)
      return
    }
    setTourMainDeviceTouched(false)
  }, [isPosDemo, tourScenarioId])
  const [terminalCartLines, setTerminalCartLines] = useState<OrderItem[]>([])
  const bindCartImperative = useCallback((api: CartPanelHandle | null) => {
    cartRef.current = api
  }, [])
  const posCartBackendBusyRef = useRef(false)
  const [posCartBackendBusy, setPosCartBackendBusy] = useState(false)

  const clearCartFromTerminal = useCallback(() => {
    setTerminalCartLines([])
    cartRef.current?.clearCart()
  }, [])
  const {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    currentFloorLabels,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    refetchStores,
    clearTableOrder,
    removeTerminalOrder,
    upsertOptimisticOrder,
    upsertOrderFromServer,
    loadingTables,
  } = usePosStore()
  const { formatStoreLabel, resolveStoreKey, legacyToCanonical, storeLabels, posStores } = useStoreList()

  const businessOpenGate = usePosBusinessOpenGate(currentStoreId, { skip: isPosDemo })
  const businessOpenBlocked = !businessOpenGate.allowed
  const ensureBusinessOpenForOrder = useCallback(async (): Promise<boolean> => {
    if (isPosDemo) return true
    /** Omni 결제 핫패스: 게이트가 이미 허용이면 시재 API 재조회 생략 */
    if (isOmniPaymentFastPath && businessOpenGate.allowed) return true
    return ensurePosBusinessOpenForOrder({
      storeCode: currentStoreId,
      resolveStoreKey,
      legacyToCanonical,
      storeLabels,
      messages: {
        neverOpened:
          t('posBusinessOpenRequiredBody') ||
          '오늘 POS를 시작하려면 먼저 영업 관리 > 영업 시작에서 돈통 시제를 입력·저장해 주세요.',
        newBusinessDay: ({ businessDateYmd, prevBusinessDateYmd }) =>
          t('posBusinessOpenNewDayBody') ||
          `아침에 등록한 시제는 이전 영업일${prevBusinessDateYmd ? `(${prevBusinessDateYmd})` : ''} 기준입니다. 현재 영업일(${businessDateYmd}) 시제를 다시 저장해 주세요.`,
      },
      onAlert: appAlert,
    })
  }, [
    isPosDemo,
    isOmniPaymentFastPath,
    businessOpenGate.allowed,
    currentStoreId,
    resolveStoreKey,
    legacyToCanonical,
    storeLabels,
    t,
  ])

  useEffect(() => {
    if (loadingTables) return
    if (currentStoreId) return
    router.replace('/pos')
  }, [loadingTables, currentStoreId, router])

  const notifyQueuedSave = useCallback(async (orderNo?: string, queued?: boolean) => {
    await notifyQueuedPosSave({
      orderNo,
      queued,
      onAlert: appAlert,
      i18n: {
        withoutOrderNo:
          t('posQueuedSavedNoOrder') || '오프라인으로 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.',
        withOrderNo: (no) =>
          tr(t, 'posQueuedSavedWithOrder', { orderNo: no }) ||
          `주문 ${no}를 오프라인 큐에 저장했습니다. 네트워크 복구 시 자동 동기화됩니다.`,
      },
    })
  }, [t])

  const applyOrderStatusWithRetry = useCallback(
    async (params: { id: number; status: 'ready' | 'paid' | 'completed' | 'cancelled' | 'refunded' }) => {
      if (isPosDemo) return true
      return applyPosOrderStatusWithRetry({
        id: params.id,
        status: params.status,
        onAlert: appAlert,
        onConfirm: appConfirm,
        failMessageFallback: t('processFail') || '처리 실패',
        i18n: {
          retryConfirm: t('posStatusRetryConfirm') || '후속 처리를 다시 시도할까요?',
          sideEffectLabels: {
            stock: t('posStatusSideEffectStock') || '재고',
            journal: t('posStatusSideEffectJournal') || '분개',
            vat: t('posStatusSideEffectVat') || '부가세',
          },
          postProcessSuffix: (steps) =>
            tr(t, 'posStatusPostProcessSuffix', { steps }) || `(${steps} 후처리)`,
        },
      })
    },
    [isPosDemo, t]
  )

  /**
   * Omni: 결제 금액 저장 후 status/재고/분개를 백그라운드(버튼 잠금 해제).
   * 충만: 기존처럼 await — 후처리 실패 시 결제 모달에서 중단.
   * 실패 시 applyPosOrderStatusWithRetry 가 알림·재시도 confirm 을 띄운다.
   */
  const applyPaidStatusAfterPaymentSave = useCallback(
    async (params: { id: number; status: 'paid' | 'completed' }): Promise<boolean> => {
      if (!isOmniPaymentFastPath) {
        return applyOrderStatusWithRetry(params)
      }
      void applyOrderStatusWithRetry(params)
        .then((ok) => {
          if (ok) void refetchStores({ scope: 'current', immediate: true })
        })
        .catch((e) => {
          console.error('Omni post-payment status background failed:', e)
        })
      return true
    },
    [isOmniPaymentFastPath, applyOrderStatusWithRetry, refetchStores]
  )

  /** 결제 merge용 — Omni만 로컬 목록 우선(getPosOrders 왕복 생략). 충만은 항상 서버 fetch. */
  const resolveLocalOrderItemsForPaymentMerge = useCallback(
    (orderId: number) => {
      if (!isOmniPaymentFastPath) return [] as ReturnType<typeof orderUiItemsToPosOrderItems>
      if (!Number.isFinite(orderId) || orderId <= 0) return [] as ReturnType<typeof orderUiItemsToPosOrderItems>
      const fromOrder = (order: Order | null | undefined) => {
        if (!order || Number(order.id) !== orderId || !order.items?.length) return null
        return orderUiItemsToPosOrderItems(order.items)
      }
      for (const tbl of currentStore?.tables ?? []) {
        const hit = fromOrder(tbl.order)
        if (hit?.length) return hit
      }
      const pool = [
        ...deliveryOrders,
        ...packagedDeliveryOrders,
        ...completedDeliveryOrders,
        ...takeoutOrders,
        ...packagedTakeoutOrders,
        ...completedTakeoutOrders,
      ]
      for (const o of pool) {
        const hit = fromOrder(o)
        if (hit?.length) return hit
      }
      return []
    },
    [
      isOmniPaymentFastPath,
      currentStore?.tables,
      deliveryOrders,
      packagedDeliveryOrders,
      completedDeliveryOrders,
      takeoutOrders,
      packagedTakeoutOrders,
      completedTakeoutOrders,
    ]
  )

  const mergePaymentItemsPreferLocal = useCallback(
    async (existingOrderId: number, cartItemsForSave: ReturnType<typeof cartLinesToPosOrderItems>) => {
      const local = resolveLocalOrderItemsForPaymentMerge(existingOrderId)
      if (local.length > 0) {
        return mergeDineInPaymentCartWithServerItems(local, cartItemsForSave)
      }
      try {
        const serverItems = await fetchPosOrderItemsForPaymentMerge(existingOrderId, currentStoreId)
        if (serverItems.length > 0) {
          return mergeDineInPaymentCartWithServerItems(serverItems, cartItemsForSave)
        }
      } catch (e) {
        console.warn('payment merge with server items failed:', e)
      }
      return cartItemsForSave
    },
    [currentStoreId, resolveLocalOrderItemsForPaymentMerge]
  )

  const alertPaymentBackendBusy = useCallback(async () => {
    await appAlert(
      t('posPaymentBackendBusy') ||
        '다른 주문 처리가 진행 중입니다. 잠시 후 다시 결제해 주세요.'
    )
  }, [t])

  const refetchCurrentStore = useCallback(() => {
    return refetchStores({ scope: 'current', immediate: true })
  }, [refetchStores])

  const dismissTerminalOrder = useCallback(
    (order: Order) => {
      if (!currentStoreId) return
      removeTerminalOrder(currentStoreId, order)
    },
    [currentStoreId, removeTerminalOrder]
  )

  /** 주문 저장 직후 — 목록에 즉시 반영 후 서버 스냅샷 동기화(구 캐시·빈 refetch로 사라지는 현상 방지) */
  const refreshStoreListAfterOrderSave = useCallback(
    async (input: {
      orderType: string
      tableName?: string
      memo?: string
      status?: Order['status']
      total?: number
      orderNo?: string
      serverOrderId?: number | null
      items: Array<{
        id?: string
        name?: string
        quantity?: number
        price?: number
        menuId?: string
        optionId?: string
        note?: string
        servedAt?: string | null
        servedBy?: string | null
        cancelledAt?: string | null
        cancelledBy?: string | null
        cancelReason?: string | null
        setChildrenState?: OrderItem['setChildrenState']
      }>
      queuedWithoutServerId?: boolean
    }) => {
      const serverId =
        input.serverOrderId != null && input.serverOrderId > 0 ? Number(input.serverOrderId) : null
      if (serverId != null) {
        upsertOptimisticOrder({
          storeCode: currentStoreId,
          serverOrderId: serverId,
          orderNo: input.orderNo,
          orderType: input.orderType,
          tableName: input.tableName,
          tableLayoutFloor: parsePosTableFloorFromLabel(input.tableName) ?? undefined,
          memo: input.memo,
          status: input.status ?? 'pending',
          total: input.total,
          items: input.items,
        })
      }
      await refetchStores({ scope: 'current', immediate: true })
      /** DB·캐시 반영 지연 시 옛 스냅샷으로 덮어쓰는 레이스 완화 */
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          void refetchStores({ scope: 'current', immediate: true })
        }, 700)
        window.setTimeout(() => {
          void refetchStores({ scope: 'current', immediate: true })
        }, 1800)
      }
    },
    [currentStoreId, refetchStores, upsertOptimisticOrder]
  )

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [servingTableId, setServingTableId] = useState<string | null>(null)
  /** 데모 홀: 저장 API 없이 서빙 패널용 주문만 오버레이 */
  const [demoDineInOrder, setDemoDineInOrder] = useState<{ tableId: string; order: Order } | null>(null)
  const [activeFloor, setActiveFloor] = useState<1 | 2 | 3>(1)
  const [deliveryApp, setDeliveryApp] = useState<DeliveryApp | null>(null)
  const [deliveryOrderNo, setDeliveryOrderNo] = useState('')
  const [takeoutMode, setTakeoutMode] = useState<TakeoutMode>('slot')
  const [takeoutSlot, setTakeoutSlot] = useState('1')
  const [takeoutMemberName, setTakeoutMemberName] = useState('')
  const [takeoutMemberNames, setTakeoutMemberNames] = useState<string[]>([])
  const [selectedDeliveryTargetId, setSelectedDeliveryTargetId] = useState<string | null>(null)
  const [selectedDeliveryTargetLabel, setSelectedDeliveryTargetLabel] = useState<string>('')
  const [selectedTakeoutTargetId, setSelectedTakeoutTargetId] = useState<string | null>(null)
  const [selectedTakeoutTargetLabel, setSelectedTakeoutTargetLabel] = useState<string>('')
  const [tourPaymentModalOpen, setTourPaymentModalOpen] = useState(false)
  const [tourPaymentTab, setTourPaymentTab] = useState<'cash' | 'card' | 'qr' | 'delivery_app' | 'other'>('cash')
  const [tourTaxInvoiceEnabled, setTourTaxInvoiceEnabled] = useState(false)
  const [tourPaymentCompletedCount, setTourPaymentCompletedCount] = useState(0)
  const [activeTab, setActiveTab] = useState<'tables' | 'delivery' | 'takeout'>(
    orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
  )
  useEffect(() => {
    const nextTab = orderType === 'delivery' ? 'delivery' : orderType === 'takeout' ? 'takeout' : 'tables'
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab))
  }, [orderType])
  const [pendingDineInOrderId, setPendingDineInOrderId] = useState<number | null>(null)
  /** `pendingDineInOrderId`가 가리키는 주문의 테이블명 — 다른 테이블로 잘못 병합(updatePosOrder)되는 것을 막음 */
  const pendingDineInOrderTableRef = useRef<string>('')
  /** 방금 저장한 dine-in 주문만 fallback add 대상으로 허용(오래된 pending id 오인 방지) */
  const pendingDineInOrderSavedAtRef = useRef<{ orderId: number; atMs: number; tableKey: string }>({
    orderId: 0,
    atMs: 0,
    tableKey: '',
  })
  const [pendingPayRequest, setPendingPayRequest] = useState<PendingPayRequest>(null)
  const [pendingTakeoutOrderId, setPendingTakeoutOrderId] = useState<number | null>(null)
  const [pendingTakeoutPayRequest, setPendingTakeoutPayRequest] = useState<PendingPayRequest>(null)
  const [pendingDeliveryOrderId, setPendingDeliveryOrderId] = useState<number | null>(null)
  const [pendingDeliveryPayRequest, setPendingDeliveryPayRequest] = useState<PendingPayRequest>(null)
  const [liveSearchOpen, setLiveSearchOpen] = useState(false)
  const [deliveryEditOrderNoOpen, setDeliveryEditOrderNoOpen] = useState(false)
  const [deliveryEditOrderNoValue, setDeliveryEditOrderNoValue] = useState('')
  const [deliveryListMode, setDeliveryListMode] = useState<'in_progress' | 'completed' | 'all'>('in_progress')
  const [takeoutListMode, setTakeoutListMode] = useState<'in_progress' | 'completed' | 'all' | 'member_portal'>('in_progress')
  const [tableListMode, setTableListMode] = useState<'in_progress' | 'completed' | 'all'>('all')
  const [deliveryAppsFromApi, setDeliveryAppsFromApi] = useState<PosDeliveryApp[]>([])
  const [menus, setMenus] = useState<PosMenu[]>([])
  const [promosWithItems, setPromosWithItems] = useState<PosPromoWithItems[]>([])
  const [menuOptions, setMenuOptions] = useState<PosMenuOption[]>([])
  const [menuOptionsForCodeMap, setMenuOptionsForCodeMap] = useState<PosMenuOption[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [receiptData, setReceiptData] = useState<ReceiptModalData | null>(null)
  const receiptQueueRef = useRef<ReceiptModalData[]>([])
  /** 결제 update/save 직후 회원·포인트 스냅샷 — dispatchCheckoutPaymentReceipt 에서 병합 */
  const pendingPaymentReceiptMemberRef = useRef<PosReceiptMemberSnapshot | null>(null)
  const capturePaymentReceiptMember = useCallback(
    (
      res: Parameters<typeof pickMemberReceiptFieldsFromApi>[0],
      fallback?: {
        memberId?: number
        memberNo?: string
        memberPhone?: string
        memberTierCode?: string
        memberPointBalance?: number
      }
    ) => {
      pendingPaymentReceiptMemberRef.current = pickMemberReceiptFieldsFromApi(res, fallback)
    },
    []
  )
  const clearPaymentReceiptMember = useCallback(() => {
    pendingPaymentReceiptMemberRef.current = null
  }, [])
  const [autoPrintReceiptOnOrder, setAutoPrintReceiptOnOrder] = useState(false)
  const [autoPrintReceiptOnAddOrder, setAutoPrintReceiptOnAddOrder] = useState(false)
  const [autoPrintReceiptOnPayment, setAutoPrintReceiptOnPayment] = useState(false)
  const [autoPrintKitchenSlipOnOrder, setAutoPrintKitchenSlipOnOrder] = useState(false)
  /** 주방 자동인쇄 실패 — 서버/네트워크 끊김 시 조용히 스킵되지 않도록 상단 안내 */
  const [kitchenAutoprintNotice, setKitchenAutoprintNotice] = useState<{
    text: string
    orderRef?: string
  } | null>(null)
  const kitchenAutoprintNoticeShownAtRef = useRef(0)
  const kitchenAutoprintNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (kitchenAutoprintNoticeTimerRef.current != null) {
        clearTimeout(kitchenAutoprintNoticeTimerRef.current)
      }
    }
  }, [])
  const [autoPrintFinalOrderBeforePayment, setAutoPrintFinalOrderBeforePayment] = useState(false)
  const [receiptBizName, setReceiptBizName] = useState('')
  const [receiptBizTaxId, setReceiptBizTaxId] = useState('')
  const [receiptBizAbn, setReceiptBizAbn] = useState('')
  const [receiptBizOwner, setReceiptBizOwner] = useState('')
  const [receiptBizAddress, setReceiptBizAddress] = useState('')
  const [receiptBizPhone, setReceiptBizPhone] = useState('')
  const [receiptDesignStyle, setReceiptDesignStyle] = useState<'badge' | 'simple'>('badge')
  const [receiptLogoSize, setReceiptLogoSize] = useState<'sm' | 'md' | 'lg'>('md')
  const [receiptShowTitle, setReceiptShowTitle] = useState(true)
  const [receiptShowPaidStamp, setReceiptShowPaidStamp] = useState(true)
  const [receiptShowThankYou, setReceiptShowThankYou] = useState(true)
  const [receiptShowCustomerCopy, setReceiptShowCustomerCopy] = useState(true)
  const [receiptFooterPrimaryText, setReceiptFooterPrimaryText] = useState('')
  const [receiptFooterSecondaryText, setReceiptFooterSecondaryText] = useState('')
  const [receiptLogoImageUrl, setReceiptLogoImageUrl] = useState('')
  const [receiptStampImageUrl, setReceiptStampImageUrl] = useState('')
  const [receiptShowStamp, setReceiptShowStamp] = useState(true)
  const [receiptStampOnlyTaxInvoice, setReceiptStampOnlyTaxInvoice] = useState(true)
  const [receiptMembershipQrImageUrl, setReceiptMembershipQrImageUrl] = useState('')
  const [receiptMembershipQrLinkUrl, setReceiptMembershipQrLinkUrl] = useState('')
  const [receiptMembershipQrText, setReceiptMembershipQrText] = useState('')
  const [receiptShowMembershipQr, setReceiptShowMembershipQr] = useState(false)
  const [signatureLine, setSignatureLine] = useState(false)
  const [receiptBarcode, setReceiptBarcode] = useState(false)
  const [itemBarcode, setItemBarcode] = useState(false)
  const [drawerOpenOption, setDrawerOpenOption] = useState<'password_and_reason' | 'reason_only' | 'force'>('reason_only')
  const { openPosCashDrawerSecure } = usePosCashDrawerOpen()
  const [receiptPrintLang, setReceiptPrintLang] = useState<string>('')
  const validPrintLangs = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']
  const printLang = receiptPrintLang && validPrintLangs.includes(receiptPrintLang) ? receiptPrintLang : lang
  const tPrint = useT(printLang)
  const [vatRate, setVatRate] = useState(7)
  const [vatMode, setVatMode] = useState<'included' | 'separate'>('included')
  const [serviceRate, setServiceRate] = useState(0)
  const [serviceMode, setServiceMode] = useState<'included' | 'separate'>('separate')
  const [cardRate, setCardRate] = useState(0)
  const [cardMode, setCardMode] = useState<'included' | 'separate'>('separate')
  const [cardBaseMode, setCardBaseMode] = useState<'card_only' | 'card_plus_vat' | 'card_plus_vat_service'>('card_only')
  const [otherRate, setOtherRate] = useState(0)
  const [otherMode, setOtherMode] = useState<'included' | 'separate'>('separate')
  const [feeStackMode, setFeeStackMode] = useState<'parallel' | 'sequential'>('parallel')
  const [feeStackOrder, setFeeStackOrder] = useState<Array<'vat' | 'service' | 'other'>>(['service', 'vat', 'other'])
  const [dualMonitorEnabled, setDualMonitorEnabled] = useState(false)
  const [requireGuestCount, setRequireGuestCount] = useState(true)
  const [customerDisplayAutoOpen, setCustomerDisplayAutoOpen] = useState(true)
  const [customerDisplayMonitorPreference, setCustomerDisplayMonitorPreference] = useState<'secondary-first' | 'primary-only'>('secondary-first')
  const [customerDisplayLangMode, setCustomerDisplayLangMode] = useState<'follow-pos' | 'custom'>('follow-pos')
  const [customerDisplayLangOverride, setCustomerDisplayLangOverride] = useState<LangCode>('ko')
  const [customerDisplayDefaultState, setCustomerDisplayDefaultState] = useState<'idle' | 'qr'>('idle')
  const [customerDisplayIdleMessage, setCustomerDisplayIdleMessage] = useState('')
  const [customerDisplayPaymentMessage, setCustomerDisplayPaymentMessage] = useState('')
  const [customerDisplayQrPayload, setCustomerDisplayQrPayload] = useState('')
  const [linkposQrBridgeStatus, setLinkposQrBridgeStatus] = useState<'idle' | 'ok' | 'failed'>('idle')
  const [liveKbankQrPayload, setLiveKbankQrPayload] = useState('')
  const [liveKbankQrAmount, setLiveKbankQrAmount] = useState(0)
  const [liveKbankQrType, setLiveKbankQrType] = useState<'THAI_QR' | 'CREDIT_CARD'>('THAI_QR')
  const [liveKbankQrTypeSource, setLiveKbankQrTypeSource] =
    useState<KbankDisplayQrTypeSource>('requested')
  const [kbankSentQrTypeCode, setKbankSentQrTypeCode] = useState('')
  const [kbankGenerateAuditText, setKbankGenerateAuditText] = useState('')
  const [kbankOpsBusy, setKbankOpsBusy] = useState(false)
  const [kbankOpsTxnUid, setKbankOpsTxnUid] = useState('')
  const kbankOpsTxnUidRef = useRef('')
  const [kbankOpsOrigTxnUid, setKbankOpsOrigTxnUid] = useState('')
  const [kbankOpsTxnNo, setKbankOpsTxnNo] = useState('')
  const [kbankOpsTerminalId, setKbankOpsTerminalId] = useState('')
  const [kbankOpsLastResult, setKbankOpsLastResult] = useState('')
  const [kbankOpsCardBrands, setKbankOpsCardBrands] = useState<string[]>([])
  const [kbankCallbackState, setKbankCallbackState] = useState<'idle' | 'waiting' | 'received' | 'failed'>('idle')
  const [kbankOutcomeState, setKbankOutcomeState] = useState<KbankOutcomeState | null>(null)
  const kbankCallbackNotifiedTxRef = useRef('')
  const kbankOutcomeLastKeyRef = useRef('')
  const kbankManualCancelPendingRef = useRef(false)
  const kbankGenerateLastAtRef = useRef(0)
  const kbankInquiryLastAtRef = useRef(0)
  const kbankFollowupLastAtRef = useRef(0)
  const kbankCcInquiryTriggeredRef = useRef('')
  const kbankApiPausedUntilRef = useRef(0)
  const [kbankApiPausedUntilMs, setKbankApiPausedUntilMs] = useState(0)
  /** QR 대기 결제: 승인되면 주문을 paid로 마감·영수증 출력하는 후처리(파트너TxnUid별). */
  const pendingKbankFinalizeRef = useRef<
    Record<string, (approval: { txnNo?: string; cardBrands?: string[] }) => void | Promise<void>>
  >({})
  /** 콜백이 결제 후처리 등록보다 빠를 때 승인 정보 보관 (partnerTxnUid별). */
  const deferredKbankApprovalRef = useRef<
    Record<string, { txnNo?: string; cardBrands?: string[] }>
  >({})
  useEffect(() => {
    kbankOpsTxnUidRef.current = String(kbankOpsTxnUid || '').trim()
  }, [kbankOpsTxnUid])
  const [customerDisplayShowOrderSummary, setCustomerDisplayShowOrderSummary] = useState(true)
  const [customerDisplayShowOrderTotal, setCustomerDisplayShowOrderTotal] = useState(true)
  const [customerDisplayIdleMediaType, setCustomerDisplayIdleMediaType] = useState<'none' | 'image' | 'video'>('none')
  const [customerDisplayIdleMediaUrl, setCustomerDisplayIdleMediaUrl] = useState('')
  const [customerDisplayPaymentDraft, setCustomerDisplayPaymentDraft] = useState<CartPanelPaymentPayload | null>(null)
  const tourPaymentCardAmount = Number(customerDisplayPaymentDraft?.paymentCard ?? 0)
  const tourPaymentQrAmount = Number(customerDisplayPaymentDraft?.paymentQr ?? 0)
  const tourPaymentDeliveryAppAmount = Number(customerDisplayPaymentDraft?.paymentDeliveryApp ?? 0)
  const tourPaymentOtherAmount = Number(customerDisplayPaymentDraft?.paymentOther ?? 0)
  /** 결제 완료 직후 고객 모니터에 설정된 QR을 잠시 표시(ms 기준 타임스탬프) */
  const [postPaymentQrUntil, setPostPaymentQrUntil] = useState(0)
  /** 결제 후 거스름 — CartPanel 언마운트와 무관하게 확인 전까지 유지 */
  const [postPaymentCashChangeBaht, setPostPaymentCashChangeBaht] = useState<number | null>(null)
  /** 기존 주문 결제 시 영수증 orderNo (pendingPayRequest/pendingTakeoutPayRequest에 있던 값) */
  const [pendingReceiptOrderNo, setPendingReceiptOrderNo] = useState<string | null>(null)
  const [taxInvoiceTargetOrder, setTaxInvoiceTargetOrder] = useState<Order | null>(null)
  const [taxInvoiceSaving, setTaxInvoiceSaving] = useState(false)
  const [taxSearchLoading, setTaxSearchLoading] = useState(false)
  const [taxSearchField, setTaxSearchField] = useState<'taxId' | 'name' | 'phone'>('taxId')
  const [taxSearchKeyword, setTaxSearchKeyword] = useState('')
  const [taxSearchRows, setTaxSearchRows] = useState<PosTaxInvoiceRecipientRow[]>([])
  const [taxSearchMessage, setTaxSearchMessage] = useState('')
  const [tiCustomerType, setTiCustomerType] = useState<'person' | 'company'>('person')
  const [tiMemberNo, setTiMemberNo] = useState('')
  const [tiName, setTiName] = useState('')
  const [tiTaxId, setTiTaxId] = useState('')
  const [tiBranchNo, setTiBranchNo] = useState('')
  const [tiPhone, setTiPhone] = useState('')
  const [tiEmail, setTiEmail] = useState('')
  const [tiAddress, setTiAddress] = useState('')
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
  } | null>(null)
  const [cookingRules, setCookingRules] = useState<{
    freshMaxMin: number
    warningMaxMin: number
    mode: 'elapsed' | 'recipe_diff'
    recipeWarnDiff: number
    recipeUrgentDiff: number
    delayBadgeEnabled: boolean
    delaySoundEnabled: boolean
    delayAlertOverMin: number
  }>({
    freshMaxMin: 10,
    warningMaxMin: 15,
    mode: 'elapsed',
    recipeWarnDiff: 0,
    recipeUrgentDiff: 5,
    delayBadgeEnabled: true,
    delaySoundEnabled: false,
    delayAlertOverMin: 0,
  })
  const [menuTargets, setMenuTargets] = useState<{ byId: Map<string, number>; byName: Map<string, number> }>({
    byId: new Map(),
    byName: new Map(),
  })
  const applyPosMenusList = useCallback((list: unknown) => {
    const arr = Array.isArray(list) ? (list as PosMenu[]) : []
    /** 일시적 빈 응답으로 카탈로그를 지우지 않음 (캐시/tenant 레이스) */
    if (arr.length === 0) {
      setMenus((prev) => (prev.length > 0 ? prev : arr))
      return
    }
    setMenus(arr)
    const byId = new Map<string, number>()
    const byName = new Map<string, number>()
    arr.forEach((m: PosMenu) => {
      const min = Number(m.cookingTimeMin ?? 0)
      if (!Number.isFinite(min) || min <= 0) return
      const id = String(m.id || '').trim()
      const name = String(m.name || '').trim()
      if (id) byId.set(id, min)
      if (name) byName.set(name, min)
    })
    setMenuTargets({ byId, byName })
  }, [])
  const terminalParentCatalog = useMemo<PosTerminalParentCatalog>(
    () => ({
      menus,
      promos: promosWithItems,
      options: menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions,
      loading: catalogLoading,
    }),
    [menus, promosWithItems, menuOptions, menuOptionsForCodeMap, catalogLoading]
  )
  const optionNameById = useMemo(() => {
    const out = new Map<string, string>()
    for (const opt of menuOptions) {
      const id = String(opt.id ?? '').trim()
      const name = String(opt.name ?? '').trim()
      if (!id || !name) continue
      out.set(id, name)
    }
    return out
  }, [menuOptions])
  const optionNameByCode = useMemo(
    () =>
      buildOptionNameByCodeFromMenus(
        menus,
        menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions
      ),
    [menus, menuOptions, menuOptionsForCodeMap]
  )
  const formatLineNoteForPrint = useCallback(
    (rawNote?: string | null): string => formatGrabLineNoteForKitchenPrint(rawNote, optionNameByCode),
    [optionNameByCode]
  )
  const promoCatalogById = useMemo(() => {
    const m = new Map<string, PosPromoWithItems>()
    for (const p of promosWithItems) {
      if (p?.id) m.set(String(p.id), p)
    }
    return m
  }, [promosWithItems])
  const posReceiptLineOpts: PosOrderReceiptLineOptions = useMemo(
    () => ({ promoCatalogById, menus, optionNameByCode, optionNameById }),
    [promoCatalogById, menus, optionNameByCode, optionNameById]
  )
  const grabCatalogForPrint = useMemo(
    () =>
      buildGrabPosCatalog(
        menus.map((m) => ({ id: m.id, name: m.name, code: m.code })),
        (menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions).map((o) => ({
          name: o.name,
          optionCode: o.optionCode,
        })),
        promosWithItems
      ),
    [menus, menuOptions, menuOptionsForCodeMap, promosWithItems]
  )
  const enrichPromoItemsWithOptionName = useCallback(
    (list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]) =>
      list.map((p) => ({
        ...p,
        ...((p.optionCode && optionNameByCode.get(String(p.optionCode))) ? { optionName: optionNameByCode.get(String(p.optionCode)) } : {}),
        ...((p.optionId && optionNameById.get(String(p.optionId))) ? { optionName: optionNameById.get(String(p.optionId)) } : {}),
      })),
    [optionNameByCode, optionNameById]
  )
  /** Grab 주방 자동인쇄 — 영수증과 동일하게 세트 자식 병합·`grabSetChild` 제거 후 맵 */
  const prepareOrderItemsForKitchenPrint = useCallback(
    (orderItems: unknown[], deliveryAppCode?: string | null) => {
      const base = Array.isArray(orderItems) ? orderItems : []
      const merged = mergeGrabOrderItemsForKitchenPrint(
        base as Parameters<typeof mergeGrabOrderItemsForKitchenPrint>[0],
        grabCatalogForPrint
      )
      return merged.map((it) =>
        mapPosOrderRowForKitchenPrint(it as unknown as Record<string, unknown>, {
          menus,
          deliveryAppCode,
          enrichPromoItems: enrichPromoItemsWithOptionName,
        })
      )
    },
    [grabCatalogForPrint, menus, enrichPromoItemsWithOptionName]
  )
  /** 분할 결제 영수증 배치 시작 — 기존 큐·모달 상태를 비우고 첫 장부터 순서대로 인쇄 */
  const startReceiptBatch = useCallback((batch: ReceiptModalData[]) => {
    if (!Array.isArray(batch) || batch.length === 0) return
    const [first, ...rest] = batch
    receiptQueueRef.current = rest
    setReceiptData(first)
  }, [])
  const splitReceiptFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushNextReceiptQueue = useCallback(() => {
    if (splitReceiptFlushTimerRef.current != null) {
      clearTimeout(splitReceiptFlushTimerRef.current)
      splitReceiptFlushTimerRef.current = null
    }
    const [next, ...rest] = receiptQueueRef.current
    receiptQueueRef.current = rest
    if (!next) {
      setReceiptData(null)
      return
    }
    splitReceiptFlushTimerRef.current = setTimeout(() => {
      splitReceiptFlushTimerRef.current = null
      setReceiptData(next)
    }, resolveBetweenSplitReceiptsDelayMs())
  }, [])
  const clearReceiptQueue = useCallback(() => {
    receiptQueueRef.current = []
    setReceiptData(null)
  }, [])
  const makeSplitPaymentReceiptBatch = useCallback(
    (
      base: {
        orderNo: string
        storeCode: string
        orderType: string
        tableName?: string
        memo?: string
        discountReason?: string
        vatFeeMode?: 'included' | 'separate'
      },
      splitReceipts: CartPanelSplitReceiptPayload[] | undefined,
      suppressReceiptModalAutoPrint: boolean,
      serverOrderId?: number | null
    ): ReceiptModalData[] => {
      const splits = normalizePosSplitReceiptSnapshots(splitReceipts)
      if (!splits) return []
      return buildSplitPaymentReceiptBatch(base, splits, {
        suppressReceiptModalAutoPrint,
        ...(serverOrderId != null && serverOrderId > 0 ? { serverOrderId } : {}),
      })
    },
    []
  )
  /** 주방 인쇄: DB에 promoItems 없을 때 카탈로그로 세트 구성 펼침 + 옵션명 보강 */
  const kitchenItemsWithResolvedPromo = useCallback(
    <T extends Record<string, unknown>>(rows: T[]): T[] => {
      if (!rows.length) return rows
      const prepared = preparePosOrderItemsForKitchenSlip(
        rows as Parameters<typeof preparePosOrderItemsForKitchenSlip>[0],
        { ...posReceiptLineOpts, menus }
      )
      const mapped = prepared.map((it) => {
        const list = (it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] })
          .promoItems
        const line = it as {
          menuId?: string
          menuId1?: string
          menu_id1?: string
          kitchenRouteMenuId?: string
        }
        const menuId = isBanbanKitchenLine(line)
          ? String(line.menuId ?? '').trim()
          : String(line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.kitchenRouteMenuId ?? '').trim()
        const enrichedPromo =
          Array.isArray(list) && list.length > 0
            ? enrichPromoItemsWithOptionName(list).map((p) => {
                const optionName = String((p as { optionName?: string }).optionName ?? '').trim()
                const optionCode = String((p as { optionCode?: string | null }).optionCode ?? '').trim()
                if (optionName || optionCode) return p
                console.error('[POS_PRINT_OPTION_CODE_MISSING]', {
                  orderItemId: String((it as { id?: unknown }).id ?? ''),
                  menuId: String(p.menuId ?? '').trim() || menuId,
                  itemName: String((p as { menuName?: unknown }).menuName ?? (it as { name?: unknown }).name ?? ''),
                  promo: true,
                })
                return p
              })
            : undefined
        return {
          ...it,
          ...(enrichedPromo ? { promoItems: enrichedPromo } : {}),
        } as unknown as T
      })
      return mergeSetChildrenForReceipt(mapped as unknown as Parameters<typeof mergeSetChildrenForReceipt>[0], {
        optionNameByCode,
      }) as unknown as T[]
    },
    [
      posReceiptLineOpts,
      enrichPromoItemsWithOptionName,
      menus,
      optionNameByCode,
    ]
  )
  const kitchenSlipItemsForPrint = useCallback(
    (
      slipItems: KitchenSlipRoutingItem[],
      orderSource: KitchenSlipRoutingItem[],
      ki: { t: (key: string) => string },
      menuCatalog?: PosMenu[],
      optionNameByCodeForPrint?: Map<string, string>
    ) =>
      {
        const activeMenus = Array.isArray(menuCatalog) && menuCatalog.length > 0 ? menuCatalog : menus
        const activeOptionMap = optionNameByCodeForPrint ?? optionNameByCode
        return mapKitchenSlipGroupItemsForPrint(slipItems, {
          orderItems: orderSource,
          menuNameByMenuId: Object.fromEntries(
            activeMenus.map((m) => [String(m.id), String(m.name ?? '').trim()]).filter(([id, name]) => id && name)
          ),
          menuCodeByMenuId: Object.fromEntries(
            activeMenus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
          ),
          optionNameByCode: activeOptionMap,
          translateName: (name) => translatePosMenuLineForReceipt(name, ki.t),
          formatNote: formatLineNoteForPrint,
        })
      },
    [formatLineNoteForPrint, menus, optionNameByCode]
  )
  const resolveMenusForKitchenPrint = useCallback(
    async (
      rows: Array<Record<string, unknown>>,
      targetStoreCode?: string | null
    ): Promise<PosMenu[]> => {
      const catalog = Array.isArray(menus) ? menus : []
      const requiredMenuIds = new Set<string>()
      // 표시 단계와 동일하게 프로모 구성품을 먼저 복원해야 세트 구성품 menuId(예: 26/32)가
      // 원본 라인 스냅샷에 없어도 수집된다. (카탈로그 promoId 복원분 포함)
      let collectRows: Array<Record<string, unknown>> = rows
      try {
        const resolved = kitchenItemsWithResolvedPromo(rows as Record<string, unknown>[])
        if (Array.isArray(resolved) && resolved.length > 0) {
          collectRows = resolved as Array<Record<string, unknown>>
        }
      } catch {
        /* 프로모 복원 실패 시 원본 rows 기준으로 수집 */
      }
      for (const row of collectRows) {
        const menuId = String(
          (row as { menuId?: unknown; menuId1?: unknown; menu_id1?: unknown; menuId2?: unknown }).menuId1 ??
            (row as { menuId?: unknown; menuId1?: unknown; menu_id1?: unknown; menuId2?: unknown }).menuId ??
            (row as { menuId?: unknown; menuId1?: unknown; menu_id1?: unknown; menuId2?: unknown }).menu_id1 ??
            (row as { menuId?: unknown; menuId1?: unknown; menu_id1?: unknown; menuId2?: unknown }).menuId2 ??
            ''
        ).trim()
        if (menuId) requiredMenuIds.add(menuId)
        const promoItems = (row as { promoItems?: Array<{ menuId?: unknown }> }).promoItems
        if (Array.isArray(promoItems)) {
          for (const p of promoItems) {
            const promoMid = String((p as { menuId?: unknown }).menuId ?? '').trim()
            if (promoMid) requiredMenuIds.add(promoMid)
          }
        }
      }
      if (catalog.length > 0) {
        const catalogIds = new Set(catalog.map((m) => String(m.id ?? '').trim()).filter(Boolean))
        const missing = [...requiredMenuIds].filter((id) => !catalogIds.has(id))
        if (missing.length === 0) return catalog
      }
      try {
        const refreshed = await getPosMenus({
          fresh: true,
          storeCode: String(targetStoreCode || currentStoreId || '').trim() || undefined,
        })
        const refreshedList = Array.isArray(refreshed) ? (refreshed as PosMenu[]) : []
        if (refreshedList.length > 0) {
          applyPosMenusList(refreshedList)
          const refreshedIds = new Set(refreshedList.map((m) => String(m.id ?? '').trim()).filter(Boolean))
          const stillMissing = [...requiredMenuIds].filter((id) => !refreshedIds.has(id))
          if (stillMissing.length === 0) return refreshedList
          // 세트 구성품 등 매장 판매목록엔 없지만 이름 표기가 필요한 메뉴: 전역(매장 스코프 없음) 카탈로그에서 이름만 보강
          try {
            const globalRefreshed = await getPosMenus({ fresh: true })
            const globalList = Array.isArray(globalRefreshed) ? (globalRefreshed as PosMenu[]) : []
            if (globalList.length > 0) {
              const missingSet = new Set(stillMissing)
              const supplement = globalList.filter((m) => missingSet.has(String(m.id ?? '').trim()))
              if (supplement.length > 0) {
                const mergedList = [...refreshedList, ...supplement]
                const mergedIds = new Set(mergedList.map((m) => String(m.id ?? '').trim()).filter(Boolean))
                const afterMerge = [...requiredMenuIds].filter((id) => !mergedIds.has(id))
                if (afterMerge.length > 0) {
                  console.error('[POS_PRINT_MENU_MAPPING_MISSING]', {
                    storeCode: String(targetStoreCode || currentStoreId || '').trim(),
                    missingMenuIds: afterMerge.slice(0, 50),
                  })
                }
                return mergedList
              }
            }
          } catch {
            /* 전역 카탈로그 보강 실패 시 매장 스코프 목록으로 진행 */
          }
          console.error('[POS_PRINT_MENU_MAPPING_MISSING]', {
            storeCode: String(targetStoreCode || currentStoreId || '').trim(),
            missingMenuIds: stillMissing.slice(0, 50),
          })
          return refreshedList
        }
      } catch {
        /* 메뉴 카탈로그 재조회 실패 시 현재 스냅샷으로 진행 */
      }
      if (catalog.length > 0) {
        const catalogIds = new Set(catalog.map((m) => String(m.id ?? '').trim()).filter(Boolean))
        const stillMissing = [...requiredMenuIds].filter((id) => !catalogIds.has(id))
        if (stillMissing.length > 0) {
          console.error('[POS_PRINT_MENU_MAPPING_MISSING]', {
            storeCode: String(targetStoreCode || currentStoreId || '').trim(),
            missingMenuIds: stillMissing.slice(0, 50),
          })
        }
      }
      return catalog
    },
    [applyPosMenusList, currentStoreId, kitchenItemsWithResolvedPromo, menus]
  )
  const resolveOptionNameByCodeForKitchenPrint = useCallback(
    async (
      rows: Array<Record<string, unknown>>,
      menuCatalog: PosMenu[]
    ): Promise<Map<string, string>> => {
      const requiredOptionCodes = new Set<string>()
      const addCode = (raw: unknown) => {
        const code = String(raw ?? '').trim().toUpperCase()
        if (code) requiredOptionCodes.add(code)
      }
      const addCodesFromNote = (rawNote: unknown) => {
        const note = String(rawNote ?? '')
        const matches = note.match(/optc:\s*([A-Za-z0-9,\-_]+)/gi) || []
        for (const hit of matches) {
          const payload = String(hit).replace(/^optc:\s*/i, '')
          for (const part of payload.split(',')) addCode(part)
        }
      }
      let needsGrabPromoSizeInference = false
      for (const row of rows) {
        addCode((row as { optionCode?: unknown }).optionCode)
        addCode((row as { optionCode1?: unknown }).optionCode1)
        addCode((row as { optionCode2?: unknown }).optionCode2)
        const optionCodes = (row as { optionCodes?: unknown[] }).optionCodes
        if (Array.isArray(optionCodes)) optionCodes.forEach((c) => addCode(c))
        addCodesFromNote((row as { note?: unknown }).note)
        const promoItems = (row as {
          promoItems?: Array<{ menuId?: unknown; optionCode?: unknown; optionName?: unknown }>
        }).promoItems
        if (Array.isArray(promoItems)) {
          for (const p of promoItems) {
            addCode((p as { optionCode?: unknown }).optionCode)
            const mid = String((p as { menuId?: unknown }).menuId ?? '').trim()
            const hasOpt =
              String((p as { optionName?: unknown }).optionName ?? '').trim() ||
              String((p as { optionCode?: unknown }).optionCode ?? '').trim()
            if (mid && !hasOpt) needsGrabPromoSizeInference = true
          }
        }
      }
      if (requiredOptionCodes.size === 0 && !needsGrabPromoSizeInference) return optionNameByCode

      const hasCodeInCurrentMap = (codeUpper: string): boolean => {
        if (optionNameByCode.has(codeUpper)) return true
        for (const [k] of optionNameByCode.entries()) {
          if (String(k ?? '').trim().toUpperCase() === codeUpper) return true
        }
        return false
      }
      const missingCodes = [...requiredOptionCodes].filter((code) => !hasCodeInCurrentMap(code))
      if (missingCodes.length === 0) return optionNameByCode

      try {
        const [rowsDefault, rowsCodeMap] = await Promise.all([
          getPosMenuOptions({ fresh: true }),
          getPosMenuOptions({ fresh: true, forCodeMap: true }),
        ])
        setMenuOptions(Array.isArray(rowsDefault) ? rowsDefault : [])
        setMenuOptionsForCodeMap(Array.isArray(rowsCodeMap) ? rowsCodeMap : [])
        const rebuilt = buildOptionNameByCodeFromMenus(
          menuCatalog,
          Array.isArray(rowsCodeMap) && rowsCodeMap.length > 0 ? rowsCodeMap : Array.isArray(rowsDefault) ? rowsDefault : []
        )
        const stillMissing = [...requiredOptionCodes].filter((code) => {
          if (rebuilt.has(code)) return false
          for (const [k] of rebuilt.entries()) {
            if (String(k ?? '').trim().toUpperCase() === code) return false
          }
          return true
        })
        if (stillMissing.length > 0) {
          console.error('[POS_PRINT_OPTION_CODE_MAPPING_MISSING]', {
            missingOptionCodes: stillMissing.slice(0, 80),
          })
        }
        return rebuilt.size > 0 ? rebuilt : optionNameByCode
      } catch {
        console.error('[POS_PRINT_OPTION_CODE_MAPPING_REFRESH_FAILED]', {
          missingOptionCodes: missingCodes.slice(0, 80),
        })
      }
      return optionNameByCode
    },
    [optionNameByCode]
  )
  usePosMenusCatalogLiveRefresh(applyPosMenusList, currentStoreId || null)
  const drawerOpenWarnedRef = useRef(false)
  /** 더치·분할: 인원별 현금 결제 확정 시 돈통을 이미 연 경우(주문 완료 시 중복 오픈 방지) */
  const splitCashDrawerStepsRef = useRef(0)
  const posPrinterSettingsRef = useRef<PosPrinterSettings | null>(null)
  const posPrinterSettingsStoreCodeRef = useRef("")
  const posPrinterSettingsInFlightStoreCodeRef = useRef("")
  const posPrinterSettingsInFlightRef = useRef<Promise<PosPrinterSettings> | null>(null)
  const storeSettingsLoadSeqRef = useRef(0)
  const saasModules = useSaasEnabledModules()

  const getPrinterSettingsForStore = useCallback(async (targetStoreCode: string): Promise<PosPrinterSettings> => {
    const normalizedStoreCode = String(targetStoreCode || "").trim()
    if (!normalizedStoreCode) throw new Error("missing_store_code")
    if (
      posPrinterSettingsRef.current &&
      posPrinterSettingsStoreCodeRef.current === normalizedStoreCode
    ) {
      if (isPosPrintDebugEnabledInBrowser()) {
        console.info('[POS_PRINT_DEBUG] printer_settings_cache_hit', {
          requestedStoreCode: normalizedStoreCode,
          currentStoreId: String(currentStoreId ?? ''),
          cachedStoreCode: posPrinterSettingsStoreCodeRef.current,
        })
      }
      return posPrinterSettingsRef.current
    }
    if (
      posPrinterSettingsInFlightRef.current &&
      posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode
    ) {
      return posPrinterSettingsInFlightRef.current
    }
    const request = getPosPrinterSettings({ storeCode: normalizedStoreCode })
      .then((settings) => {
        posPrinterSettingsRef.current = settings
        posPrinterSettingsStoreCodeRef.current = normalizedStoreCode
        if (isPosPrintDebugEnabledInBrowser()) {
          console.info('[POS_PRINT_DEBUG] printer_settings_loaded', {
            requestedStoreCode: normalizedStoreCode,
            currentStoreId: String(currentStoreId ?? ''),
            responseStoreCode: String((settings as { storeCode?: string } | null)?.storeCode ?? ''),
          })
        }
        return settings
      })
      .finally(() => {
        if (posPrinterSettingsInFlightStoreCodeRef.current === normalizedStoreCode) {
          posPrinterSettingsInFlightRef.current = null
          posPrinterSettingsInFlightStoreCodeRef.current = ""
        }
      })
    posPrinterSettingsInFlightStoreCodeRef.current = normalizedStoreCode
    posPrinterSettingsInFlightRef.current = request
    return request
  }, [currentStoreId])

  const kitchenSlipOrderTypeLabel = useCallback(
    (
      ctx: {
        orderType?: string
        tableName?: string
        orderNo?: string
        memo?: string
        deliveryAppCode?: string
        items?: Array<{ deliveryAppCode?: string } | Record<string, unknown>>
      },
      ki: ReturnType<typeof kitchenSlipPrintI18n>
    ) =>
      resolveKitchenSlipOrderTypeLabel(
        {
          orderType: ctx.orderType,
          tableName: ctx.tableName,
          orderNo: ctx.orderNo,
          memo: ctx.memo,
          deliveryAppCode: ctx.deliveryAppCode,
          itemDeliveryAppCodes: ctx.items?.map(
            (it) => (it as { deliveryAppCode?: string }).deliveryAppCode
          ),
        },
        ki,
        deliveryAppsFromApi
      ),
    [deliveryAppsFromApi]
  )

  const printKitchenFromPosOrder = useCallback(
    async (
      order: PosOrder,
      opts?: {
        kitchenLines?: Array<Record<string, unknown>>
      }
    ): Promise<void> => {
      const orderId = Number(order.id ?? 0)
      if (!Number.isFinite(orderId) || orderId <= 0) {
        throw new Error('invalid_order_id')
      }
      const effectiveStoreCode = String(currentStoreId || order.storeCode || '').trim()
      if (!effectiveStoreCode) throw new Error('missing_store_code')
      const rawItems: Array<Record<string, unknown>> =
        Array.isArray(opts?.kitchenLines) && opts.kitchenLines.length > 0
          ? (opts.kitchenLines as Array<Record<string, unknown>>)
          : Array.isArray(order.items)
            ? (order.items as unknown as Array<Record<string, unknown>>)
            : []
      if (!rawItems.length) throw new Error('empty_order_items')
      const items = prepareOrderItemsForKitchenPrint(rawItems, order.deliveryAppCode)
      const settings = await getPrinterSettingsForStore(effectiveStoreCode)
      const menusForPrint = await resolveMenusForKitchenPrint(items as Array<Record<string, unknown>>, effectiveStoreCode)
      const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
        items as Array<Record<string, unknown>>,
        menusForPrint
      )
      const ki = kitchenSlipPrintI18n(settings, lang)
      const slips = buildKitchenSlipGroups(
        kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as typeof items,
        buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
      )
      if (!slips.length) throw new Error('no_slips_to_print')
      const slipDesign = resolveKitchenSlipDesign(settings)
      const memoLine = buildPosCustomerMemoLineForPrint(order.memo, ki.t, ki.lang)
      for (let idx = 0; idx < slips.length; idx += 1) {
        const slip = slips[idx]
        const tablePart = order.tableName
          ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(order.tableName, ki.t)
          : ''
        const orderTypeLabel = kitchenSlipOrderTypeLabel(order, ki)
        const html = buildKitchenSlipDocumentHtml({
          label: slip.label,
          orderNo: order.orderNo ?? '',
          storeCode: effectiveStoreCode,
          orderTypeLabel,
          tablePart,
          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
          items: kitchenSlipItemsForPrint(
            slip.items,
            kitchenItemsWithResolvedPromo(items as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
            ki,
            menusForPrint,
            optionNameByCodeForPrint
          ),
          memoLine: memoLine || null,
          escapeHtml,
          design: slipDesign,
          printerSettings: settings,
          optionNameByCode: optionNameByCodeForPrint,
          printColorAdjust: 'exact',
          ...posKitchenGuestSpread(order.guestCount, ki.t('posOrderGuestCount')),
        })
        await printPosHtmlDocument(html, {
          title: slip.label,
          printDelayMs: 0,
          focusIframeBeforePrint: false,
          printRole: 'kitchen',
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
          onPrintUnavailable: () => {
            throw new Error('print_unavailable')
          },
        })
        if (idx + 1 < slips.length) {
          await new Promise((resolve) => setTimeout(resolve, resolveBetweenKitchenSlipsDelayMs()))
        }
      }
    },
    [
      currentStoreId,
      getPrinterSettingsForStore,
      kitchenItemsWithResolvedPromo,
      kitchenSlipItemsForPrint,
      kitchenSlipOrderTypeLabel,
      lang,
      optionNameByCode,
      prepareOrderItemsForKitchenPrint,
      resolveMenusForKitchenPrint,
    ]
  )

  const storeAutoPrintFromState = useMemo(
    (): StoreAutoPrintFlags => ({
      receiptOnOrder: autoPrintReceiptOnOrder,
      receiptOnAddOrder: autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder,
      receiptOnPayment: autoPrintReceiptOnPayment,
      kitchenOnOrder: autoPrintKitchenSlipOnOrder,
    }),
    [
      autoPrintReceiptOnOrder,
      autoPrintReceiptOnAddOrder,
      autoPrintReceiptOnPayment,
      autoPrintKitchenSlipOnOrder,
    ]
  )

  const resolveStoreAutoPrintFlags = useCallback(
    async (targetStoreCode: string): Promise<StoreAutoPrintFlags> => {
      try {
        const s = await getPrinterSettingsForStore(targetStoreCode)
        return mergeStoreAutoPrintFlags(storeAutoPrintFlagsFromSettings(s), storeAutoPrintFromState)
      } catch {
        return storeAutoPrintFromState
      }
    },
    [getPrinterSettingsForStore, storeAutoPrintFromState]
  )

  const readStoreAutoPrintFlagsSync = useCallback((): StoreAutoPrintFlags => {
    const code = String(currentStoreId || '').trim()
    const fromRef =
      code && String(posPrinterSettingsStoreCodeRef.current || '').trim() === code
        ? storeAutoPrintFlagsFromSettings(posPrinterSettingsRef.current)
        : storeAutoPrintFlagsFromSettings(null)
    return mergeStoreAutoPrintFlags(fromRef, storeAutoPrintFromState)
  }, [currentStoreId, storeAutoPrintFromState])

  useEffect(() => {
    if (orderType !== 'delivery') setDeliveryApp(null)
  }, [orderType])

  useEffect(() => {
    getPosDeliveryApps({ storeCode: currentStoreId || undefined })
      .then((list) => setDeliveryAppsFromApi(Array.isArray(list) ? list : []))
      .catch(() => setDeliveryAppsFromApi([]))
  }, [currentStoreId])

  useEffect(() => {
    if (saasModules != null && !isSaasModuleEnabled(saasModules, 'member_mgmt')) {
      setTakeoutMemberNames([])
      return
    }
    if (saasModules == null) return
    getMembers({ limit: 300 })
      .then((list) => {
        const names = Array.from(
          new Set(
            list
              .filter((m) => m.status !== 'inactive')
              .map((m) => String(m.name || '').trim())
              .filter(Boolean)
          )
        ).slice(0, 300)
        setTakeoutMemberNames(names)
      })
      .catch(() => setTakeoutMemberNames([]))
  }, [saasModules])

  useEffect(() => {
    const storeCode = auth?.store
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(s => setTodaySales({ completedCount: s.completedCount, completedTotal: s.completedTotal }))
      .catch(() => setTodaySales(null))
  }, [auth?.store])

  useEffect(() => {
    if (!currentStoreId) return
    const requestStoreCode = String(currentStoreId || '').trim()
    if (!requestStoreCode) return
    const seq = ++storeSettingsLoadSeqRef.current
    getPrinterSettingsForStore(requestStoreCode)
      .then((s) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        posPrinterSettingsRef.current = s
        posPrinterSettingsStoreCodeRef.current = requestStoreCode
        const fresh = Math.max(1, Number(s.cookingFreshMaxMin ?? 10))
        const warning = Math.max(fresh + 1, Number(s.cookingWarningMaxMin ?? 15))
        const warnDiff = Math.max(0, Number(s.cookingRecipeWarningDiffMin ?? 0))
        const urgentDiff = Math.max(warnDiff + 1, Number(s.cookingRecipeUrgentDiffMin ?? 5))
        setCookingRules({
          freshMaxMin: fresh,
          warningMaxMin: warning,
          mode: s.cookingRuleMode === 'recipe_diff' ? 'recipe_diff' : 'elapsed',
          recipeWarnDiff: warnDiff,
          recipeUrgentDiff: urgentDiff,
          delayBadgeEnabled: s.cookingDelayBadgeEnabled !== false,
          delaySoundEnabled: Boolean(s.cookingDelaySoundEnabled),
          delayAlertOverMin: Math.max(0, Number(s.cookingDelayAlertOverMin ?? 0)),
        })
        setAutoPrintReceiptOnOrder(Boolean(s.autoPrintReceiptOnOrder))
        setAutoPrintReceiptOnAddOrder(Boolean(s.autoPrintReceiptOnAddOrder || s.autoPrintReceiptOnOrder))
        setAutoPrintReceiptOnPayment(Boolean(s.autoPrintReceiptOnPayment ?? s.autoPrintReceiptOnOrder))
        setAutoPrintKitchenSlipOnOrder(Boolean(s.autoPrintKitchenSlipOnOrder))
        setAutoPrintFinalOrderBeforePayment(Boolean(s.autoPrintFinalOrderBeforePayment))
        setReceiptBizName(String(s.receiptBizName || ''))
        setReceiptBizTaxId(String(s.receiptBizTaxId || ''))
        setReceiptBizAbn(String(s.receiptBizAbn || ''))
        setReceiptBizOwner(String(s.receiptBizOwner || ''))
        setReceiptBizAddress(String(s.receiptBizAddress || ''))
        setReceiptBizPhone(String(s.receiptBizPhone || ''))
        setReceiptDesignStyle(s.receiptDesignStyle === 'simple' ? 'simple' : 'badge')
        setReceiptLogoSize(
          s.receiptLogoSize === 'sm'
            ? 'sm'
            : s.receiptLogoSize === 'lg'
              ? 'lg'
              : 'md'
        )
        setReceiptShowTitle(s.receiptShowTitle !== false)
        setReceiptShowPaidStamp(s.receiptShowPaidStamp !== false)
        setReceiptShowThankYou(s.receiptShowThankYou !== false)
        setReceiptShowCustomerCopy(s.receiptShowCustomerCopy !== false)
        setReceiptFooterPrimaryText(String(s.receiptFooterPrimaryText || '').trim())
        setReceiptFooterSecondaryText(String(s.receiptFooterSecondaryText || '').trim())
        setReceiptLogoImageUrl(String(s.receiptLogoImageUrl || '').trim())
        setReceiptStampImageUrl(String(s.receiptStampImageUrl || '').trim())
        setReceiptShowStamp(s.receiptShowStamp !== false)
        setReceiptStampOnlyTaxInvoice(s.receiptStampOnlyTaxInvoice !== false)
        setReceiptMembershipQrImageUrl(String(s.receiptMembershipQrImageUrl || '').trim())
        setReceiptMembershipQrLinkUrl(String(s.receiptMembershipQrLinkUrl || '').trim())
        setReceiptMembershipQrText(String(s.receiptMembershipQrText || '').trim())
        setReceiptShowMembershipQr(Boolean(s.receiptShowMembershipQr))
        setSignatureLine(Boolean(s.signatureLine))
        setReceiptBarcode(Boolean(s.receiptBarcode))
        setItemBarcode(Boolean(s.itemBarcode))
        setDrawerOpenOption(
          s.drawerOpenOption === 'password_and_reason'
            ? 'password_and_reason'
            : s.drawerOpenOption === 'force'
              ? 'force'
              : 'reason_only'
        )
        setReceiptPrintLang(String(s.receiptPrintLang ?? '').trim())
        setVatRate(Math.max(0, Number(s.vatRate ?? 7)))
        setVatMode(s.vatMode === 'separate' ? 'separate' : 'included')
        setServiceRate(Math.max(0, Number(s.serviceRate ?? 0)))
        setServiceMode(s.serviceMode === 'included' ? 'included' : 'separate')
        setCardRate(Math.max(0, Number(s.cardRate ?? 0)))
        setCardMode(s.cardMode === 'included' ? 'included' : 'separate')
        setCardBaseMode(
          s.cardBaseMode === 'card_plus_vat'
            ? 'card_plus_vat'
            : s.cardBaseMode === 'card_plus_vat_service'
              ? 'card_plus_vat_service'
              : 'card_only'
        )
        setOtherRate(Math.max(0, Number(s.otherRate ?? 0)))
        setOtherMode(s.otherMode === 'included' ? 'included' : 'separate')
        setFeeStackMode(normalizeFeeStackMode(s.feeStackMode))
        setFeeStackOrder(normalizeFeeStackOrder(s.feeStackOrder))
        setDualMonitorEnabled(Boolean(s.dualMonitorEnabled))
        setRequireGuestCount(s.requireGuestCount !== false)
        setCustomerDisplayAutoOpen(s.customerDisplayAutoOpen !== false)
        setCustomerDisplayMonitorPreference(
          s.customerDisplayMonitorPreference === 'primary-only' ? 'primary-only' : 'secondary-first'
        )
        const rawCustomerDisplayLangOverride = String(s.customerDisplayLangOverride ?? '').trim()
        setCustomerDisplayLangMode(
          s.customerDisplayLangMode === 'custom' && isLangCode(rawCustomerDisplayLangOverride)
            ? 'custom'
            : 'follow-pos'
        )
        setCustomerDisplayLangOverride(isLangCode(rawCustomerDisplayLangOverride) ? rawCustomerDisplayLangOverride : lang)
        setCustomerDisplayDefaultState(s.customerDisplayDefaultState === 'qr' ? 'qr' : 'idle')
        setCustomerDisplayIdleMessage(String(s.customerDisplayIdleMessage ?? '').trim())
        setCustomerDisplayPaymentMessage(String(s.customerDisplayPaymentMessage ?? '').trim())
        setCustomerDisplayQrPayload(String(s.customerDisplayQrPayload ?? '').trim())
        setCustomerDisplayShowOrderSummary(s.customerDisplayShowOrderSummary !== false)
        setCustomerDisplayShowOrderTotal(s.customerDisplayShowOrderTotal !== false)
        const imt = String(s.customerDisplayIdleMediaType || 'none').toLowerCase()
        setCustomerDisplayIdleMediaType(imt === 'image' ? 'image' : imt === 'video' ? 'video' : 'none')
        setCustomerDisplayIdleMediaUrl(String(s.customerDisplayIdleMediaUrl ?? '').trim())
      })
      .catch(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        /**
         * 설정 재조회가 일시 실패해도, 같은 매장에 이미 로드된 프린터 설정이 있으면
         * 자동인쇄 플래그를 false 기본값으로 덮어쓰지 않는다.
         * (주문 직전/직후 네트워크 흔들림으로 수동 인쇄 팝업이 뜨는 현상 방지)
         */
        const hasUsableCachedSettings =
          posPrinterSettingsRef.current != null &&
          String(posPrinterSettingsStoreCodeRef.current || '').trim() === requestStoreCode
        if (hasUsableCachedSettings) return
        posPrinterSettingsRef.current = null
        posPrinterSettingsStoreCodeRef.current = ""
        setCookingRules({
          freshMaxMin: 10,
          warningMaxMin: 15,
          mode: 'elapsed',
          recipeWarnDiff: 0,
          recipeUrgentDiff: 5,
          delayBadgeEnabled: true,
          delaySoundEnabled: false,
          delayAlertOverMin: 0,
        })
        setAutoPrintReceiptOnOrder(false)
        setAutoPrintReceiptOnAddOrder(false)
        setAutoPrintReceiptOnPayment(false)
        setAutoPrintKitchenSlipOnOrder(false)
        setAutoPrintFinalOrderBeforePayment(false)
        setReceiptBizName('')
        setReceiptBizTaxId('')
        setReceiptBizAbn('')
        setReceiptBizOwner('')
        setReceiptBizAddress('')
        setReceiptBizPhone('')
        setReceiptDesignStyle('badge')
        setReceiptLogoSize('md')
        setReceiptShowTitle(true)
        setReceiptShowPaidStamp(true)
        setReceiptShowThankYou(true)
        setReceiptShowCustomerCopy(true)
        setReceiptFooterPrimaryText('')
        setReceiptFooterSecondaryText('')
        setReceiptLogoImageUrl('')
        setReceiptStampImageUrl('')
        setReceiptShowStamp(true)
        setReceiptStampOnlyTaxInvoice(true)
        setReceiptMembershipQrImageUrl('')
        setReceiptMembershipQrLinkUrl('')
        setReceiptMembershipQrText('')
        setReceiptShowMembershipQr(false)
        setSignatureLine(false)
        setReceiptBarcode(false)
        setItemBarcode(false)
        setDrawerOpenOption('reason_only')
        setReceiptPrintLang('')
        setVatRate(7)
        setVatMode('included')
        setServiceRate(0)
        setServiceMode('separate')
        setCardRate(0)
        setCardMode('separate')
        setCardBaseMode('card_only')
        setOtherRate(0)
        setOtherMode('separate')
        setDualMonitorEnabled(false)
        setRequireGuestCount(true)
        setCustomerDisplayAutoOpen(true)
        setCustomerDisplayMonitorPreference('secondary-first')
        setCustomerDisplayLangMode('follow-pos')
        setCustomerDisplayLangOverride(lang)
        setCustomerDisplayDefaultState('idle')
        setCustomerDisplayIdleMessage('')
        setCustomerDisplayPaymentMessage('')
        setCustomerDisplayQrPayload('')
        setCustomerDisplayShowOrderSummary(true)
        setCustomerDisplayShowOrderTotal(true)
        setCustomerDisplayIdleMediaType('none')
        setCustomerDisplayIdleMediaUrl('')
      })
    setCatalogLoading(true)
    void Promise.allSettled([
      getPosMenus({ storeCode: requestStoreCode || undefined }),
      getPosMenuOptions({ forCodeMap: true }),
      getPosPromosWithItems({ includeInactive: true }),
    ])
      .then(([rMenus, rOpts, rPromos]) => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        if (rMenus.status === 'fulfilled') {
          applyPosMenusList(rMenus.value)
        } else {
          setMenus([])
          setMenuTargets({ byId: new Map(), byName: new Map() })
        }
        const opts = rOpts.status === 'fulfilled' && Array.isArray(rOpts.value) ? rOpts.value : []
        setMenuOptions(opts)
        setMenuOptionsForCodeMap(opts)
        const promos = rPromos.status === 'fulfilled' && Array.isArray(rPromos.value) ? rPromos.value : []
        setPromosWithItems(promos)
      })
      .finally(() => {
        if (seq !== storeSettingsLoadSeqRef.current) return
        setCatalogLoading(false)
      })
  }, [currentStoreId, applyPosMenusList, getPrinterSettingsForStore, lang])

  useLayoutEffect(() => {
    if (!pendingPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDineInPaymentFromOrder({
      ...pendingPayRequest,
      existingOrderId: pendingDineInOrderId,
      orderMember: pendingPayRequest.orderMember,
      orderMemo: pendingPayRequest.orderMemo,
    })
    setPendingPayRequest(null)
  }, [pendingPayRequest])

  useLayoutEffect(() => {
    if (!pendingTakeoutPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openTakeoutPaymentFromOrder({
      orderLabel: pendingTakeoutPayRequest.tableName,
      items: pendingTakeoutPayRequest.items,
      existingOrderId: pendingTakeoutOrderId,
      orderDiscount: pendingTakeoutPayRequest.orderDiscount,
      orderMember: pendingTakeoutPayRequest.orderMember,
      orderMemo: pendingTakeoutPayRequest.orderMemo,
    })
    setPendingTakeoutPayRequest(null)
  }, [pendingTakeoutPayRequest, pendingTakeoutOrderId])

  useLayoutEffect(() => {
    if (!pendingDeliveryPayRequest) return
    if (!cartRef.current) return
    cartRef.current.openDeliveryPaymentFromOrder({
      orderLabel: pendingDeliveryPayRequest.tableName,
      items: pendingDeliveryPayRequest.items,
      existingOrderId: pendingDeliveryOrderId,
      orderDiscount: pendingDeliveryPayRequest.orderDiscount,
      orderMember: pendingDeliveryPayRequest.orderMember,
      orderMemo: pendingDeliveryPayRequest.orderMemo,
    })
    setPendingDeliveryPayRequest(null)
  }, [pendingDeliveryPayRequest, pendingDeliveryOrderId])

  useEffect(() => {
    if (!currentStoreId) return
    try {
      const raw = window.localStorage.getItem(`${FLOOR_PREF_KEY}${currentStoreId}`)
      const floor = Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
      setActiveFloor(floor)
    } catch {
      setActiveFloor(1)
    }
  }, [currentStoreId])

  useEffect(() => {
    if (!currentStoreId) return
    try {
      window.localStorage.setItem(`${FLOOR_PREF_KEY}${currentStoreId}`, String(activeFloor))
    } catch {
      // ignore localStorage errors
    }
  }, [currentStoreId, activeFloor])

  const todayCompleted = todaySales?.completedCount ?? 0
  const totalSales = todaySales?.completedTotal ?? 0
  const getTableFloor = (tableId: string | null | undefined): 1 | 2 | 3 => {
    if (!tableId) return 1
    const raw = floorLayoutForView.find((tbl) => tbl.id === tableId)?.floor
    return Math.min(3, Math.max(1, Number(raw ?? 1) || 1)) as 1 | 2 | 3
  }

  const dineInMultiFloorLayout = useMemo(() => layoutHasMultipleFloors(currentLayout), [currentLayout])

  const floorLayoutForView = useMemo<PosTableItem[]>(() => {
    if (!isPosDemo) return currentLayout
    /** 레이아웃 API·매장 테이블을 id만으로 합치면 이름은 `1번`~`3번`이 반복될 수 있음 → 데모 바닥은 항상 1~9번 고정 */
    return Array.from({ length: 9 }, (_, idx) => {
      const slot = DEMO_FLOOR_3X3_SLOTS[idx] ?? DEMO_FLOOR_3X3_SLOTS[DEMO_FLOOR_3X3_SLOTS.length - 1]
      return {
        id: `demo-table-${idx + 1}`,
        name: `${idx + 1}번`,
        x: slot.x,
        y: slot.y,
        w: 120,
        h: 76,
        floor: 1,
        shape: idx === 4 ? 'round' : 'rect',
        seats: Math.max(2, idx % 3 === 0 ? 4 : idx % 3 === 1 ? 2 : 6),
        rotation: 0,
      } satisfies PosTableItem
    })
  }, [isPosDemo, currentLayout])

  const demoTableVisualStatusById = useMemo(() => {
    if (!isPosDemo) return new Map<string, { status: 'preparing' | 'partial_served' | 'completed'; createdAt: string; guestCount: number }>()
    // 데모에서는 9개 중 6개만 점유 상태로 보여 빈 테이블 주문 테스트가 가능해야 합니다.
    const minutes = [4, 11, 19, 7, 22, 14]
    const statuses: Array<'preparing' | 'partial_served' | 'completed'> = [
      'preparing', 'preparing', 'preparing',
      'partial_served', 'completed', 'partial_served',
    ]
    const map = new Map<string, { status: 'preparing' | 'partial_served' | 'completed'; createdAt: string; guestCount: number }>()
    floorLayoutForView.slice(0, 6).forEach((tbl, idx) => {
      const minAgo = minutes[idx] ?? 6
      map.set(tbl.id, {
        status: statuses[idx] ?? 'preparing',
        createdAt: new Date(Date.now() - minAgo * 60_000).toISOString(),
        guestCount: idx % 3 === 0 ? 4 : idx % 3 === 1 ? 2 : 6,
      })
    })
    return map
  }, [isPosDemo, floorLayoutForView])

  useEffect(() => {
    if (!isPosDemo) return
    // 데모 시작 시 전체 보기로 맞춰 빈 테이블(주문 테스트용)이 항상 보이게 합니다.
    setTableListMode('all')
  }, [isPosDemo, tourScenarioId])
  const selectedTable = useMemo(() => {
    if (!selectedTableId) return undefined
    const base = currentStore?.tables?.find((tbl) => tbl.id === selectedTableId)
    const fallbackLayout = floorLayoutForView.find((tbl) => tbl.id === selectedTableId)
    const fallbackTable: Table | undefined = fallbackLayout
      ? {
          id: fallbackLayout.id,
          name: fallbackLayout.name,
          seats: Math.max(1, Number(fallbackLayout.seats ?? 2) || 2),
          x: Number(fallbackLayout.x ?? 0) || 0,
          y: Number(fallbackLayout.y ?? 0) || 0,
          width: Number(fallbackLayout.w ?? 132) || 132,
          height: Number(fallbackLayout.h ?? 82) || 82,
          shape:
            fallbackLayout.shape === 'round'
              ? 'round'
              : fallbackLayout.shape === 'square'
                ? 'square'
                : 'rectangle',
          rotation: Number(fallbackLayout.rotation ?? 0) || 0,
          isOccupied: false,
        }
      : undefined
    const resolved = base ?? fallbackTable
    if (!resolved) return undefined
    if (demoDineInOrder?.tableId === selectedTableId) {
      return { ...resolved, order: demoDineInOrder.order, isOccupied: true }
    }
    return resolved
  }, [currentStore?.tables, selectedTableId, demoDineInOrder, floorLayoutForView])

  const servingTable = useMemo(() => {
    if (!servingTableId) return undefined
    const base = currentStore?.tables?.find((tbl) => tbl.id === servingTableId)
    const fallbackLayout = floorLayoutForView.find((tbl) => tbl.id === servingTableId)
    const fallbackTable: Table | undefined = fallbackLayout
      ? {
          id: fallbackLayout.id,
          name: fallbackLayout.name,
          seats: Math.max(1, Number(fallbackLayout.seats ?? 2) || 2),
          x: Number(fallbackLayout.x ?? 0) || 0,
          y: Number(fallbackLayout.y ?? 0) || 0,
          width: Number(fallbackLayout.w ?? 132) || 132,
          height: Number(fallbackLayout.h ?? 82) || 82,
          shape:
            fallbackLayout.shape === 'round'
              ? 'round'
              : fallbackLayout.shape === 'square'
                ? 'square'
                : 'rectangle',
          rotation: Number(fallbackLayout.rotation ?? 0) || 0,
          isOccupied: false,
        }
      : undefined
    const resolved = base ?? fallbackTable
    if (!resolved) return undefined
    if (demoDineInOrder?.tableId === servingTableId) {
      return { ...resolved, order: demoDineInOrder.order, isOccupied: true }
    }
    return resolved
  }, [currentStore?.tables, servingTableId, demoDineInOrder, floorLayoutForView])

  useEffect(() => {
    setDemoDineInOrder(null)
  }, [currentStoreId])

  const tourServingOrder = useMemo(() => {
    if (!servingTableId) return null
    if (demoDineInOrder?.tableId === servingTableId) return demoDineInOrder.order
    return currentStore?.tables.find((t) => t.id === servingTableId)?.order ?? null
  }, [servingTableId, demoDineInOrder, currentStore?.tables])
  const tourServingItemChecked = useMemo(() => {
    const order = tourServingOrder
    if (!order) return false
    const st = String(order.status)
    const items = order.items || []
    const servedCount = items.filter((it) => Boolean(it?.servedAt)).length
    const allServed = items.length > 0 && servedCount >= items.length
    if (st === 'ready') return allServed
    if (st === 'partial_served') return true
    return servedCount > 0
  }, [tourServingOrder])

  const selectedDeliveryOrderId = selectedDeliveryTargetId?.startsWith('delivery-order-')
    ? selectedDeliveryTargetId.replace('delivery-order-', '')
    : null
  const selectedDeliveryOrder = selectedDeliveryOrderId
    ? [...deliveryOrders, ...packagedDeliveryOrders, ...completedDeliveryOrders].find((o) => String(o.id) === selectedDeliveryOrderId)
    : null
  const selectedTakeoutOrderId = selectedTakeoutTargetId?.startsWith('takeout-order-')
    ? selectedTakeoutTargetId.replace('takeout-order-', '')
    : null
  const selectedTakeoutOrder = selectedTakeoutOrderId
    ? [...takeoutOrders, ...packagedTakeoutOrders, ...completedTakeoutOrders].find((o) => String(o.id) === selectedTakeoutOrderId)
    : null
  /** 포장 바 선택 시 poll 스냅샷에 품목이 비어 있으면 단건 조회로 보강 */
  useEffect(() => {
    if (activeTab !== 'takeout') return
    if (!selectedTakeoutOrderId || !currentStoreId || isPosDemo) return
    if (selectedTakeoutOrder?.items?.length) return
    const orderId = Number(selectedTakeoutOrderId)
    if (!Number.isFinite(orderId) || orderId <= 0) return
    let cancelled = false
    void getPosOrders({ orderId, storeCode: currentStoreId })
      .then((list) => {
        if (cancelled) return
        const po = list[0] as PosOrder | undefined
        if (!po?.id) return
        upsertOrderFromServer({
          ...po,
          storeCode: String(currentStoreId || po.storeCode || '').trim() || po.storeCode,
        })
      })
      .catch((e) => {
        console.warn('takeout order hydrate:', e)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    selectedTakeoutOrderId,
    selectedTakeoutOrder?.items?.length,
    currentStoreId,
    isPosDemo,
    upsertOrderFromServer,
  ])
  const hasPendingPaymentFlow =
    Boolean(pendingPayRequest) ||
    Boolean(pendingTakeoutPayRequest) ||
    Boolean(pendingDeliveryPayRequest) ||
    Boolean(pendingDineInOrderId) ||
    Boolean(pendingTakeoutOrderId) ||
    Boolean(pendingDeliveryOrderId)
  /** 홀·포장 장바구니 입력 중 — 배달 자동 탭 전환·모달 억제(결제 중과 동일 대기 큐) */
  const hasActiveWalkInCart =
    terminalCartLines.length > 0 && (activeTab === 'tables' || activeTab === 'takeout')
  /** 결제 모달·QR 대기·거스름 확인·홀/포장 입력 중 — 신규 배달 자동 탭 전환 억제 */
  const isIncomingDeliveryFocusLocked =
    tourPaymentModalOpen ||
    hasPendingPaymentFlow ||
    postPaymentCashChangeBaht != null ||
    kbankCallbackState === 'waiting' ||
    hasActiveWalkInCart
  const customerDisplayOrderItems = useMemo(
    () =>
      terminalCartLines.map((line) => {
        const qty = Math.max(1, Number((line as unknown as { quantity?: number; qty?: number }).quantity ?? (line as unknown as { qty?: number }).qty ?? 1))
        const price = Math.max(0, Number((line as unknown as { price?: number }).price ?? 0))
        return {
          name: String((line as unknown as { name?: string }).name || ''),
          qty,
          amount: qty * price,
        }
      }),
    [terminalCartLines]
  )
  const customerDisplayOrderTotal = useMemo(
    () => customerDisplayOrderItems.reduce((sum, it) => sum + it.amount, 0),
    [customerDisplayOrderItems]
  )
  const pricingAdjustments = useMemo<PosPricingAdjustments>(() => ({
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
    cardRate,
    cardMode,
    cardBaseMode,
    otherRate,
    otherMode,
    feeStackMode,
    feeStackOrder,
  }), [vatRate, vatMode, serviceRate, serviceMode, cardRate, cardMode, cardBaseMode, otherRate, otherMode, feeStackMode, feeStackOrder])

  const customerDisplayBreakdown = useMemo(() => {
    const subtotal = customerDisplayOrderTotal
    const discountAmt = 0
    const pricing = computePosPricing({
      subtotal,
      discountAmt,
      cardPaymentAmount: 0,
      adjustments: pricingAdjustments,
    })
    return {
      subtotal,
      discountAmt,
      vatFeeAmt: pricing.vatFeeAmt,
      ...receiptTaxDisplayFieldsFromPricing(pricing),
      vatRate: pricingAdjustments.vatRate,
      vatMode: pricingAdjustments.vatMode,
      serviceFeeAmt: pricing.serviceFeeAmt,
      serviceRate: pricingAdjustments.serviceRate,
      serviceMode: pricingAdjustments.serviceMode,
      cardFeeAmt: pricing.cardFeeAmt,
      cardRate: pricingAdjustments.cardRate,
      cardMode: pricingAdjustments.cardMode,
      otherFeeAmt: pricing.otherFeeAmt,
      otherRate: pricingAdjustments.otherRate,
      otherMode: pricingAdjustments.otherMode,
      total: pricing.finalTotal,
    }
  }, [customerDisplayOrderTotal, pricingAdjustments])
  /** 1023px 이하(세로 태블릿/모바일)에서만 하단 카트로 전환 */
  const isNarrowViewport = useMediaQuery('(max-width: 920px)')
  const showSidePanel =
    activeTab !== 'tables' ||
    Boolean(servingTable?.order) ||
    Boolean(selectedTableId) ||
    hasPendingPaymentFlow ||
    postPaymentCashChangeBaht != null
  const shouldFullscreenOrderDetailOnNarrow =
    isNarrowViewport &&
    (
      (activeTab === 'delivery' && Boolean(selectedDeliveryOrder)) ||
      (activeTab === 'takeout' && Boolean(selectedTakeoutOrder)) ||
      (activeTab === 'tables' && Boolean(servingTable?.order) && !pendingDineInOrderId)
    )
  const isDineInAddOrderMode =
    activeTab === 'tables' &&
    Boolean(pendingDineInOrderId) &&
    Boolean(selectedTableId) &&
    Boolean(servingTable?.order)
  const scrollIntoViewOnFocus = useScrollIntoViewOnFocus()
  const [isMainPosDevice, setIsMainPosDevice, mainDeviceMeta] = usePosMainDevice(currentStoreId || null)
  const posSessionStartedAtRef = useRef<number>(Date.now())
  const seenOrderIdsRef = useRef<Set<number>>(new Set())
  /** 결제 영수증 자동 인쇄 중복 방지(메인: 로컬 결제 + Realtime UPDATE/INSERT) */
  const printedPaymentReceiptIdsRef = useRef<Set<number>>(new Set())
  /** 배달 주문 할인·합계 변경 후 홀 주문서 재인쇄 중복 방지 */
  const printedHallDiscountReprintKeysRef = useRef<Set<string>>(new Set())
  /** 주방 주문서 자동 인쇄 중복 방지(수락/Realtime/폴링 동시 발화) */
  const printedKitchenSlipKeysRef = useRef<Map<string, number>>(new Map())
  /** 신규 배달 안내(도착/수락/Grab 승인)·탭 포커스: 주문 id당 한 번만 (last-id 한 개 비교는 다른 주문 처리 후 동일 id 재이벤트에서 뚫림) */
  const promptedPendingDeliveryOrderIdsRef = useRef<Set<number>>(new Set())
  /** 결제 등 화면 잠금 중 유입된 배달 — 잠금 해제 후 순서대로 포커스 */
  const deferredIncomingDeliveryQueueRef = useRef<IncomingDeliveryFocusParams[]>([])
  const [deferredIncomingDeliveryCount, setDeferredIncomingDeliveryCount] = useState(0)
  /** 결제·주문 입력 중(화면 잠금) 백그라운드로 자동 수락+인쇄 처리한 배달 주문 — 잠금 해제 후 재수락·재인쇄·수락 팝업 방지 */
  const backgroundAcceptedDeliveryOrderIdsRef = useRef<Set<number>>(new Set())
  const promptedGrabCustomerCancelIdsRef = useRef<Set<number>>(new Set())
  const grabCancelWatchSnapshotRef = useRef<Map<number, GrabCancelWatchSnap>>(new Map())
  const grabCancelWatchSeededRef = useRef(false)
  /** 첫 폴링에서 당일 기결제 건을 시드해 페이지 로드 시 영수증 대량 재인쇄 방지 */
  const paymentReceiptScanSeededRef = useRef(false)
  /**
   * 메인 포스: dine_in 품목 수량 스냅샷(다른 단말 UPDATE 시 id 추가 + 수량 증가를 모두 감지)
   * - key: orderId
   * - value: (itemId -> qty)
   */
  const dineInRemoteItemQtySnapshotRef = useRef<Map<number, Map<string, number>>>(new Map())
  /** 메인 포스가 updatePosOrder(추가주문) 직후 수신하는 Realtime UPDATE로 이중 인쇄 방지 */
  const mainPosSelfDineInUpdateSuppressUntilRef = useRef<Map<number, number>>(new Map())
  useEffect(() => {
    printedPaymentReceiptIdsRef.current = new Set()
    printedKitchenSlipKeysRef.current = new Map()
    promptedPendingDeliveryOrderIdsRef.current = new Set()
    deferredIncomingDeliveryQueueRef.current = []
    setDeferredIncomingDeliveryCount(0)
    paymentReceiptScanSeededRef.current = false
    dineInRemoteItemQtySnapshotRef.current = new Map()
    mainPosSelfDineInUpdateSuppressUntilRef.current = new Map()
  }, [currentStoreId])

  const normalizeKitchenAutoPrintDedupeKeys = useCallback((rawKeyOrKeys: string | string[]) => {
    return Array.from(
      new Set(
        (Array.isArray(rawKeyOrKeys) ? rawKeyOrKeys : [rawKeyOrKeys])
          .map((k) => String(k || '').trim())
          .filter(Boolean)
          .map((k) => `k2:${k}`)
      )
    )
  }, [])

  const reserveKitchenAutoPrintKey = useCallback(
    (rawKeyOrKeys: string | string[], ttlMs = 6 * 60 * 60 * 1000) => {
      const keys = normalizeKitchenAutoPrintDedupeKeys(rawKeyOrKeys)
      if (!keys.length) return true
      const store = String(currentStoreId || '').trim()
      const reserved = reservePosAutoPrintKeys(store, keys, ttlMs)
      if (reserved) {
        const now = Date.now()
        for (const key of keys) {
          printedKitchenSlipKeysRef.current.set(key, now)
        }
      }
      return reserved
    },
    [currentStoreId, normalizeKitchenAutoPrintDedupeKeys]
  )

  const releaseKitchenAutoPrintKey = useCallback(
    (rawKeyOrKeys: string | string[]) => {
      const keys = normalizeKitchenAutoPrintDedupeKeys(rawKeyOrKeys)
      if (!keys.length) return
      const store = String(currentStoreId || '').trim()
      releasePosAutoPrintKeys(store, keys)
      for (const key of keys) {
        printedKitchenSlipKeysRef.current.delete(key)
      }
    },
    [currentStoreId, normalizeKitchenAutoPrintDedupeKeys]
  )

  /**
   * 신규 주문 알림음 (브라우저 autoplay 정책에 따라 무음 처리될 수 있음)
   * - WAV(data URI) 차임 우선, 실패 시 WebAudio 폴백
   */
  const playIncomingOrderBeep = useCallback(() => {
    if (typeof window === 'undefined') return
    const playFallbackWithWebAudio = () => {
      try {
        const AC = (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
          | typeof AudioContext
          | undefined
        if (!AC) return
        const ctx = new AC()
        const now = ctx.currentTime
        const makeTone = (at: number, freq: number, dur: number, gainMax: number) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, at)
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(gainMax, at + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(at)
          osc.stop(at + dur + 0.02)
        }
        makeTone(now, 784, 0.12, 0.04)
        makeTone(now + 0.14, 1046, 0.14, 0.045)
        window.setTimeout(() => {
          void ctx.close().catch(() => {})
        }, 460)
      } catch {
        // ignore (no audio device / blocked by browser policy)
      }
    }
    try {
      const wavDataUri = getPosIncomingWavDataUri()
      const audio = new Audio(wavDataUri)
      audio.preload = 'auto'
      audio.volume = 0.9
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        void p.catch(() => {
          playFallbackWithWebAudio()
        })
      }
      return
    } catch {
      // fall through
    }
    playFallbackWithWebAudio()
  }, [])

  const logPosPrintDebug = useCallback(
    (event: string, detail?: Record<string, unknown>) => {
      if (!isPosPrintDebugEnabledInBrowser()) return
      try {
        console.info('[POS_PRINT_DEBUG]', event, {
          storeCode: String(currentStoreId ?? ''),
          isMainPosDevice,
          ...(detail || {}),
        })
      } catch {
        /* ignore console errors */
      }
    },
    [currentStoreId, isMainPosDevice]
  )

  const notifyKitchenAutoprintFailure = useCallback(
    (params: { error: unknown; orderRef?: string; flow?: string }) => {
      const kind = classifyKitchenAutoprintFailure(params.error)
      if (kind === 'skip') return
      const orderRef = String(params.orderRef ?? '').trim()
      const message = params.error instanceof Error ? params.error.message : String(params.error ?? '')
      if (orderRef) {
        markKitchenPrintFailure({
          orderRef,
          reason: `${kind}:${message || 'kitchen_autoprint_failed'}`,
        })
      }
      logPosPrintDebug('kitchen_autoprint_notice', {
        kind,
        flow: params.flow,
        orderRef,
        message,
      })
      const now = Date.now()
      if (!shouldShowKitchenAutoprintNotice(kitchenAutoprintNoticeShownAtRef.current, now)) return
      kitchenAutoprintNoticeShownAtRef.current = now
      const text =
        kind === 'network'
          ? t('posKitchenAutoprintFailNetwork') ||
            '주방 주문서 출력이 실패했습니다. 서버 연결을 확인해 주세요.'
          : kind === 'print'
            ? t('posKitchenAutoprintFailPrint') ||
              '주방 주문서 출력이 실패했습니다. 프린터 연결을 확인해 주세요.'
            : t('posKitchenAutoprintFailOther') ||
              '주방 주문서 출력이 실패했습니다. 잠시 후 주문을 다시 출력해 주세요.'
      const withOrder = orderRef ? `${text} (#${orderRef})` : text
      setKitchenAutoprintNotice({ text: withOrder, ...(orderRef ? { orderRef } : {}) })
      if (kitchenAutoprintNoticeTimerRef.current != null) {
        clearTimeout(kitchenAutoprintNoticeTimerRef.current)
      }
      kitchenAutoprintNoticeTimerRef.current = setTimeout(() => {
        kitchenAutoprintNoticeTimerRef.current = null
        setKitchenAutoprintNotice(null)
      }, 12_000)
    },
    [logPosPrintDebug, t]
  )

  /** 주방 자동인쇄 — dedupe + await 순차 출력(printKitchenFromPosOrder). onAfterCleanup 체인 회귀 방지 */
  const dispatchKitchenAutoPrintForPosOrder = useCallback(
    async (
      order: PosOrder,
      opts: { dedupeKey: string; flow: string }
    ) => {
      if (!autoPrintKitchenSlipOnOrder) return
      const orderId = Number(order.id ?? 0)
      const dedupeKey = String(opts.dedupeKey || '').trim()
      if (!dedupeKey) return
      if (!reserveKitchenAutoPrintKey(dedupeKey)) {
        logPosPrintDebug('kitchen_autoprint_skip_dedupe', {
          orderId,
          flow: opts.flow,
          dedupeKey,
        })
        return
      }
      try {
        await printKitchenFromPosOrder(order)
        logPosPrintDebug('kitchen_autoprint_done', { orderId, flow: opts.flow })
      } catch (e) {
        releaseKitchenAutoPrintKey(dedupeKey)
        const message = e instanceof Error ? e.message : String(e)
        if (message === 'no_slips_to_print' || message === 'empty_order_items') {
          logPosPrintDebug('kitchen_autoprint_skip_empty_slips', { orderId, flow: opts.flow })
        } else {
          console.error(`Kitchen slip print (${opts.flow}):`, e)
          logPosPrintDebug('kitchen_autoprint_failed', { orderId, flow: opts.flow, message })
          notifyKitchenAutoprintFailure({
            error: e,
            orderRef: String(order.orderNo || orderId || '').trim(),
            flow: opts.flow,
          })
        }
      }
    },
    [
      autoPrintKitchenSlipOnOrder,
      logPosPrintDebug,
      notifyKitchenAutoprintFailure,
      printKitchenFromPosOrder,
      releaseKitchenAutoPrintKey,
      reserveKitchenAutoPrintKey,
    ]
  )

  const shouldSkipDineInRemoteAddAutoprint = useCallback(
    (
      orderId: number,
      storeCode: string,
      prevQtyById: Map<string, number>,
      newQtyById: Map<string, number>,
      changedKeys: Iterable<string>
    ): boolean => {
      const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId)
      if (suppressUntil != null && Date.now() < suppressUntil) {
        return true
      }
      const store = String(storeCode || currentStoreId || '').trim()
      const cooldown = DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS
      if (
        hasRecentPosAutoPrintKey(store, `order:${orderId}:hall:auto`, cooldown) ||
        hasRecentPosAutoPrintKey(store, `k2:order:${orderId}:kitchen`, cooldown)
      ) {
        return true
      }
      let prevTotal = 0
      for (const q of prevQtyById.values()) prevTotal += Math.max(0, Number(q) || 0)
      let newTotal = 0
      for (const q of newQtyById.values()) newTotal += Math.max(0, Number(q) || 0)
      if (prevTotal > 0 && prevTotal === newTotal) {
        for (const _ of changedKeys) {
          logPosPrintDebug('remote_dine_in_add_skip_key_drift', { orderId, prevTotal, newTotal })
          return true
        }
      }
      return false
    },
    [currentStoreId, logPosPrintDebug]
  )

  type DineInAddonKitchenCartLine = {
    id?: string
    name?: string
    price?: number
    quantity?: number
    qty?: number
    note?: string
    menuId?: string
    menuId1?: string
    menu_id1?: string
    menuId2?: string
    promoId?: string
    promoCode?: string
    promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
  }

  function buildDineInAddonKitchenFallbackDedupeKey(
    orderNoRaw: string,
    lines: DineInAddonKitchenCartLine[]
  ): string {
    const orderNo = String(orderNoRaw ?? '').trim()
    if (!orderNo || !lines.length) return ''
    const parts = lines
      .map((line) => {
        const name = String(line.name ?? '').trim()
        const price = Number(line.price ?? 0) || 0
        const note = String(line.note ?? '').trim()
        const qty = resolveCartLineQuantityForSave(line as { quantity?: unknown; qty?: unknown })
        return `${name}\u001f${price}\u001f${note}\u001f${qty}`
      })
      .filter(Boolean)
    if (!parts.length) return ''
    parts.sort()
    return `order-no:${orderNo}:kitchen:add:fallback:${parts.join('|')}`
  }

  /** 홀 추가 주문 — Realtime·폴링·로컬 제출 공통 주방 자동인쇄 */
  const dispatchDineInAddonKitchenPrint = useCallback(
    (params: {
      kitchenCartLines: DineInAddonKitchenCartLine[]
      dedupeKey: string
      orderNo: string
      storeCode: string
      tableName?: string
      memo?: string
      guestCount?: number
      logEvent: string
      orderTypeKey?: 'dine_in' | 'takeout' | 'delivery'
    }) => {
      const {
        kitchenCartLines,
        dedupeKey,
        orderNo,
        storeCode,
        tableName,
        memo,
        guestCount,
        logEvent,
        orderTypeKey = 'dine_in',
      } = params
      if (!kitchenCartLines.length) return
      const fallbackDedupeKey = buildDineInAddonKitchenFallbackDedupeKey(orderNo, kitchenCartLines)
      // 추가주문 주방 dedupe는 "내용 기반 add 키"(+fallback)만 쓴다.
      // 신규 주문 키(order:{id}:kitchen)를 섞으면, 신규 주문이 이미 그 키를 예약한 뒤
      // 첫 추가주문부터 6시간 TTL에 걸려 주방 슬립이 영구 미출력된다.
      // (같은 기기 중복은 self-suppress 윈도우 + 내용 기반 add 키가 막는다.)
      const dedupeKeys = Array.from(
        new Set([dedupeKey, fallbackDedupeKey].map((k) => String(k || '').trim()).filter(Boolean))
      )
      if (!reserveKitchenAutoPrintKey(dedupeKeys)) return
      logPosPrintDebug(logEvent, {
        orderNo,
        storeCode,
        dedupeKey,
        dedupeKeys,
        kitchenLines: kitchenCartLines.length,
      })
      const itemsForKitchen = kitchenCartLines.map((line) =>
        mapDineInAddonCartLineForKitchenPrint(line as Record<string, unknown>, {
          menus,
          enrichPromoItems: enrichPromoItemsWithOptionName,
        })
      )
      const printSettingsStoreCode = String(currentStoreId || storeCode || '').trim()
      void getPrinterSettingsForStore(printSettingsStoreCode)
        .then(async (settings) => {
          const ki = kitchenSlipPrintI18n(settings, lang)
          const menusForPrint = await resolveMenusForKitchenPrint(
            itemsForKitchen as Array<Record<string, unknown>>,
            printSettingsStoreCode
          )
          const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
            itemsForKitchen as Array<Record<string, unknown>>,
            menusForPrint
          )
          const slips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
            buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
          )
          if (!slips.length) return
          const slipDesign = resolveKitchenSlipDesign(settings)
          const memoLine = buildPosCustomerMemoLineForPrint(memo, ki.t, ki.lang)
          const cR = (tag: string) => '\u003c/' + tag + '>'
          const tablePartR = tableName
            ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
            : ''
          const addonKitchenHead =
            '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000">' +
            escapeHtml(tPrint('posReceiptAddonSection') || '추가 주문') +
            cR('div')
          const printOne = (idx: number) => {
            if (idx >= slips.length) return
            const slip = slips[idx]
            const html = buildKitchenSlipDocumentHtml({
              label: slip.label,
              orderNo,
              storeCode: printSettingsStoreCode,
              orderTypeLabel: kitchenSlipOrderTypeLabel({ orderType: orderTypeKey }, ki),
              tablePart: tablePartR,
              dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
              items: kitchenSlipItemsForPrint(
                slip.items,
                kitchenItemsWithResolvedPromo(
                  itemsForKitchen as Record<string, unknown>[]
                ) as KitchenSlipRoutingItem[],
                ki,
                menusForPrint,
                optionNameByCodeForPrint
              ),
              memoLine: memoLine || null,
              escapeHtml,
              design: slipDesign,
          printerSettings: settings,
              optionNameByCode: optionNameByCodeForPrint,
              printColorAdjust: 'exact',
              prependItemsHtml: idx === 0 ? addonKitchenHead : '',
              ...posKitchenGuestSpread(guestCount, ki.t('posOrderGuestCount')),
            })
            printPosHtmlDocument(html, {
              title: slip.label,
              printDelayMs: 0,
              focusIframeBeforePrint: false,
              printRole: 'kitchen',
              kitchenStation: slip.station,
              escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
              onPrintUnavailable: () => {
                notifyKitchenAutoprintFailure({
                  error: new Error('print_unavailable'),
                  orderRef: orderNo,
                  flow: logEvent,
                })
              },
              onAfterCleanup: () => {
                if (idx + 1 < slips.length)
                  setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
              },
            })
          }
          setTimeout(() => printOne(0), 0)
        })
        .catch((e) => {
          console.error('Kitchen slip print (dine-in add):', e)
          releaseKitchenAutoPrintKey(dedupeKeys)
          notifyKitchenAutoprintFailure({
            error: e,
            orderRef: orderNo,
            flow: logEvent,
          })
        })
    },
    [
      reserveKitchenAutoPrintKey,
      releaseKitchenAutoPrintKey,
      logPosPrintDebug,
      enrichPromoItemsWithOptionName,
      getPrinterSettingsForStore,
      currentStoreId,
      kitchenItemsWithResolvedPromo,
      resolveMenusForKitchenPrint,
      resolveOptionNameByCodeForKitchenPrint,
      menus,
      lang,
      kitchenSlipItemsForPrint,
      optionNameByCode,
      notifyKitchenAutoprintFailure,
      t,
      tPrint,
    ]
  )

  const recomputeRealtimeChannelHealthyRef = useRef<() => void>(() => {})
  const scheduleRealtimeResubscribeRef = useRef<() => void>(() => {})

  const makeRealtimeStatusHandler = useCallback(
    (channelKey: string) => (status: PosRealtimeSubscribeStatus, err?: Error) => {
      realtimeChannelStateRef.current.set(channelKey, status)
      recomputeRealtimeChannelHealthyRef.current()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        logPosPrintDebug('realtime_channel_degraded', {
          channelKey,
          status,
          message: err?.message,
        })
        const primaryInsertKey = mainPosPrimaryInsertChannelKey(currentStoreId)
        if (channelKey !== primaryInsertKey) return
        triggerMainPosPollNowRef.current?.()
        scheduleRealtimeResubscribeRef.current()
      }
    },
    [currentStoreId, logPosPrintDebug]
  )

  const runAutoPrintForAcceptedDeliveryOrder = useCallback(
    async (params: {
      orderId: number
      storeCode?: string
      memo?: string
      deliveryAppCode?: string
    }) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!isMainPosDevice || (!autoPrintReceiptOnOrder && !autoPrintKitchenSlipOnOrder)) {
        logPosPrintDebug('accept_flow_skip_not_main_or_autoprint_off', {
          orderId,
          autoPrintReceiptOnOrder,
          autoPrintKitchenSlipOnOrder,
        })
        return
      }
      let list = await getPosOrders({
        orderId,
        storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
      })
      if (!list.length) {
        list = await getPosOrders({
          orderId,
          storeCode: String(currentStoreId || '').trim() || undefined,
        })
      }
      const order = list[0]
      if (!order?.items?.length) {
        logPosPrintDebug('accept_flow_skip_empty_items', { orderId })
        return
      }
      const runKitchenForAcceptedOrder = () => {
        void dispatchKitchenAutoPrintForPosOrder(order, {
          dedupeKey: `order:${orderId}:kitchen`,
          flow: 'accept',
        })
      }
      if (autoPrintReceiptOnOrder) {
        const hallPayload = {
          ...hallOrderReceiptPayloadFromPosOrder(order, pricingAdjustments, {
            ...posReceiptLineOpts,
            orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, t),
            storeCodeFallback: currentStoreId,
          }),
          _autoPrintDedupeKey: `order:${orderId}:hall:auto`,
        }
        await printReceiptNow(
          hallPayload,
          undefined,
          false,
          undefined,
          true,
          autoPrintKitchenSlipOnOrder ? runKitchenForAcceptedOrder : undefined
        )
      } else if (autoPrintKitchenSlipOnOrder) {
        setTimeout(runKitchenForAcceptedOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
      logPosPrintDebug('accept_flow_autoprint_done', {
        orderId,
        autoPrintReceiptOnOrder,
        autoPrintKitchenSlipOnOrder,
      })
    },
    [
      isMainPosDevice,
      autoPrintReceiptOnOrder,
      autoPrintKitchenSlipOnOrder,
      currentStoreId,
      t,
      logPosPrintDebug,
      dispatchKitchenAutoPrintForPosOrder,
      pricingAdjustments,
      posReceiptLineOpts,
    ]
  )

  const decideIncomingPendingDeliveryOrder = useCallback(
    async (params: {
      orderId: number
      storeCode?: string
      memo?: string
      deliveryAppCode?: string
      onAccepted?: () => void
    }) => {
      try {
        const confirmed = await appConfirm(
          t('posIncomingDeliveryDecisionPrompt') ||
            '신규 배달 주문입니다.\n이 주문을 수락할까요?',
          {
            title: t('posOrderTypeDelivery') || '배달',
            confirmLabel: t('posDeliveryOrderAccept') || '수락',
            cancelLabel: t('posDeliveryOrderReject') || '반려',
          }
        )
        const orderId = Number(params.orderId)
        if (!Number.isFinite(orderId) || orderId <= 0) return
        const memo = String(params.memo || '')
        const grabOrderId = extractGrabOrderIdFromMemo(memo)
        if (confirmed) {
          const res = await updatePosOrderStatus({
            id: orderId,
            status: 'cooking',
            ...(grabOrderId ? { grabState: 'ACCEPTED' } : {}),
          })
          const applied = Boolean(res.success || res.statusAlreadyApplied)
          if (!applied) {
            await appAlert(localizeApiPopupMessage(res.message, t('processFail') || '처리 실패'))
            return
          }
          if (!res.success && res.statusAlreadyApplied && res.message) {
            await appAlert(localizeApiPopupMessage(res.message, t('processFail') || '처리 실패'))
          }
          refetchStores({ scope: 'all' })
          if (params.onAccepted) {
            params.onAccepted()
          } else {
            setActiveTab('delivery')
            setDeliveryListMode('in_progress')
            setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
          }
          if (String(params.deliveryAppCode || '').trim()) {
            setDeliveryApp(String(params.deliveryAppCode || '').trim().toLowerCase())
          }
          if (isMainPosDevice && (autoPrintReceiptOnOrder || autoPrintKitchenSlipOnOrder)) {
            let list = await getPosOrders({
              orderId,
              storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
            })
            if (!list.length) {
              list = await getPosOrders({
                orderId,
                storeCode: String(currentStoreId || '').trim() || undefined,
              })
            }
            const order = list[0]
            if (order?.items?.length) {
              const runKitchenForAcceptedOrder = () => {
                void dispatchKitchenAutoPrintForPosOrder(order, {
                  dedupeKey: `order:${orderId}:kitchen`,
                  flow: 'accept_manual',
                })
              }
              if (autoPrintReceiptOnOrder) {
                const hallPayload = {
                  ...hallOrderReceiptPayloadFromPosOrder(order, pricingAdjustments, {
                    ...posReceiptLineOpts,
                    orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, t),
                    storeCodeFallback: currentStoreId,
                  }),
                  _autoPrintDedupeKey: `order:${orderId}:hall:auto`,
                }
                await printReceiptNow(
                  hallPayload,
                  undefined,
                  false,
                  undefined,
                  true,
                  autoPrintKitchenSlipOnOrder ? runKitchenForAcceptedOrder : undefined
                )
              } else if (autoPrintKitchenSlipOnOrder) {
                setTimeout(runKitchenForAcceptedOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
              }
            }
          }
          refetchStores({ scope: 'all' })
          if (typeof window !== 'undefined') {
            window.setTimeout(() => refetchStores({ scope: 'all' }), 700)
            window.setTimeout(() => refetchStores({ scope: 'all' }), 1800)
          }
          return
        }

        markPosSelfInitiatedGrabCancel(orderId)
        const rejectRes = await updatePosOrderStatus({
          id: orderId,
          status: 'cancelled',
          ...(grabOrderId ? { grabState: 'CANCELLED' } : {}),
        })
        const rejectedApplied = Boolean(rejectRes.success || rejectRes.statusAlreadyApplied)
        if (!rejectedApplied) {
          await appAlert(localizeApiPopupMessage(rejectRes.message, t('processFail') || '처리 실패'))
          return
        }
        if (!rejectRes.success && rejectRes.statusAlreadyApplied && rejectRes.message) {
          await appAlert(localizeApiPopupMessage(rejectRes.message, t('processFail') || '처리 실패'))
        }
        if (grabOrderId) {
          await grabCancelOrderByStoreApi({
            orderID: grabOrderId,
            storeCode: String(params.storeCode || currentStoreId || '').trim() || undefined,
            cancelCode: 1002,
          })
        }
        refetchStores({ scope: 'all' })
        await appAlert(t('posOrderRejected') || '주문을 반려했습니다.')
      } catch (e) {
        await appAlert(t('posUnexpectedErrorDetail')?.replace('{{detail}}', String(e)) || String(e))
      }
    },
    [
      t,
      refetchStores,
      isMainPosDevice,
      autoPrintReceiptOnOrder,
      autoPrintKitchenSlipOnOrder,
      currentStoreId,
      menus,
      lang,
      resolveMenusForKitchenPrint,
      kitchenSlipItemsForPrint,
      kitchenItemsWithResolvedPromo,
      getPrinterSettingsForStore,
      enrichPromoItemsWithOptionName,
      pricingAdjustments,
      posReceiptLineOpts,
      optionNameByCode,
    ]
  )

  /**
   * 신규 "배달" 주문 UI 포커스(탭 전환·선택·알림음·수락 안내).
   * `promptedPendingDeliveryOrderIdsRef` 등록은 호출 전에 완료되어야 함.
   */
  const applyIncomingDeliveryFocusUi = useCallback(
    (params: IncomingDeliveryFocusParams) => {
      const orderId = Number(params.orderId)
      const deliveryCode = String(params.deliveryAppCode ?? '').trim().toLowerCase()
      const status = String(params.status ?? '').trim().toLowerCase()
      if (deliveryCode) setDeliveryApp(deliveryCode)
      refetchStores({ scope: 'all' })
      playIncomingOrderBeep()
      const focusDeliveryOrder = () => {
        setActiveTab('delivery')
        setDeliveryListMode('in_progress')
        setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
        setSelectedDeliveryTargetLabel('')
      }
      if (status === 'pending') {
        /** 잠금 중 백그라운드로 이미 수락+인쇄한 주문 — 재수락·재인쇄·팝업 없이 해당 주문만 포커스 */
        if (backgroundAcceptedDeliveryOrderIdsRef.current.has(orderId)) {
          focusDeliveryOrder()
          return
        }
        window.setTimeout(() => {
          /** 수동 키잉 배달은 `pending`이어도 웹훅 memo 앵커가 없음 → 수락/거절 팝업 생략 */
          if (!isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))) {
            void (async () => {
              const accepted = await appConfirm(
                t('posIncomingDeliveryArrivedPrompt') ||
                  '신규 배달 주문이 도착했습니다. 주문 화면으로 이동할까요?'
              )
              if (!accepted) return
              refetchStores({ scope: 'all' })
              focusDeliveryOrder()
            })()
            return
          }
          void decideIncomingPendingDeliveryOrder({
            orderId,
            storeCode: params.storeCode,
            memo: params.memo,
            deliveryAppCode: deliveryCode,
            onAccepted: focusDeliveryOrder,
          })
        }, 120)
        return
      }
      window.setTimeout(() => {
        void (async () => {
          const accepted = await appConfirm(
            t('posIncomingDeliveryArrivedPrompt') ||
              '신규 배달 주문이 도착했습니다. 주문 화면으로 이동할까요?'
          )
          if (!accepted) return
          refetchStores({ scope: 'all' })
          focusDeliveryOrder()
        })()
      }, 120)
    },
    [playIncomingOrderBeep, t, refetchStores, decideIncomingPendingDeliveryOrder]
  )

  /**
   * 결제·주문 입력 등 화면이 잠긴 상태에서 유입된 배달 웹훅(Grab 등) 주문을
   * 화면을 뺏지 않고 **백그라운드로 자동 수락 + 주방/영수증 인쇄**한다.
   * - 화면 포커스(탭 전환·수락 팝업)는 잠금 해제 후 flush에서 처리(여기선 인쇄만).
   * - 수동 키잉 배달(memo 앵커 없음)은 대상 아님 — 기존 "이동할까요?" 안내 유지.
   * - 이미 처리한 주문은 재수락·재인쇄·수락 팝업을 막기 위해 ref에 기록.
   */
  const backgroundAcceptAndPrintInboundDeliveryOrder = useCallback(
    async (params: IncomingDeliveryFocusParams) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!isMainPosDevice) return
      if (!autoPrintReceiptOnOrder && !autoPrintKitchenSlipOnOrder) return
      if (!isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))) return
      const status = String(params.status ?? '').trim().toLowerCase()
      if (status !== 'pending') return
      if (backgroundAcceptedDeliveryOrderIdsRef.current.has(orderId)) return
      backgroundAcceptedDeliveryOrderIdsRef.current.add(orderId)
      try {
        const grabOrderId = extractGrabOrderIdFromMemo(String(params.memo ?? ''))
        const res = await updatePosOrderStatus({
          id: orderId,
          status: 'cooking',
          ...(grabOrderId ? { grabState: 'ACCEPTED' } : {}),
        })
        const applied = Boolean(res.success || res.statusAlreadyApplied)
        if (!applied) {
          backgroundAcceptedDeliveryOrderIdsRef.current.delete(orderId)
          logPosPrintDebug('bg_accept_status_failed', { orderId, message: String(res.message ?? '') })
          return
        }
        refetchStores({ scope: 'all' })
        await runAutoPrintForAcceptedDeliveryOrder({
          orderId,
          storeCode: params.storeCode,
          memo: params.memo,
          deliveryAppCode: params.deliveryAppCode,
        })
        logPosPrintDebug('bg_accept_autoprint_done', { orderId })
      } catch (e) {
        backgroundAcceptedDeliveryOrderIdsRef.current.delete(orderId)
        console.error('Background accept+print (locked):', e)
      }
    },
    [
      isMainPosDevice,
      autoPrintReceiptOnOrder,
      autoPrintKitchenSlipOnOrder,
      refetchStores,
      runAutoPrintForAcceptedDeliveryOrder,
      logPosPrintDebug,
    ]
  )

  /**
   * 신규 "배달" 주문 자동 처리:
   * - 배달 탭으로 전환(결제 중이면 대기 큐)
   * - 해당 주문 자동 선택
   * - 배달앱 코드가 있으면 Grab/LineMan/Shopee 자동 선택
   * - 알림음 재생
   * - 주문 단말: 웹훅/API 유입(memo 앵커)만 알림 — 다른 POS 수동 키잉은 Realtime 무시
   */
  const autoFocusIncomingDeliveryOrder = useCallback(
    (params: IncomingDeliveryFocusParams) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!isSessionNewOrder(params.createdAt, posSessionStartedAtRef.current)) return
      const orderType = String(params.orderType ?? '').trim().toLowerCase()
      if (orderType !== 'delivery') return
      if (
        !isMainPosDevice &&
        !isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))
      ) {
        return
      }
      const status = String(params.status ?? '').trim().toLowerCase()
      if (status === 'cancelled' || status === 'refunded') return
      if (promptedPendingDeliveryOrderIdsRef.current.has(orderId)) return
      if (deferredIncomingDeliveryQueueRef.current.some((entry) => entry.orderId === orderId)) return

      if (isIncomingDeliveryFocusLocked) {
        deferredIncomingDeliveryQueueRef.current.push({ ...params, orderId })
        setDeferredIncomingDeliveryCount(deferredIncomingDeliveryQueueRef.current.length)
        refetchStores({ scope: 'all' })
        playIncomingOrderBeep()
        /** 화면은 안 뺏되, 주방·영수증 빌지는 백그라운드로 즉시 출력(웹훅 배달만) */
        void backgroundAcceptAndPrintInboundDeliveryOrder({ ...params, orderId })
        return
      }

      promptedPendingDeliveryOrderIdsRef.current.add(orderId)
      applyIncomingDeliveryFocusUi({ ...params, orderId })
    },
    [
      applyIncomingDeliveryFocusUi,
      isIncomingDeliveryFocusLocked,
      isMainPosDevice,
      playIncomingOrderBeep,
      refetchStores,
      backgroundAcceptAndPrintInboundDeliveryOrder,
    ]
  )

  const flushDeferredIncomingDeliveryOrders = useCallback(() => {
    if (isIncomingDeliveryFocusLocked) return
    const batch = [...deferredIncomingDeliveryQueueRef.current]
    if (batch.length === 0) return
    deferredIncomingDeliveryQueueRef.current = []
    setDeferredIncomingDeliveryCount(0)

    const first = batch[0]
    if (!promptedPendingDeliveryOrderIdsRef.current.has(first.orderId)) {
      promptedPendingDeliveryOrderIdsRef.current.add(first.orderId)
      applyIncomingDeliveryFocusUi(first)
    }
    for (let i = 1; i < batch.length; i += 1) {
      promptedPendingDeliveryOrderIdsRef.current.add(batch[i].orderId)
    }
    if (batch.length > 1) {
      void appAlert(
        (t('posIncomingDeliveryDeferredBatchHint') ||
          '결제 중 배달 주문 {{count}}건이 대기했습니다. 배달 탭에서 확인해 주세요.').replace(
          '{{count}}',
          String(batch.length)
        )
      )
    }
  }, [applyIncomingDeliveryFocusUi, isIncomingDeliveryFocusLocked, t])

  useEffect(() => {
    flushDeferredIncomingDeliveryOrders()
  }, [flushDeferredIncomingDeliveryOrders, isIncomingDeliveryFocusLocked])

  /** Grab 고객 취소(push order state) — Realtime UPDATE 시 팝업·알림음 */
  const notifyGrabCustomerCancelledOrder = useCallback(
    (params: { orderId: number; tableName?: string; orderNo?: string }) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (consumePosSelfInitiatedGrabCancel(orderId)) return
      if (promptedGrabCustomerCancelIdsRef.current.has(orderId)) return
      promptedGrabCustomerCancelIdsRef.current.add(orderId)

      playIncomingOrderBeep()
      if (typeof window !== 'undefined') {
        window.setTimeout(() => playIncomingOrderBeep(), 420)
      }
      refetchCurrentStore()

      const label =
        String(params.tableName ?? '').trim() ||
        (params.orderNo ? `POS #${params.orderNo}` : `Order #${orderId}`)
      const msg = (t('posGrabCustomerCancelledAlert') || '고객이 Grab에서 주문을 취소했습니다.\n\n{{label}}').replace(
        '{{label}}',
        label
      )

      if (isIncomingDeliveryFocusLocked) {
        void appAlert(msg)
        return
      }

      setActiveTab('delivery')
      setDeliveryListMode('all')
      setSelectedDeliveryTargetId(`delivery-order-${orderId}`)
      void appAlert(msg)
    },
    [isIncomingDeliveryFocusLocked, playIncomingOrderBeep, refetchCurrentStore, t]
  )

  const runGrabCancelWatchOnOrders = useCallback(
    (
      orders: Array<{ id?: number; status?: string; memo?: string; orderType?: string; tableName?: string; orderNo?: string }>,
      opts: { seedOnly?: boolean }
    ): boolean => {
      const newlyCancelled = syncGrabCancelWatchSnapshot(orders, grabCancelWatchSnapshotRef.current, {
        seedOnly: Boolean(opts.seedOnly),
      })
      if (opts.seedOnly) {
        grabCancelWatchSeededRef.current = true
        return false
      }
      if (!grabCancelWatchSeededRef.current) return false
      for (const orderId of newlyCancelled) {
        const order = orders.find((o) => Number(o.id) === orderId)
        notifyGrabCustomerCancelledOrder({
          orderId,
          tableName: order?.tableName,
          orderNo: order?.orderNo,
        })
      }
      return newlyCancelled.length > 0
    },
    [notifyGrabCustomerCancelledOrder]
  )

  const currentStoreCodeVariants = useMemo(() => {
    const base = String(currentStoreId || '').trim()
    if (!base) return [] as string[]
    return buildPosStoreCodeMatchVariants({
      storeCode: base,
      catalogStoreCodes: posStores,
      legacyToCanonical,
      storeLabels,
    })
  }, [currentStoreId, posStores, legacyToCanonical, storeLabels])

  const isCurrentStoreOrder = useCallback(
    (rawStoreCode: unknown) => posStoreCodeMatchesVariants(rawStoreCode, currentStoreCodeVariants),
    [currentStoreCodeVariants]
  )

  const isKbankPilotStore = useMemo(() => {
    const values = [
      String(currentStoreId || '').trim(),
      String(currentStore?.name || '').trim(),
      String(formatStoreLabel(currentStoreId || '') || '').trim(),
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim())
    return values.includes('cm office')
  }, [currentStoreId, currentStore?.name, formatStoreLabel])

  useEffect(() => {
    if (isKbankPilotStore) return
    setLiveKbankQrPayload('')
    setLiveKbankQrAmount(0)
    setLiveKbankQrType('THAI_QR')
    setKbankOpsTxnUid('')
    setKbankOpsOrigTxnUid('')
    setKbankOpsTxnNo('')
    setKbankOpsLastResult('')
    setKbankCallbackState('idle')
    kbankCallbackNotifiedTxRef.current = ''
    kbankCcInquiryTriggeredRef.current = ''
    pendingKbankFinalizeRef.current = {}
    deferredKbankApprovalRef.current = {}
    setCustomerDisplayPaymentMessage('')
  }, [isKbankPilotStore, currentStoreId])

  const kbankTerminalIdStorageKey = useMemo(() => {
    const store = String(currentStoreId || '').trim().toUpperCase()
    return store ? `pos.kbank.terminalId.${store}` : 'pos.kbank.terminalId'
  }, [currentStoreId])

  useEffect(() => {
    if (!isKbankPilotStore) return
    try {
      const saved = String(localStorage.getItem(kbankTerminalIdStorageKey) || '').trim()
      if (saved) setKbankOpsTerminalId(saved)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey])

  useEffect(() => {
    if (!isKbankPilotStore) return
    const value = String(kbankOpsTerminalId || '').trim()
    try {
      if (value) localStorage.setItem(kbankTerminalIdStorageKey, value)
    } catch {
      /* ignore */
    }
  }, [isKbankPilotStore, kbankTerminalIdStorageKey, kbankOpsTerminalId])

  useEffect(() => {
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    if (!partnerTxnUid) return
    if (String(kbankOpsOrigTxnUid || '').trim() !== partnerTxnUid) {
      setKbankOpsOrigTxnUid(partnerTxnUid)
    }
  }, [kbankOpsTxnUid, kbankOpsOrigTxnUid])

  const demoKbankQrPayload = useMemo(() => {
    if (!isPosDemo || !tourPaymentModalOpen) return ''
    const amount = Math.max(0, Number(tourPaymentQrAmount || 0))
    if (amount <= 0) return ''
    const store = String(currentStoreId || 'POS DEMO').trim() || 'POS DEMO'
    return `CMERP-DEMO-KBANK|${store}|${amount.toFixed(2)}`
  }, [isPosDemo, tourPaymentModalOpen, tourPaymentQrAmount, currentStoreId])

  const effectiveStaffKbankQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(demoKbankQrPayload || '').trim()
  }, [liveKbankQrPayload, demoKbankQrPayload])
  /** QR 이미지 없이 txnUid만 남은 경우(취소 후 Inquiry 등)에도 직원 모니터 표시 */
  const showKbankStaffMonitor = useMemo(
    () =>
      Boolean(
        String(effectiveStaffKbankQrPayload || '').trim() ||
          (!isPosDemo && isKbankPilotStore && String(kbankOpsTxnUid || '').trim())
      ),
    [effectiveStaffKbankQrPayload, isPosDemo, isKbankPilotStore, kbankOpsTxnUid]
  )
  const effectiveStaffKbankQrAmount = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live && liveKbankQrAmount > 0) return liveKbankQrAmount
    if (live) {
      const fromPayload = extractAmountFromEmvQrPayload(live)
      if (fromPayload > 0) return fromPayload
    }
    return Math.max(0, Number(tourPaymentQrAmount || 0))
  }, [liveKbankQrPayload, liveKbankQrAmount, tourPaymentQrAmount])

  const effectiveCustomerDisplayQrPayload = useMemo(() => {
    const live = String(liveKbankQrPayload || '').trim()
    if (live) return live
    return String(customerDisplayQrPayload || '').trim()
  }, [liveKbankQrPayload, customerDisplayQrPayload])
  const effectiveCustomerDisplayQrType = useMemo<'THAI_QR' | 'CREDIT_CARD'>(() => {
    if (String(liveKbankQrPayload || '').trim()) return liveKbankQrType
    const draftType = String(customerDisplayPaymentDraft?.paymentQrType || '').trim().toUpperCase()
    return draftType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR'
  }, [liveKbankQrPayload, liveKbankQrType, customerDisplayPaymentDraft?.paymentQrType])

  const staffKbankQrTypeLabel = useMemo(() => {
    const fromBank =
      liveKbankQrTypeSource === 'bank_qr_type' ||
      liveKbankQrTypeSource === 'bank_sof' ||
      liveKbankQrTypeSource === 'emv_payload'
    if (effectiveCustomerDisplayQrType === 'CREDIT_CARD') {
      return fromBank
        ? t('posKbankQrTypeCreditFromBank') || 'Credit Card QR (from bank)'
        : t('posKbankQrTypeCreditRequested') || 'Credit Card QR (requested · bank type not returned)'
    }
    return fromBank
      ? t('posKbankQrTypeThaiFromBank') || 'Thai QR · PromptPay (from bank)'
      : t('posKbankQrTypeThaiRequested') || 'Thai QR · PromptPay (requested)'
  }, [effectiveCustomerDisplayQrType, liveKbankQrTypeSource, t])

  useEffect(() => {
    if (String(liveKbankQrPayload || '').trim()) return
    setLiveKbankQrAmount(0)
  }, [liveKbankQrPayload])

  const schedulePostPaymentCustomerQr = useCallback(() => {
    const q = String(effectiveCustomerDisplayQrPayload || '').trim()
    if (!q) return
    const until = Date.now() + 16000
    setPostPaymentQrUntil(until)
    window.setTimeout(() => {
      setPostPaymentQrUntil((prev) => {
        if (prev === until) {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
          void executeLinkposClearQr({ storeCode: currentStoreId })
        }
        return prev === until ? 0 : prev
      })
    }, 16000)
  }, [currentStoreId, effectiveCustomerDisplayQrPayload])

  const customerDisplayUiLang = useMemo<LangCode>(() => {
    if (customerDisplayLangMode === 'custom' && isLangCode(customerDisplayLangOverride)) {
      return customerDisplayLangOverride
    }
    return lang
  }, [customerDisplayLangMode, customerDisplayLangOverride, lang])
  const customerDisplayT = useT(customerDisplayUiLang)

  useEffect(() => {
    if (!currentStoreId) return
    const shell = window.cmPosShell
    if (typeof shell?.configureCustomerDisplay !== 'function') return
    void shell.configureCustomerDisplay({
      enabled: dualMonitorEnabled,
      autoOpen: customerDisplayAutoOpen,
      monitorPreference: customerDisplayMonitorPreference,
      storeCode: currentStoreId,
    })
  }, [currentStoreId, dualMonitorEnabled, customerDisplayAutoOpen, customerDisplayMonitorPreference])

  useEffect(() => {
    if (!currentStoreId) return
    const brand = receiptLogoImageUrl.trim() || undefined
    const base: PosCustomerDisplayPayload = {
      storeCode: currentStoreId,
      kind: 'idle',
      updatedAt: new Date().toISOString(),
      uiLang: customerDisplayUiLang,
      showOrderSummary: customerDisplayShowOrderSummary,
      showOrderTotal: customerDisplayShowOrderTotal,
      idleMediaType: customerDisplayIdleMediaType,
      idleMediaUrl:
        customerDisplayIdleMediaType !== 'none' && customerDisplayIdleMediaUrl.trim()
          ? customerDisplayIdleMediaUrl.trim()
          : undefined,
      brandLogoUrl: brand,
    }
    const now = Date.now()
    const showPostPayQr = postPaymentQrUntil > now && String(effectiveCustomerDisplayQrPayload || '').trim().length > 0
    const showLiveKbankQr =
      Boolean(String(liveKbankQrPayload || '').trim()) &&
      String(effectiveCustomerDisplayQrPayload || '').trim().length > 0
    const showPostPayChange =
      postPaymentCashChangeBaht != null && Number.isFinite(postPaymentCashChangeBaht)

    const payload: PosCustomerDisplayPayload = showPostPayChange
      ? {
          ...base,
          kind: 'change',
          title: customerDisplayT('posCashChangePostPaymentTitle') || '거스름돈',
          message:
            customerDisplayT('posCashChangePostPaymentBody') ||
            '결제가 완료되었습니다. 아래 금액을 거슬러 주세요.',
          changeAmountBaht: postPaymentCashChangeBaht,
        }
      : showPostPayQr
      ? {
          ...base,
          kind: 'qr',
          title: customerDisplayT('posCustomerThankYou') || '감사합니다',
          message: customerDisplayT('posCustomerPostPaymentQrHint') || '아래 QR을 이용해 주세요.',
          qrPayload: effectiveCustomerDisplayQrPayload,
          qrType: effectiveCustomerDisplayQrType,
        }
      : showLiveKbankQr
        ? {
            ...base,
            kind: 'qr',
            title: customerDisplayT('posCustomerQrTitle') || 'QR 코드',
            message:
              customerDisplayPaymentMessage ||
              customerDisplayT('posScanToPayHint') ||
              '스캔 후 결제해 주세요.',
            qrPayload: effectiveCustomerDisplayQrPayload,
            qrType: effectiveCustomerDisplayQrType,
            totalAmount:
              effectiveStaffKbankQrAmount > 0
                ? effectiveStaffKbankQrAmount
                : customerDisplayBreakdown.total,
          }
        : hasPendingPaymentFlow
          ? {
              ...base,
              kind: 'payment',
              title: customerDisplayT('posCustomerPayment') || '결제 진행 중',
              message: customerDisplayPaymentMessage || undefined,
              items: customerDisplayOrderItems,
              totalAmount: customerDisplayBreakdown.total,
              breakdown: customerDisplayBreakdown,
              paymentLines: buildCustomerDisplayPaymentLines(customerDisplayPaymentDraft, customerDisplayT),
            }
          : customerDisplayOrderItems.length > 0
            ? {
                ...base,
                kind: 'ordering',
                title: customerDisplayT('posCustomerOrdering') || '주문 확인',
                items: customerDisplayOrderItems,
                totalAmount: customerDisplayOrderTotal,
              }
            : customerDisplayDefaultState === 'qr'
              ? {
                  ...base,
                  kind: 'qr',
                  title: customerDisplayT('posCustomerQrTitle') || 'QR 코드',
                  qrPayload: effectiveCustomerDisplayQrPayload,
                  qrType: effectiveCustomerDisplayQrType,
                }
              : {
                  ...base,
                  kind: 'idle',
                  message: customerDisplayIdleMessage || undefined,
                }
    publishPosCustomerDisplayState(payload)
    if (dualMonitorEnabled) {
      const shell = window.cmPosShell
      if (typeof shell?.setCustomerDisplayState === 'function') {
        void shell.setCustomerDisplayState(payload)
      }
    }
  }, [
    currentStoreId,
    dualMonitorEnabled,
    customerDisplayShowOrderSummary,
    customerDisplayShowOrderTotal,
    hasPendingPaymentFlow,
    customerDisplayLangMode,
    customerDisplayLangOverride,
    customerDisplayPaymentMessage,
    customerDisplayOrderTotal,
    customerDisplayBreakdown,
    customerDisplayOrderItems,
    customerDisplayDefaultState,
    customerDisplayQrPayload,
    liveKbankQrPayload,
    effectiveCustomerDisplayQrPayload,
    effectiveCustomerDisplayQrType,
    effectiveStaffKbankQrAmount,
    customerDisplayIdleMessage,
    customerDisplayIdleMediaType,
    customerDisplayIdleMediaUrl,
    receiptLogoImageUrl,
    postPaymentQrUntil,
    postPaymentCashChangeBaht,
    customerDisplayPaymentDraft,
    customerDisplayT,
    customerDisplayUiLang,
  ])

  useEffect(() => {
    if (activeTab === 'tables' && !selectedTableId) {
      clearCartFromTerminal()
    }
  }, [activeTab, selectedTableId, clearCartFromTerminal])

  const hasInitializedMainPosPollRef = useRef(false)
  const lastSeenOrderIdRef = useRef<number>(0)
  const lastSeenOrderIdPersistedRef = useRef<number>(0)
  const startupCatchupUntilRef = useRef<number>(Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS)
  const prevStoreForPollRef = useRef<string | null>(null)
  const triggerMainPosPollNowRef = useRef<(() => void) | null>(null)
  const mainPosPollInFlightRef = useRef(false)
  const lastMetaScanAtRef = useRef(0)
  const lastRealtimeOrderEventAtRef = useRef(0)
  const realtimeChannelStateRef = useRef<Map<string, PosRealtimeSubscribeStatus>>(new Map())
  const realtimeChannelHealthyRef = useRef(false)
  const pendingEmptyItemsOrderIdsRef = useRef<Set<number>>(new Set())
  const mainPosPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeResubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRealtimeResubscribeAtRef = useRef(0)
  const lastTriggerMainPosPollAtRef = useRef(0)
  const [realtimeResubscribeTick, setRealtimeResubscribeTick] = useState(0)

  const recomputeRealtimeChannelHealthy = useCallback(() => {
    realtimeChannelHealthyRef.current = isMainPosRealtimeInsertChannelHealthy(
      realtimeChannelStateRef.current
    )
  }, [])

  const scheduleRealtimeResubscribe = useCallback(() => {
    const now = Date.now()
    if (now - lastRealtimeResubscribeAtRef.current < MAIN_POS_REALTIME_RESUBSCRIBE_MIN_MS) return
    if (realtimeResubscribeTimerRef.current) clearTimeout(realtimeResubscribeTimerRef.current)
    realtimeResubscribeTimerRef.current = setTimeout(() => {
      lastRealtimeResubscribeAtRef.current = Date.now()
      realtimeChannelStateRef.current.clear()
      realtimeChannelHealthyRef.current = false
      setRealtimeResubscribeTick((n) => n + 1)
    }, MAIN_POS_REALTIME_RESUBSCRIBE_DELAY_MS)
  }, [])

  useEffect(() => {
    recomputeRealtimeChannelHealthyRef.current = recomputeRealtimeChannelHealthy
  }, [recomputeRealtimeChannelHealthy])

  useEffect(() => {
    scheduleRealtimeResubscribeRef.current = scheduleRealtimeResubscribe
  }, [scheduleRealtimeResubscribe])

  const bumpLastSeenOrderId = useCallback(
    (orderIdRaw: unknown) => {
      const orderId = Number(orderIdRaw)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      const next = Math.trunc(orderId)
      if (next > lastSeenOrderIdRef.current) {
        lastSeenOrderIdRef.current = next
      }
      if (next > lastSeenOrderIdPersistedRef.current) {
        lastSeenOrderIdPersistedRef.current = next
      }
      if (currentStoreId) {
        writeMainPosLastSeenOrderId(currentStoreId, next)
      }
    },
    [currentStoreId]
  )

  const shouldTreatAsIncomingOrder = useCallback(
    (orderIdRaw: unknown, createdAtRaw: unknown) => {
      const orderId = Number(orderIdRaw)
      if (!Number.isFinite(orderId) || orderId <= 0) return false
      if (isSessionNewOrder(createdAtRaw, posSessionStartedAtRef.current)) return true
      if (Date.now() > startupCatchupUntilRef.current) return false
      if (orderId <= lastSeenOrderIdPersistedRef.current) return false
      const createdAtMs = new Date(String(createdAtRaw ?? '').trim()).getTime()
      if (!Number.isFinite(createdAtMs)) return true
      return createdAtMs >= posSessionStartedAtRef.current - MAIN_POS_STARTUP_CATCHUP_WINDOW_MS
    },
    []
  )

  const resolveOrderItemDisplayName = useCallback(
    (item: { id?: string; name?: string; menuId?: string; promoId?: string; promoCode?: string }) => {
      const rawName = String(item.name ?? '').trim()
      // Grab 세트 자식 표식([[...]] child)은 영수증 병합 단계에서 필요하므로 원문 유지
      if (parseGrabSetChildLineName(rawName)) return rawName
      return resolvePosOrderItemMenuDisplayName(
        {
          id: String(item.id ?? ''),
          name: rawName,
          ...(String(item.menuId ?? '').trim() ? { menuId: String(item.menuId).trim() } : {}),
          ...(String(item.promoId ?? '').trim() ? { promoId: String(item.promoId).trim() } : {}),
          ...(String(item.promoCode ?? '').trim() ? { promoCode: String(item.promoCode).trim() } : {}),
        },
        menus,
        promosWithItems
      )
    },
    [menus, promosWithItems]
  )

  type RealtimeParsedPosOrderItem = {
    id: string
    name: string
    price: number
    qty: number
    note?: string
    menuId?: string
    menuId1?: string
    menuId2?: string
    optionCode?: string
    optionCode1?: string
    optionCode2?: string
    optionCodes?: string[]
    promoId?: string
    promoCode?: string
    promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
    lineDiscountAmt?: number
  }

  const mapPosOrderItemForKitchenDelta = useCallback(
    (it: Record<string, unknown>): RealtimeParsedPosOrderItem => {
      const mapped = mapPosOrderRowForKitchenPrint(it, {
        menus,
        enrichPromoItems: enrichPromoItemsWithOptionName,
      })
      const displayName = resolveOrderItemDisplayName({
        id: mapped.id,
        name: mapped.name,
        menuId: String(mapped.menuId ?? mapped.menuId1 ?? '').trim(),
      })
      const lineDiscountAmt = coercePosReceiptLineDiscountAmt(it)
      return {
        ...mapped,
        name: displayName,
        ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
      }
    },
    [enrichPromoItemsWithOptionName, menus, resolveOrderItemDisplayName]
  )

  const parseRealtimePosOrderRowItemsJson = useCallback(
    (row: Record<string, unknown>): { ok: true; items: RealtimeParsedPosOrderItem[] } | { ok: false } => {
      try {
        const raw = row.items_json
        const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
        const items = (Array.isArray(arr) ? arr : []).map((it) =>
          mapPosOrderItemForKitchenDelta(it as Record<string, unknown>)
        )
        return { ok: true, items }
      } catch {
        return { ok: false }
      }
    },
    [mapPosOrderItemForKitchenDelta]
  )

  const resolveDineInSnapshotItemKey = useCallback(
    (item: {
      id?: unknown
      name?: unknown
      price?: unknown
      note?: unknown
      menuId?: unknown
      optionCode?: unknown
    }): string =>
      resolveDineInKitchenSnapshotItemKey(item, {
        formatNote: formatLineNoteForPrint,
      }),
    []
  )

  const buildDineInQtySnapshot = useCallback(
    (
      items: Array<{
        id?: unknown
        qty?: unknown
        quantity?: unknown
        name?: unknown
        price?: unknown
        note?: unknown
        menuId?: unknown
        optionCode?: unknown
      }>
    ): Map<string, number> =>
      buildDineInQtySnapshotMap(items, (it) =>
        resolveDineInKitchenSnapshotItemKey(it, { formatNote: formatLineNoteForPrint })
      ),
    []
  )

  async function printReceiptNow(
    payload: {
      orderNo: string
      storeCode: string
      orderType: string
      tableName?: string
      memo?: string
      items: {
        id: string
        name: string
        price: number
        qty: number
        note?: string
        isAddon?: boolean
        menuId?: string
        promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
      }[]
      subtotal: number
      discountAmt: number
      total: number
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
      guestCount?: number
      /** 자동 인쇄 dedupe(탭·PC 공유). HTML·영수증 본문에는 사용하지 않음 */
      _autoPrintDedupeKey?: string
    },
    /** 사용자 클릭 직후 열어둔 창을 넘기면 팝업 차단/자동 인쇄 제한을 피할 수 있음 */
    existingWindow?: Window | null,
    /** true면 사용자 제스처 직후 호출로 간주 */
    fromUserGesture?: boolean,
    /** 주문 후 인쇄: 이 콜백을 넘기면 새 창 대신 HTML만 넘겨서 같은 페이지 iframe 모달로 보여줌 (팝업 차단 무관, iframe 안에서 인쇄 버튼 클릭 시 인쇄 화면 표시) */
    onShowInModal?: (html: string) => void,
    /** true면 주문 직인쇄: 숨김 iframe에 쓰고 print() (별도 브라우저 창 없음). 결제 등은 false */
    directPrint?: boolean,
    /** directPrint 일 때만: 영수증 인쇄 정리 후 호출(연속 인쇄 합침 방지용으로 내부에서 추가 지연) */
    onAfterDirectPrint?: () => void
  ) {
    if (posDemoRef.current) return
    const autoPrintDedupeKey = String(payload._autoPrintDedupeKey ?? '').trim()
    if (directPrint && autoPrintDedupeKey) {
      const storeForDedupe = String(currentStoreId || payload.storeCode || '').trim()
      const dedupeKeys = [autoPrintDedupeKey]
      const orderNo = String(payload.orderNo ?? '').trim()
      /** 저장 직후(orderNo 기반)와 리얼타임(orderId 기반) 키를 같은 예약 그룹으로 묶어 2장 인쇄 방지 */
      if (/:hall:auto$/u.test(autoPrintDedupeKey) && orderNo) {
        dedupeKeys.push(`submit:hall:${orderNo}`)
      }
      if (!reservePosAutoPrintKeys(storeForDedupe, dedupeKeys)) {
        logPosPrintDebug('hall_autoprint_skip_dedupe', {
          orderNo: payload.orderNo,
          dedupeKey: autoPrintDedupeKey,
          dedupeKeys,
          storeCode: storeForDedupe,
        })
        /**
         * 홀 영수증은 이미 다른 경로(Realtime·폴링·수락)에서 출력됐을 수 있음.
         * 주방은 별도 dedupe 키이므로, 홀만 건너뛸 때도 주방 콜백은 시도한다
         * (Grab 수락+폴링 경합 시 영수증만 나가고 주방이 영구 누락되는 GF-959 방지).
         */
        if (typeof onAfterDirectPrint === 'function') {
          onAfterDirectPrint()
        }
        return
      }
    }
    const { _autoPrintDedupeKey: _dedupeOmit, ...payloadWithoutDedupeKey } = payload
    const showPrintButtonInReceipt = (existingWindow != null || fromUserGesture) && !directPrint
    type ReceiptPrintItem = (typeof payload)['items'][number]
    const mergedForReceipt = (() => {
      const base = payloadWithoutDedupeKey.items ?? []
      const hasSetChild = base.some((it) => parseGrabSetChildLineName(String(it.name ?? '')))
      if (!hasSetChild) return base
      return mergeGrabSetChildLinesIntoPromoParents(
        base as Parameters<typeof mergeGrabSetChildLinesIntoPromoParents>[0],
        grabCatalogForPrint
      ) as ReceiptPrintItem[]
    })()
    const enrichedForReceipt: ReceiptPrintItem[] = enrichPosOrderLikeItemsWithPromoSnapshot(
      mergedForReceipt,
      posReceiptLineOpts
    )
      .filter((it) => !(it as { grabSetChild?: boolean }).grabSetChild)
      .map((it) => {
        const promoItems = Array.isArray(it.promoItems)
          ? enrichPromoItemsWithOptionName(
              it.promoItems as {
                menuId: string
                optionId: string | null
                optionCode?: string | null
                quantity: number
              }[]
            )
          : undefined
        return {
          ...it,
          note:
            resolveGrabItemPrintNote({
              note: String(it.note ?? ''),
              optionCode: String((it as { optionCode?: string }).optionCode ?? '').trim() || undefined,
              optionCode1: String((it as { optionCode1?: string }).optionCode1 ?? '').trim() || undefined,
              optionCode2: String((it as { optionCode2?: string }).optionCode2 ?? '').trim() || undefined,
              optionCodes: Array.isArray((it as { optionCodes?: string[] }).optionCodes)
                ? (it as { optionCodes?: string[] }).optionCodes
                : undefined,
            }),
          ...(promoItems ? { promoItems } : {}),
        }
      })
    logPosPrintDebug('receipt_print_item_resolution', {
      orderNo: payloadWithoutDedupeKey.orderNo,
      storeCode: payloadWithoutDedupeKey.storeCode,
      beforeCount: mergedForReceipt.length,
      afterCount: enrichedForReceipt.length,
      items: enrichedForReceipt.slice(0, 30).map((it) => {
        const raw = it as {
          id?: string
          name?: string
          menuId?: string
          note?: string
          promoId?: string
          promoCode?: string
          promoItems?: unknown[]
        }
        return {
          id: String(raw.id ?? ''),
          name: String(raw.name ?? ''),
          menuId: String(raw.menuId ?? ''),
          promoId: String(raw.promoId ?? ''),
          promoCode: String(raw.promoCode ?? ''),
          promoItemsCount: Array.isArray(raw.promoItems) ? raw.promoItems.length : 0,
          note: String(raw.note ?? ''),
        }
      }),
      mergedSource: mergedForReceipt.slice(0, 30).map((it) => {
        const raw = it as {
          id?: string
          name?: string
          menuId?: string
          note?: string
          promoId?: string
          promoCode?: string
          promoItems?: unknown[]
          grabSetChild?: boolean
        }
        return {
          id: String(raw.id ?? ''),
          name: String(raw.name ?? ''),
          menuId: String(raw.menuId ?? ''),
          promoId: String(raw.promoId ?? ''),
          promoCode: String(raw.promoCode ?? ''),
          promoItemsCount: Array.isArray(raw.promoItems) ? raw.promoItems.length : 0,
          note: String(raw.note ?? ''),
          grabSetChild: Boolean(raw.grabSetChild),
        }
      }),
    })
    const payloadForPrint = {
      ...payloadWithoutDedupeKey,
      items: enrichedForReceipt,
    }
    let receiptHtml = buildPosHallOrderReceiptDocumentHtml({
      payload: payloadForPrint,
      t: tPrint,
      lang: printLang,
      resolveOrderItemDisplayName: (it) =>
        resolveOrderItemDisplayName({
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId: String((it as { menuId?: string }).menuId ?? ''),
          promoId: String((it as { promoId?: string }).promoId ?? ''),
          promoCode: String((it as { promoCode?: string }).promoCode ?? ''),
        }),
      menuNameById: (menuId: string) =>
        menus.find((m) => String(m.id) === String(menuId))?.name?.trim() || '',
      menuCodeByMenuId: Object.fromEntries(
        menus.map((m) => [String(m.id), String(m.code ?? '')]).filter(([id, code]) => id && code)
      ),
      optionNameByCode,
      printerSettings: posPrinterSettingsRef.current,
    })
    const printButtonLabel = (tPrint('posPrint') || tPrint('btn_print') || '인쇄')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    if (showPrintButtonInReceipt) {
      const footerButton =
        '<div class="receipt-print-actions"><button type="button" onclick="window.print();" style="padding:8px 20px;font-size:14px;cursor:pointer;border:1px solid #000;background:#fff;color:#000;">' +
        printButtonLabel +
        '</button></div>'
      receiptHtml = receiptHtml.replace('</body>', footerButton + '</body>')
    }

    if (fromUserGesture && onShowInModal) {
      onShowInModal(receiptHtml)
      return
    }

    /** 주문/결제 인쇄는 항상 숨김 iframe 사용 (새 창/탭 열지 않음) */
    printPosHtmlDocument(receiptHtml, {
      title: tPrint('posReceipt') || '영수증',
      printDelayMs: 0,
      fallbackCleanupMs: 120_000,
      printRole: 'receipt',
      printReceiptKind: 'hall_order',
      escPosCutOverride: resolveEscPosCutOverride(posPrinterSettingsRef.current, {
        printRole: 'receipt',
        printReceiptKind: 'hall_order',
      }),
      /** 자동(주문 직후) 인쇄: iframe 포커스 생략 → 인쇄창 닫힌 뒤 POS 화면 전환이 덜 튐 */
      focusIframeBeforePrint: !directPrint,
      onPrintUnavailable: () => {
        void appAlert(t('posPrintUnavailable'))
      },
      ...(directPrint && typeof onAfterDirectPrint === 'function'
        ? {
            onAfterCleanup: () => {
              const postReceiptDelayMs =
                typeof window !== 'undefined' && window.cmPosShell
                  ? resolveAfterReceiptToKitchenDelayMs()
                  : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
              window.setTimeout(onAfterDirectPrint, postReceiptDelayMs)
            },
          }
        : {}),
    })
  }

  async function printOnePaymentReceiptFromModalData(data: ReceiptModalData): Promise<boolean> {
    if (posDemoRef.current) return false
    if (!data.voidReceiptMode) {
      const orderId = Number(data.serverOrderId ?? 0)
      if (orderId > 0) {
        const dedupeKey = posPaymentAutoPrintDedupeKey(orderId, data.printInstanceKey)
        const storeForDedupe = String(currentStoreId || data.storeCode || '').trim()
        if (!reservePosAutoPrintKey(storeForDedupe, dedupeKey)) {
          logPosPrintDebug('payment_autoprint_skip_dedupe', {
            orderId,
            dedupeKey,
            orderNo: data.orderNo,
            storeCode: storeForDedupe,
          })
          return false
        }
      }
    }
    try {
      let dataForPrint: ReceiptModalData = data
      const orderId = Number(data.serverOrderId ?? 0)
      if ((data.items?.length ?? 0) === 0 && Number.isFinite(orderId) && orderId > 0) {
        try {
          const fallbackRows = await getPosOrders({
            orderId,
            storeCode: String(data.storeCode || currentStoreId || '').trim() || undefined,
            limit: 1,
          })
          const fallbackOrder = fallbackRows?.[0] as PosOrder | undefined
          if (fallbackOrder?.items?.length) {
            const rebuilt = receiptModalDataFromPosOrderForPayment(
              fallbackOrder,
              pricingAdjustments,
              posReceiptLineOpts
            )
            dataForPrint = {
              ...rebuilt,
              ...data,
              items: rebuilt.items,
              orderNo: String(data.orderNo || rebuilt.orderNo || ''),
              receiptPrintedAt: data.receiptPrintedAt || rebuilt.receiptPrintedAt,
              serverOrderId: data.serverOrderId ?? rebuilt.serverOrderId ?? orderId,
            }
            logPosPrintDebug('payment_receipt_items_refetched_before_print', {
              orderId,
              orderNo: dataForPrint.orderNo,
              recoveredItems: dataForPrint.items.length,
            })
          }
        } catch (e) {
          console.warn('payment receipt fallback refetch failed:', e)
        }
      }
      const storeCode = String(data.storeCode || currentStoreId || '').trim()
      const settings =
        posPrinterSettingsRef.current ??
        (await getPrinterSettingsForStore(storeCode || currentStoreId))
      const itemsBase = (() => {
        const base = dataForPrint.items ?? []
        const hasSetChild = base.some((it) => parseGrabSetChildLineName(String(it.name ?? '')))
        if (!hasSetChild) return base
        return mergeGrabSetChildLinesIntoPromoParents(
          base as Parameters<typeof mergeGrabSetChildLinesIntoPromoParents>[0],
          grabCatalogForPrint
        ) as typeof base
      })()
      const enrichedItems = enrichPosOrderLikeItemsWithPromoSnapshot(itemsBase, posReceiptLineOpts)
        .filter((it) => !(it as { grabSetChild?: boolean }).grabSetChild)
        .map((it) => {
          const promoItems = Array.isArray(it.promoItems)
            ? enrichPromoItemsWithOptionName(
                it.promoItems as {
                  menuId: string
                  optionId: string | null
                  optionCode?: string | null
                  quantity: number
                }[]
              )
            : undefined
          return {
            ...it,
            note: resolveGrabItemPrintNote({
              note: String(it.note ?? ''),
              optionCode: String((it as { optionCode?: string }).optionCode ?? '').trim() || undefined,
              optionCode1: String((it as { optionCode1?: string }).optionCode1 ?? '').trim() || undefined,
              optionCode2: String((it as { optionCode2?: string }).optionCode2 ?? '').trim() || undefined,
              optionCodes: Array.isArray((it as { optionCodes?: string[] }).optionCodes)
                ? (it as { optionCodes?: string[] }).optionCodes
                : undefined,
            }),
            ...(promoItems ? { promoItems } : {}),
          }
        })
      const enriched = {
        ...dataForPrint,
        items: enrichReceiptModalItemsForPromoDisplay(enrichedItems, {
          ...posReceiptLineOpts,
          memo: dataForPrint.memo,
          deliveryAppCode: dataForPrint.deliveryAppCode,
        }),
      }
      const { enrichReceiptModalDataWithMember } = await import('@/lib/pos-receipt-member-enrich-client')
      const hybridShell =
        typeof window !== 'undefined' && typeof window.cmPosShell?.printHtml === 'function'
      /** 하이브리드: 회원 API enrich(최대 250ms) 생략 — 결제 직후 스냅샷이면 이미 충분 */
      const enrichedWithMember = hybridShell ? enriched : await enrichReceiptModalDataWithMember(enriched)
      const receiptHtml = await buildPosPaymentReceiptDocumentHtmlAsync({
        receiptData: enrichedWithMember,
        menus,
        optionNameByCode,
        orderTypeLabels: {
          dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
          takeout: tPrint('posOrderTypeTakeout') ?? '포장',
          delivery: tPrint('posOrderTypeDelivery') ?? '배달',
        },
        t: tPrint,
        lang: printLang,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        printedAt: (() => {
          const raw = data.receiptPrintedAt?.trim()
          if (raw) {
            const d = new Date(raw)
            if (!Number.isNaN(d.getTime())) return d
          }
          return new Date()
        })(),
        printerSettings: settings,
        forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(storeCode || currentStoreId),
      })
      await printPosHtmlDocument(receiptHtml, {
        title: tPrint('posReceipt') || '영수증',
        printDelayMs: 0,
        fallbackCleanupMs: 120_000,
        focusIframeBeforePrint: false,
        printRole: 'receipt',
        printReceiptKind: 'payment',
        escPosCutOverride: resolveEscPosCutOverride(settings, {
          printRole: 'receipt',
          printReceiptKind: 'payment',
        }),
        onPrintUnavailable: () => {
          void appAlert(t('posPrintUnavailable'))
        },
      })
      return true
    } catch {
      return false
    }
  }

  async function printPaymentReceiptBatchDirect(batch: ReceiptModalData[]): Promise<boolean> {
    if (!batch.length) return false
    let ok = true
    for (let i = 0; i < batch.length; i += 1) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, resolveBetweenSplitReceiptsDelayMs()))
      }
      const oneOk = await printOnePaymentReceiptFromModalData(batch[i]!)
      if (!oneOk) ok = false
    }
    return ok
  }

  /** Realtime INSERT/UPDATE·payment poll — 결제 영수증 자동 인쇄(중복 방지 dedupe + direct print) */
  async function dispatchPaymentReceiptFromOrder(order: PosOrder): Promise<void> {
    const orderId = Number(order.id)
    if (!Number.isFinite(orderId) || orderId <= 0) return
    if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) return
    if (posOrderPaymentSum(order) <= 0) return
    if (!(order.items || []).length) return

    printedPaymentReceiptIdsRef.current.add(orderId)

    const data = receiptModalDataFromPosOrderForPayment(order, pricingAdjustments, posReceiptLineOpts)
    const storeCode = String(currentStoreId || order.storeCode || '').trim()
    const { enrichReceiptModalDataWithMember } = await import('@/lib/pos-receipt-member-enrich-client')
    const dataWithMember = await enrichReceiptModalDataWithMember(data, order)

    if (isMainPosDevice) {
      let receiptOnPayment = autoPrintReceiptOnPayment
      try {
        const flags = await resolveStoreAutoPrintFlags(storeCode)
        receiptOnPayment = flags.receiptOnPayment
      } catch {
        /* state fallback */
      }
      if (receiptOnPayment) {
        await printOnePaymentReceiptFromModalData(dataWithMember)
        return
      }
    }

    setReceiptData(dataWithMember)
  }

  /** 결제 직후 영수증: 주문 접수와 동일하게 printPosHtmlDocument 직접 호출(모달 180ms 지연·중복 방지 ref 선등록 회피) */
  const dispatchCheckoutPaymentReceipt = useCallback(
    (params: {
      receiptPayload: ReceiptModalData
      splitBatch: ReceiptModalData[]
      orderId?: number | null
    }) => {
      const { receiptPayload, splitBatch, orderId } = params
      const serverOrderId = orderId != null && orderId > 0 ? orderId : undefined
      const memberSnap = pendingPaymentReceiptMemberRef.current
      pendingPaymentReceiptMemberRef.current = null
      const withMember = (row: ReceiptModalData): ReceiptModalData =>
        mergeMemberReceiptFields(row, memberSnap)
      const withOrderId = (row: ReceiptModalData): ReceiptModalData =>
        serverOrderId != null ? { ...row, serverOrderId: row.serverOrderId ?? serverOrderId } : row
      const enrichedPayload = withMember(withOrderId(receiptPayload))
      const enrichedSplit = splitBatch.map((row) => withMember(withOrderId(row)))
      const batch = (enrichedSplit.length > 0 ? enrichedSplit : [enrichedPayload])

      if (!isMainPosDevice) {
        if (enrichedSplit.length > 0) {
          startReceiptBatch(enrichedSplit)
        } else {
          setReceiptData({
            ...enrichedPayload,
            receiptAutoPrintContext: 'payment',
            suppressReceiptModalAutoPrint: true,
          })
        }
        return
      }

      const autoFlags = readStoreAutoPrintFlagsSync()
      if (autoFlags.receiptOnPayment) {
        void printPaymentReceiptBatchDirect(batch).then((printed) => {
          if (printed && orderId != null && orderId > 0) {
            printedPaymentReceiptIdsRef.current.add(orderId)
          }
        })
        return
      }

      if (enrichedSplit.length > 0) {
        startReceiptBatch(enrichedSplit)
      } else {
        setReceiptData({
          ...enrichedPayload,
          receiptAutoPrintContext: 'payment',
          suppressReceiptModalAutoPrint: false,
        })
      }
      if (orderId != null && orderId > 0) {
        printedPaymentReceiptIdsRef.current.add(orderId)
      }
    },
    [isMainPosDevice, readStoreAutoPrintFlagsSync, startReceiptBatch]
  )

  /** 전체 취소 직후: void 영수증 자동 인쇄(결제 있으면 결제 영수증, 없으면 홀 주문표) */
  async function runAfterFullOrderCancelVoidReceiptPrint(orderId: number) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    try {
      const list = await getPosOrders({ orderId, storeCode: currentStoreId })
      const po = list?.[0] as PosOrder | undefined
      if (!po?.items?.length) return

      const settings = await getPrinterSettingsForStore(currentStoreId)
      await printPosVoidReceiptForOrder({
        order: po,
        menus,
        menuOptions: menuOptionsForCodeMap.length > 0 ? menuOptionsForCodeMap : menuOptions,
        promos: promosWithItems,
        lineOpts: posReceiptLineOpts,
        t: tPrint,
        lang: printLang,
        printerSettings: settings,
        pricingAdjustments,
        onPrintUnavailable: () => {
          void appAlert(t('posPrintUnavailable'))
        },
      })
    } catch (e) {
      console.error('Void receipt print (full cancel):', e)
    }
  }

  /** 전체 취소 직후: 주방에 취소 줄(`-`)만 인쇄(프린터 설정 `autoPrintKitchenSlipOnOrder` 따름) */
  async function runAfterFullOrderCancelKitchenPrints(
    orderId: number,
    channel: 'dine_in' | 'takeout' | 'delivery',
    detail: PosKitchenReprintPayload
  ) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    if (!autoPrintKitchenSlipOnOrder) return
    const lines = detail.removedKitchenLines
    if (!lines?.length) return

    const orderNoStr = String(detail.orderNoForPrint ?? orderId).trim()
    const tableName = String(detail.tableName ?? '').trim()
    const memo = String(detail.memo ?? '')

    const kitchenPrintKey = `order:${orderId}:kitchen:full:${Date.now()}`
    const runKitchenFullCancel = () => {
      if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
      void getPrinterSettingsForStore(currentStoreId)
        .then(async (settings) => {
          const ki = kitchenSlipPrintI18n(settings, lang)
          const menusForPrint = await resolveMenusForKitchenPrint(
            lines as Array<Record<string, unknown>>,
            currentStoreId
          )
          const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
            lines as Array<Record<string, unknown>>,
            menusForPrint
          )
          const slips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(lines as Record<string, unknown>[]) as typeof lines,
            buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
          )
          if (!slips.length) return
          const slipDesign = resolveKitchenSlipDesign(settings)
          const memoLine = buildPosCustomerMemoLineForPrint(memo, ki.t, ki.lang)
          const orderTypeLabelSlip = kitchenSlipOrderTypeLabel(
            { orderType: channel, tableName, orderNo: orderNoStr, memo },
            ki
          )
          const tablePartR = tableName
            ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
            : ''
          const fullBannerText = (
            tPrint('posKitchenFullCancelBanner') ||
            ki.t('posKitchenFullCancelBanner') ||
            'Order fully cancelled'
          ).trim()
          const fullHead =
            '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000;white-space:pre-line">' +
            escapeHtml(fullBannerText) +
            '</div>'
          const printOne = (idx: number) => {
            if (idx >= slips.length) return
            const slip = slips[idx]
            const html = buildKitchenSlipDocumentHtml({
              label: slip.label,
              orderNo: orderNoStr,
              storeCode: currentStoreId,
              orderTypeLabel: orderTypeLabelSlip,
              tablePart: tablePartR,
              dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
              items: kitchenSlipItemsForPrint(
                slip.items,
                kitchenItemsWithResolvedPromo(lines as Record<string, unknown>[]) as KitchenSlipRoutingItem[],
                ki,
                menusForPrint,
                optionNameByCodeForPrint
              ).map((row) => ({ ...row, cancelled: true })),
              memoLine: memoLine || null,
              escapeHtml,
              design: slipDesign,
          printerSettings: settings,
              optionNameByCode: optionNameByCodeForPrint,
              printColorAdjust: 'exact',
              prependItemsHtml: fullHead,
            })
            printPosHtmlDocument(html, {
              title: slip.label,
              printDelayMs: 0,
              focusIframeBeforePrint: false,
              printRole: 'kitchen',
              kitchenStation: slip.station,
              escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
              onPrintUnavailable: () => {
                void appAlert(t('posPrintUnavailable'))
              },
              onAfterCleanup: () => {
                if (idx + 1 < slips.length)
                  setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
              },
            })
          }
          setTimeout(() => printOne(0), 0)
        })
        .catch((e) => console.error('Kitchen slip print (full cancel):', e))
    }
    setTimeout(runKitchenFullCancel, 0)
    void runAfterFullOrderCancelVoidReceiptPrint(orderId)
  }

  /** 일부 취소(updatePosOrder) 직후: DB 기준 스냅샷으로 홀 주문표·주방 재인쇄(매장 프린터 설정 따름) */
  async function runAfterPartialLineCancelPrints(
    orderId: number,
    channel: 'dine_in' | 'takeout' | 'delivery',
    kitchenDetail?: PosKitchenReprintPayload,
    opts?: { skipKitchen?: boolean }
  ) {
    if (posDemoRef.current) return
    if (!isMainPosDevice) return
    const list = await getPosOrders({ orderId, storeCode: currentStoreId })
    const po = list?.[0] as PosOrder | undefined
    if (!po?.items?.length) return

    const orderNoStr = String(po.orderNo ?? '').trim()
    const tableName = String(po.tableName ?? '').trim()
    const memo = String(po.memo ?? '')
    type ReceiptPrintLine = {
      id: string
      name: string
      price: number
      qty: number
      note?: string
      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
    }
    const receiptPrintItems: ReceiptPrintLine[] = (po.items || []).map((it) => {
      const row = it as PosOrderItem
      const menuId = String(row.menuId1 ?? row.menuId2 ?? '').trim()
      const displayName = resolveOrderItemDisplayName({
        id: String(it.id ?? ''),
        name: String(it.name ?? ''),
        menuId,
      })
      const note = String(it.note ?? '').trim()
      return {
        id: String(it.id ?? ''),
        name: displayName,
        price: Number(it.price ?? 0),
        qty: Math.max(1, Number(it.qty ?? 1) || 1),
        ...(note ? { note } : {}),
        ...(Array.isArray(row.promoItems) && row.promoItems.length > 0
          ? { promoItems: enrichPromoItemsWithOptionName(row.promoItems) }
          : {}),
      }
    })

    const orderTypeLabel =
      channel === 'dine_in'
        ? t('posOrderTypeDineIn') ?? '매장'
        : channel === 'takeout'
          ? t('posOrderTypeTakeout') ?? '포장'
          : t('posOrderTypeDelivery') ?? '배달'

    const receiptPayload = hallOrderReceiptPayloadFromPosOrder(po, pricingAdjustments, {
      ...posReceiptLineOpts,
      orderTypeLabel,
      storeCodeFallback: currentStoreId,
    })

    const printHallOrderSheet =
      autoPrintReceiptOnOrder || autoPrintReceiptOnAddOrder || autoPrintFinalOrderBeforePayment

    const kitchenPrintKey = `order:${orderId}:kitchen:partial:${Date.now()}`
    const runKitchenPartialReprint = () => {
      if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
      const itemsForKitchen = (po.items || []).map((it) => {
        const line = it as PosOrderItem & {
          menu_id1?: string
        }
        const menuId = String(line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? '').trim()
        const note = String(line.note ?? '').trim()
        return {
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          price: Number(it.price ?? 0),
          qty: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }),
          ...(menuId ? { menuId } : {}),
          ...(note ? { note } : {}),
          ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
        }
      })
      void getPrinterSettingsForStore(currentStoreId)
        .then(async (settings) => {
          const ki = kitchenSlipPrintI18n(settings, lang)
          const removedLinesForMenus = kitchenDetail?.removedKitchenLines ?? []
          const menusForPrint = await resolveMenusForKitchenPrint(
            [...itemsForKitchen, ...removedLinesForMenus] as Array<Record<string, unknown>>,
            currentStoreId
          )
          const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
            [...itemsForKitchen, ...removedLinesForMenus] as Array<Record<string, unknown>>,
            menusForPrint
          )
          const groupOpts = buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
          const removedLines = kitchenDetail?.removedKitchenLines ?? []
          if (!removedLines.length) return
          const cancelledSlips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(removedLines as Record<string, unknown>[]) as typeof removedLines,
            groupOpts
          )
          const activeSlips = buildKitchenSlipGroups(
            kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
            groupOpts
          )
          const slips = buildPartialCancelKitchenSlips(cancelledSlips, activeSlips)
          if (!slips.length) return
          const slipDesign = resolveKitchenSlipDesign(settings)
          const memoLine = buildPosCustomerMemoLineForPrint(memo, ki.t, ki.lang)
          const orderTypeLabelSlip = kitchenSlipOrderTypeLabel(
            {
              orderType: po.orderType ?? channel,
              tableName,
              orderNo: orderNoStr,
              memo,
              deliveryAppCode: po.deliveryAppCode,
              items: po.items,
            },
            ki
          )
          const tablePartR = tableName
            ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(tableName, ki.t)
            : ''
          const partialBannerText = (
            tPrint('posKitchenPartialReprintBanner') ||
            ki.t('posKitchenPartialReprintBanner') ||
            'Order updated (partial cancel)'
          ).trim()
          const partialHead =
            '<div class="k-row" style="font-weight:700;margin-top:6px;padding-top:8px;border-top:2px solid #000;white-space:pre-line">' +
            escapeHtml(partialBannerText) +
            '</div>'
          const printOne = (idx: number) => {
            if (idx >= slips.length) return
            const slip = slips[idx]
            const slipHasCancelledLines = slip.items.some((it) =>
              Boolean((it as { kitchenLineCancelled?: boolean }).kitchenLineCancelled)
            )
            const html = buildKitchenSlipDocumentHtml({
              label: slip.label,
              orderNo: orderNoStr,
              storeCode: currentStoreId,
              orderTypeLabel: orderTypeLabelSlip,
              tablePart: tablePartR,
              dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
              items: kitchenSlipItemsForPrint(
                slip.items,
                kitchenItemsWithResolvedPromo(
                  itemsForKitchen as Record<string, unknown>[]
                ) as KitchenSlipRoutingItem[],
                ki,
                menusForPrint,
                optionNameByCodeForPrint
              ),
              memoLine: memoLine || null,
              escapeHtml,
              design: slipDesign,
          printerSettings: settings,
              optionNameByCode: optionNameByCodeForPrint,
              printColorAdjust: 'exact',
              prependItemsHtml: slipHasCancelledLines ? partialHead : '',
              ...posKitchenGuestSpread(po.guestCount, ki.t('posOrderGuestCount')),
            })
            printPosHtmlDocument(html, {
              title: slip.label,
              printDelayMs: 0,
              focusIframeBeforePrint: false,
              printRole: 'kitchen',
              kitchenStation: slip.station,
              escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
              onPrintUnavailable: () => {
                void appAlert(t('posPrintUnavailable'))
              },
              onAfterCleanup: () => {
                if (idx + 1 < slips.length)
                  setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
              },
            })
          }
          setTimeout(() => printOne(0), 0)
        })
        .catch((e) => console.error('Kitchen slip print (partial cancel):', e))
    }

    try {
      const skipKitchen = opts?.skipKitchen === true
      if (printHallOrderSheet && !skipKitchen && autoPrintKitchenSlipOnOrder && receiptPrintItems.length > 0) {
        await printReceiptNow(receiptPayload, null, false, undefined, true, runKitchenPartialReprint)
      } else if (printHallOrderSheet) {
        await printReceiptNow(receiptPayload, null, false, undefined, true)
      } else if (!skipKitchen && autoPrintKitchenSlipOnOrder && receiptPrintItems.length > 0) {
        setTimeout(runKitchenPartialReprint, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
    } catch (e) {
      console.error('runAfterPartialLineCancelPrints:', e)
    }
  }

  /** 테이블 이동·합석 직후: 갱신된 테이블 번호·품목으로 홀 주문서만 재인쇄 */
  async function runAfterTableTransferHallReprint(keepOrderId: number) {
    await runAfterPartialLineCancelPrints(keepOrderId, 'dine_in', undefined, { skipKitchen: true })
    try {
      const list = await getPosOrders({ orderId: keepOrderId, storeCode: currentStoreId })
      const po = list?.[0] as PosOrder | undefined
      if (!po?.items?.length) return
      const snapItems = (po.items || []).map(
        (it: {
          id?: string
          name?: string
          price?: number
          qty?: number
          quantity?: number
          note?: string
          menuId1?: string
          menu_id1?: string
          menuId?: string
          menuId2?: string
          optionCode1?: string
          option_code1?: string
          optionCode?: string
        }) => {
          const note = String(it.note ?? '').trim()
          const menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? it.menuId2 ?? '').trim()
          const optionCode = String(it.optionCode1 ?? it.option_code1 ?? it.optionCode ?? '').trim()
          const displayName = resolveOrderItemDisplayName({
            id: String(it.id ?? ''),
            name: String(it.name ?? ''),
            menuId,
          })
          return {
            id: String(it.id ?? ''),
            name: displayName,
            price: Number(it.price ?? 0),
            qty: Math.max(1, Number(it.qty ?? it.quantity ?? 1) || 1),
            ...(menuId ? { menuId } : {}),
            ...(optionCode ? { optionCode } : {}),
            ...(note ? { note } : {}),
          }
        }
      )
      const newQtyById = buildDineInQtySnapshot(snapItems)
      if (newQtyById.size > 0) dineInRemoteItemQtySnapshotRef.current.set(keepOrderId, newQtyById)
    } catch (e) {
      console.warn('runAfterTableTransferHallReprint snapshot refresh:', e)
    }
  }

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!shouldTreatAsIncomingOrder(orderId, row.created_at)) {
        logPosPrintDebug('realtime_insert_skip_not_incoming', {
          orderId,
          createdAt: String(row.created_at ?? ''),
        })
        return
      }
      if (!isCurrentStoreOrder(row.store_code)) {
        logPosPrintDebug('realtime_insert_skip_store_mismatch', {
          orderId,
          rowStore: String(row.store_code ?? ''),
          variants: currentStoreCodeVariants,
        })
        return
      }
      if (consumeSuppressMainPosAutoPrintForQueuedSync(orderId)) {
        seenOrderIdsRef.current.add(orderId)
        bumpLastSeenOrderId(orderId)
        logPosPrintDebug('realtime_insert_suppress_queued_sync', { orderId })
        return
      }
      if (seenOrderIdsRef.current.has(orderId)) {
        logPosPrintDebug('realtime_insert_skip_seen', { orderId })
        return
      }
      const parsedItems = parseRealtimePosOrderRowItemsJson(row)
      if (!parsedItems.ok) {
        logPosPrintDebug('realtime_insert_skip_items_parse_error', { orderId })
        return
      }
      const items = parsedItems.items
      /* items_json이 Realtime에 비어 있으면 폴링이 다시 잡도록 seen에 넣지 않음 */
      if (items.length === 0) {
        pendingEmptyItemsOrderIdsRef.current.add(orderId)
        logPosPrintDebug('realtime_insert_skip_empty_items', { orderId })
        triggerMainPosPollNowRef.current?.()
        return
      }
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      seenOrderIdsRef.current.add(orderId)
      bumpLastSeenOrderId(orderId)
      const inferredOrderType = inferPosOrderTypeFromRow({
        order_type: String(row.order_type ?? ''),
        memo: String(row.memo ?? ''),
        table_name: String(row.table_name ?? ''),
        delivery_payment_channel: String(row.delivery_payment_channel ?? ''),
        items_json: row.items_json,
      })
      autoFocusIncomingDeliveryOrder({
        orderId,
        orderType: inferredOrderType,
        deliveryAppCode: String(row.delivery_app_code ?? ''),
        status: String(row.status ?? ''),
        createdAt: String(row.created_at ?? ''),
        storeCode: String(row.store_code ?? ''),
        memo: String(row.memo ?? ''),
      })
      // 주문 바/배달 목록은 usePosStore 스냅샷을 사용하므로, 신규 주문 수신 시 즉시 갱신합니다.
      refetchCurrentStore()
      const storeCode = String(row.store_code ?? currentStoreId)
      const orderNo = String(row.order_no ?? '')
      const orderType = inferredOrderType
      if (orderType === 'dine_in') {
        const snap = buildDineInQtySnapshot(items)
        if (snap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, snap)
      }
      const tableName = String(row.table_name ?? '')
      const memo = String(row.memo ?? '')
      const subtotal = Number(row.subtotal ?? 0)
      const discountAmt = Number(row.discount_amt ?? 0)
      const couponDiscountAmt = Number(row.coupon_discount_amt ?? 0)
      const total = Number(row.total ?? 0)
      const receiptPayloadRealtime = {
        ...hallOrderReceiptPayloadFromOrderFields(
          {
            orderNo,
            storeCode,
            orderType: resolvePosOrderTypeReceiptLabel(orderType, t),
            tableName,
            memo,
            items,
            subtotal,
            discountAmt,
            couponDiscountAmt,
            discountReason: String(row.discount_reason ?? '').trim() || undefined,
            total,
            ...posGuestCountSpread(row.guest_count),
          },
          pricingAdjustments
        ),
        _autoPrintDedupeKey: `order:${orderId}:hall:auto`,
      }
      const runKitchenFromRealtimeOrderInsert = () => {
        const orderForKitchen = {
          id: orderId,
          orderNo,
          storeCode,
          orderType: inferredOrderType,
          tableName,
          memo,
          items,
          guestCount: Number(row.guest_count ?? 0) || undefined,
          deliveryAppCode: String(row.delivery_app_code ?? '').trim() || undefined,
        } as PosOrder
        void dispatchKitchenAutoPrintForPosOrder(orderForKitchen, {
          dedupeKey: `order:${orderId}:kitchen`,
          flow: 'realtime',
        })
      }
      const isPendingDelivery =
        inferredOrderType === 'delivery' &&
        String(row.status ?? '').trim().toLowerCase() === 'pending'
      const shouldWaitForDeliveryAccept =
        isPendingDelivery && isApiInboundDeliveryOrderMemo(String(memo ?? ''))
      const shouldWaitForMemberPortalPrepay = isMemberPortalPaymentPendingOrder({
        memo: String(memo ?? ''),
        status: String(row.status ?? ''),
        payment_qr: Number(row.payment_qr ?? 0),
        created_by: String(row.created_by ?? ''),
      })
      const shouldDeferAutoprint = shouldWaitForDeliveryAccept || shouldWaitForMemberPortalPrepay
      if (!shouldDeferAutoprint) {
        logPosPrintDebug('realtime_insert_autoprint_start', {
          orderId,
          autoPrintReceiptOnOrder,
          autoPrintKitchenSlipOnOrder,
          itemCount: items.length,
          isPendingDelivery,
          shouldWaitForDeliveryAccept,
          shouldWaitForMemberPortalPrepay,
        })
        if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
          printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true, runKitchenFromRealtimeOrderInsert)
        } else if (autoPrintReceiptOnOrder) {
          printReceiptNow(receiptPayloadRealtime, undefined, false, undefined, true)
        } else if (autoPrintKitchenSlipOnOrder) {
          setTimeout(runKitchenFromRealtimeOrderInsert, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
        }
      } else {
        logPosPrintDebug('realtime_insert_deferred_autoprint', {
          orderId,
          status: String(row.status ?? ''),
          isInboundDeliveryOrder: isApiInboundDeliveryOrderMemo(String(memo ?? '')),
          shouldWaitForMemberPortalPrepay,
        })
      }
      if (autoPrintReceiptOnPayment) {
        const st = String(row.status ?? '').toLowerCase()
        const paySum = posOrderRowPaymentSum(row)
        if (isPosOrderPaidLikeStatus(st) && paySum > 0 && !printedPaymentReceiptIdsRef.current.has(orderId)) {
          void getPosOrders({ orderId, storeCode: currentStoreId })
            .then((list) => {
              const order = list[0] as PosOrder | undefined
              if (!order?.items?.length) {
                printedPaymentReceiptIdsRef.current.delete(orderId)
                return
              }
              if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
                printedPaymentReceiptIdsRef.current.delete(orderId)
                return
              }
              return dispatchPaymentReceiptFromOrder(order)
            })
            .catch(() => {
              printedPaymentReceiptIdsRef.current.delete(orderId)
            })
        }
      }
    }
    const onUpdatePendingItems = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      if (!pendingEmptyItemsOrderIdsRef.current.has(orderId)) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return
      const parsed = parseRealtimePosOrderRowItemsJson(row)
      if (!parsed.ok || parsed.items.length === 0) return
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      logPosPrintDebug('realtime_update_items_filled', { orderId })
      triggerMainPosPollNowRef.current?.()
    }

    realtimeChannelStateRef.current.clear()
    realtimeChannelHealthyRef.current = false
    /** legacy·Grab ID(1042↔CM Silom) 별칭마다 INSERT 구독 — seenOrderIds로 중복 처리 방지 */
    const channels = currentStoreCodeVariants.flatMap((storeCode) => {
      const code = String(storeCode || '').trim()
      if (!code) return []
      const insertKey = `insert:${code}`
      const updateKey = `insert-items:${code}`
      const list = []
      const chInsert = subscribePosOrdersInsert(onInsert, {
        store: code,
        ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        onStatus: makeRealtimeStatusHandler(insertKey),
      })
      if (chInsert) list.push(chInsert)
      const chUpdate = subscribePosOrdersUpdate(onUpdatePendingItems, {
        store: code,
        ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        onStatus: makeRealtimeStatusHandler(updateKey),
      })
      if (chUpdate) list.push(chUpdate)
      return list
    })
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
      if (realtimeResubscribeTimerRef.current) {
        clearTimeout(realtimeResubscribeTimerRef.current)
        realtimeResubscribeTimerRef.current = null
      }
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    realtimeResubscribeTick,
    autoPrintReceiptOnAddOrder,
    autoPrintReceiptOnOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    posReceiptLineOpts,
    menus,
    t,
    lang,
    refetchCurrentStore,
    logPosPrintDebug,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    parseRealtimePosOrderRowItemsJson,
    buildDineInQtySnapshot,
    isCurrentStoreOrder,
    makeRealtimeStatusHandler,
    auth?.tenantId,
  ])

  useEffect(() => {
    if (isMainPosDevice || !currentStoreId) return
    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      if (!shouldTreatAsIncomingOrder(orderId, row.created_at)) return
      if (!isCurrentStoreOrder(row.store_code)) return
      if (seenOrderIdsRef.current.has(orderId)) return
      seenOrderIdsRef.current.add(orderId)
      bumpLastSeenOrderId(orderId)
      autoFocusIncomingDeliveryOrder({
        orderId,
        orderType: String(row.order_type ?? ''),
        deliveryAppCode: String(row.delivery_app_code ?? ''),
        status: String(row.status ?? ''),
        createdAt: String(row.created_at ?? ''),
        storeCode: String(row.store_code ?? ''),
        memo: String(row.memo ?? ''),
      })
      refetchCurrentStore()
    }
    const channels = currentStoreCodeVariants
      .map((storeCode) =>
        subscribePosOrdersInsert(onInsert, {
          store: storeCode,
          ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        })
      )
      .filter(Boolean)
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    autoFocusIncomingDeliveryOrder,
    refetchCurrentStore,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    auth?.tenantId,
    runGrabCancelWatchOnOrders,
    notifyGrabCustomerCancelledOrder,
  ])

  useEffect(() => {
    if (!currentStoreId) return
    const deliveryList = [...deliveryOrders, ...packagedDeliveryOrders, ...completedDeliveryOrders]
    if (!deliveryList.length) return
    const rows = deliveryList.map((o) => ({
      id: Number(o.id),
      status: o.status,
      memo: o.memo,
      orderType: 'delivery' as const,
      tableName: o.tableName,
      orderNo: o.orderNo,
    }))
    if (!grabCancelWatchSeededRef.current) {
      runGrabCancelWatchOnOrders(rows, { seedOnly: true })
      return
    }
    runGrabCancelWatchOnOrders(rows, { seedOnly: false })
  }, [
    currentStoreId,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    runGrabCancelWatchOnOrders,
  ])

  useEffect(() => {
    if (!currentStoreId) return

    const handleUpdate = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return

      const ot = String(row.order_type ?? '').trim().toLowerCase()
      if (
        ot === 'dine_in' &&
        !isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) <= 0
      ) {
        const oldRow = payload.old as Record<string, unknown> | undefined
        if (oldRow) {
          const newSub = Math.max(0, Number(row.subtotal ?? 0) || 0)
          const oldSub = Math.max(0, Number(oldRow.subtotal ?? 0) || 0)
          if (newSub > oldSub + 0.01) {
            refetchCurrentStore()
          }
        }
      }

      const shouldAlert = applyGrabCancelWatchRealtimeRow({
        orderId,
        row: {
          id: orderId,
          status: row.status,
          memo: row.memo,
          order_type: row.order_type,
        },
        snapshot: grabCancelWatchSnapshotRef.current,
        seeded: grabCancelWatchSeededRef.current,
      })
      if (!shouldAlert) return
      notifyGrabCustomerCancelledOrder({
        orderId,
        tableName: String(row.table_name ?? ''),
        orderNo: String(row.order_no ?? ''),
      })
      refetchCurrentStore()
    }

    const channels = currentStoreCodeVariants
      .map((storeCode) =>
        subscribePosOrdersUpdate(handleUpdate, {
          store: storeCode,
          ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        })
      )
      .filter(Boolean)

    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    currentStoreCodeVariants,
    currentStoreId,
    isCurrentStoreOrder,
    notifyGrabCustomerCancelledOrder,
    refetchCurrentStore,
    auth?.tenantId,
  ])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const wantPayment = autoPrintReceiptOnPayment
    const wantRemoteDineInAdd =
      (autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder) || autoPrintKitchenSlipOnOrder
    if (!wantPayment && !wantRemoteDineInAdd) return

    const onUpdate = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return
      const rowStore = String(row.store_code ?? currentStoreId ?? '').trim()
      const oldRowForAutoprint = payload.old as Record<string, unknown> | undefined
      const inferredOrderType = inferPosOrderTypeFromRow({
        order_type: String(row.order_type ?? ''),
        memo: String(row.memo ?? ''),
        table_name: String(row.table_name ?? ''),
        delivery_payment_channel: String(row.delivery_payment_channel ?? ''),
        items_json: row.items_json,
      })
      const packagingOnlyUpdate =
        oldRowForAutoprint != null &&
        isPosOrderItemsJsonPackagingOnlyUpdate(oldRowForAutoprint, row)

      if (packagingOnlyUpdate) {
        if (inferredOrderType === 'dine_in') {
          const parsedPackaging = parseRealtimePosOrderRowItemsJson(row)
          if (parsedPackaging.ok && parsedPackaging.items.length > 0) {
            const newQtyById = buildDineInQtySnapshot(parsedPackaging.items)
            if (newQtyById.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
          }
        }
        logPosPrintDebug('realtime_update_skip_packaging_only', { orderId })
      }

      if (
        !packagingOnlyUpdate &&
        autoPrintReceiptOnOrder &&
        seenOrderIdsRef.current.has(orderId) &&
        inferredOrderType === 'delivery' &&
        posOrderRowPaymentSum(row) <= 0 &&
        !isPosOrderPaidLikeStatus(String(row.status ?? ''))
      ) {
        if (oldRowForAutoprint) {
          const newDisc = Math.max(0, Number(row.discount_amt ?? 0) || 0)
          const newCoupon = Math.max(0, Number(row.coupon_discount_amt ?? 0) || 0)
          const newTotal = Math.max(0, Number(row.total ?? 0) || 0)
          const oldTotal = Math.max(0, Number(oldRowForAutoprint.total ?? 0) || 0)
          if (
            posOrderRealtimePricingFieldsChanged(oldRowForAutoprint, row) &&
            (newDisc > 0.01 || newCoupon > 0.01 || (oldTotal > newTotal + 0.01 && newTotal > 0.005))
          ) {
            const reprintKey = `order:${orderId}:hall-disc:${Math.round(newDisc * 100)}:${Math.round(newCoupon * 100)}:${Math.round(newTotal * 100)}`
            if (!printedHallDiscountReprintKeysRef.current.has(reprintKey)) {
              printedHallDiscountReprintKeysRef.current.add(reprintKey)
              const parsedDisc = parseRealtimePosOrderRowItemsJson(row)
              if (parsedDisc.ok && parsedDisc.items.length > 0) {
                const hallPayload = {
                  ...hallOrderReceiptPayloadFromOrderFields(
                    {
                      orderNo: String(row.order_no ?? ''),
                      storeCode: rowStore,
                      orderType: resolvePosOrderTypeReceiptLabel(inferredOrderType, t),
                      tableName: String(row.table_name ?? ''),
                      memo: String(row.memo ?? ''),
                      items: parsedDisc.items,
                      subtotal: Math.max(0, Number(row.subtotal ?? 0) || 0),
                      discountAmt: newDisc,
                      couponDiscountAmt: newCoupon,
                      discountReason: String(row.discount_reason ?? '').trim() || undefined,
                      total: newTotal,
                      ...posGuestCountSpread(row.guest_count),
                    },
                    pricingAdjustments
                  ),
                  _autoPrintDedupeKey: reprintKey,
                }
                logPosPrintDebug('realtime_update_delivery_discount_hall_reprint', {
                  orderId,
                  newDisc,
                  newCoupon,
                  newTotal,
                })
                void printReceiptNow(hallPayload, undefined, false, undefined, true)
              }
            }
          }
        }
      }

      const oldRowForPrepay = payload.old as Record<string, unknown> | undefined
      if (
        oldRowForPrepay &&
        isMemberPortalPaymentPendingOrder({
          memo: String(oldRowForPrepay.memo ?? ''),
          status: String(oldRowForPrepay.status ?? ''),
          payment_qr: Number(oldRowForPrepay.payment_qr ?? 0),
          created_by: String(oldRowForPrepay.created_by ?? ''),
        }) &&
        isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) > 0 &&
        reserveKitchenAutoPrintKey(`mp-prepay-paid:${orderId}`)
      ) {
        logPosPrintDebug('realtime_update_member_portal_prepay_paid', { orderId })
        playIncomingOrderBeep()
        refetchCurrentStore()
        void getPosOrders({ orderId, storeCode: currentStoreId })
          .then(async (list) => {
            const order = list[0] as PosOrder | undefined
            if (!order?.items?.length) return
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) return
            if (autoPrintKitchenSlipOnOrder) {
              await printKitchenFromPosOrder(order)
            }
            if (autoPrintReceiptOnOrder) {
              const hallPayload = hallOrderReceiptPayloadFromOrderFields(
                {
                  orderNo: order.orderNo ?? '',
                  storeCode: order.storeCode ?? rowStore,
                  orderType: resolvePosOrderTypeReceiptLabel(String(order.orderType ?? ''), t),
                  tableName: order.tableName ?? '',
                  memo: order.memo ?? '',
                  items: order.items ?? [],
                  subtotal: Math.max(0, Number(order.subtotal ?? 0) || 0),
                  discountAmt: Math.max(0, Number(order.discountAmt ?? 0) || 0),
                  couponDiscountAmt: Math.max(0, Number(order.couponDiscountAmt ?? 0) || 0),
                  discountReason: String(order.discountReason ?? '').trim() || undefined,
                  total: Math.max(0, Number(order.total ?? 0) || 0),
                  ...posGuestCountSpread(order.guestCount),
                },
                pricingAdjustments
              )
              await printReceiptNow(hallPayload, undefined, false, undefined, true)
            }
          })
          .catch((e) => console.error('member portal prepay paid autoprint:', e))
      }

      if (
        wantPayment &&
        isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) > 0 &&
        !printedPaymentReceiptIdsRef.current.has(orderId)
      ) {
        void getPosOrders({ orderId, storeCode: currentStoreId })
          .then((list) => {
            const order = list[0] as PosOrder | undefined
            if (!order?.items?.length) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) {
              printedPaymentReceiptIdsRef.current.delete(orderId)
              return
            }
            return dispatchPaymentReceiptFromOrder(order)
          })
          .catch(() => {
            printedPaymentReceiptIdsRef.current.delete(orderId)
          })
      }

      if (!wantRemoteDineInAdd || packagingOnlyUpdate) return
      if (inferredOrderType !== 'dine_in') return
      /**
       * 결제(updatePosOrder + status 반영) UPDATE는 주방 추가주문 출력 대상이 아님.
       * - 결제 직전 pending/cooking 상태에서도 payment_* 값이 먼저 반영될 수 있어
       *   "추가 주문"으로 오인해 주방지가 한 번 더 나갈 수 있다.
       */
      if (posOrderRowPaymentSum(row) > 0) return
      if (isPosOrderPaidLikeStatus(String(row.status ?? ''))) return
      const st = String(row.status ?? '').trim().toLowerCase()
      if (st === 'completed' || st === 'cancelled' || st === 'canceled') return

      const oldRow = payload.old as Record<string, unknown> | undefined
      if (oldRow && isPosDineInTableNameOnlyUpdate(oldRow, row)) {
        const parsedTableMove = parseRealtimePosOrderRowItemsJson(row)
        if (parsedTableMove.ok && parsedTableMove.items.length > 0) {
          const sid = buildDineInQtySnapshot(parsedTableMove.items)
          if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
        }
        const oldTableName = String(oldRow.table_name ?? '').trim()
        if (oldTableName) clearTableOrder(currentStoreId, oldTableName)
        refetchCurrentStore()
        logPosPrintDebug('realtime_update_skip_table_name_only', { orderId })
        return
      }

      const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId)
      if (suppressUntil != null) {
        if (Date.now() < suppressUntil) {
          const parsedSelf = parseRealtimePosOrderRowItemsJson(row)
          if (parsedSelf.ok && parsedSelf.items.length > 0) {
            const sid = buildDineInQtySnapshot(parsedSelf.items)
            if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
          }
          logPosPrintDebug('realtime_update_skip_self_dine_in_suppress', { orderId })
          return
        }
        mainPosSelfDineInUpdateSuppressUntilRef.current.delete(orderId)
      }

      const parsed = parseRealtimePosOrderRowItemsJson(row)
      if (!parsed.ok || parsed.items.length === 0) return

      const items = parsed.items
      let prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(orderId)
      const newQtyById = buildDineInQtySnapshot(items)
      if (newQtyById.size === 0) return

      if (!prevQtyById) {
        const oldRow = payload.old as Record<string, unknown> | undefined
        if (oldRow) {
          const parsedOld = parseRealtimePosOrderRowItemsJson(oldRow)
          if (parsedOld.ok && parsedOld.items.length > 0) {
            prevQtyById = buildDineInQtySnapshot(parsedOld.items)
            logPosPrintDebug('realtime_update_dine_in_prev_from_old_row', { orderId })
          }
        }
      }
      if (!prevQtyById) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        logPosPrintDebug('realtime_update_dine_in_snapshot_seeded', { orderId })
        return
      }

      const changedSet = collectDineInSnapshotIncreasedKeys(prevQtyById, newQtyById)
      const changedIds = [...changedSet]
      if (changedIds.length === 0) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }

      const storeCodeForSkip = String(row.store_code ?? currentStoreId)
      if (
        shouldSkipDineInRemoteAddAutoprint(orderId, storeCodeForSkip, prevQtyById, newQtyById, changedSet)
      ) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        logPosPrintDebug('remote_dine_in_add_skip_recent_local_print', { orderId })
        return
      }

      refetchCurrentStore()

      const shouldAutoPrintReceipt = autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder
      if (!shouldAutoPrintReceipt && !autoPrintKitchenSlipOnOrder) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }

      const cartLikeNew = items.map((it) => ({
        ...it,
        id: resolveDineInSnapshotItemKey(it),
        quantity: it.qty,
        qty: it.qty,
        ...(it.note ? { note: formatLineNoteForPrint(it.note) } : {}),
      }))
      const kitchenCartLines = buildKitchenCartLinesFromSnapshotDelta(
        cartLikeNew,
        prevQtyById,
        newQtyById,
        (line) => resolveDineInSnapshotItemKey(line)
      )

      const mergeSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
      const discountAmt = Number(row.discount_amt ?? 0)
      const couponDiscountAmt = Number(row.coupon_discount_amt ?? 0)
      const pricing = computePosPricing({
        subtotal: mergeSubtotal,
        discountAmt,
        cardPaymentAmount: 0,
        adjustments: pricingAdjustments,
      })

      const receiptPrintItemsRemote = items.map((it) => ({
        ...it,
        ...(changedSet.has(resolveDineInSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
      }))
      const hallAddonLinesRemote = receiptPrintItemsRemote.filter((it) => it.isAddon === true)

      const storeCode = String(row.store_code ?? currentStoreId)
      const orderNoStr = String(row.order_no ?? '')
      const tableName = String(row.table_name ?? '')
      const memo = String(row.memo ?? '')

      const receiptPayloadRemote = {
        orderNo: orderNoStr,
        storeCode,
        orderType: t('posOrderTypeDineIn') || '매장',
        tableName,
        memo,
        items: receiptPrintItemsRemote,
        subtotal: mergeSubtotal,
        discountAmt,
        couponDiscountAmt,
        discountReason: String(row.discount_reason ?? '').trim() || undefined,
        total: pricing.finalTotal,
        _autoPrintDedupeKey: `order:${orderId}:hall:add:${buildDineInAddKitchenPrintDedupeSuffix(
          hallAddonLinesRemote.length > 0 ? hallAddonLinesRemote : kitchenCartLines,
          { formatNote: formatLineNoteForPrint }
        )}`,
        vatFeeAmt: pricing.vatFeeAmt,
        vatFeeMode: pricing.vatFeeMode,
        ...receiptTaxDisplayFieldsFromPricing(pricing),
        serviceFeeAmt: pricing.serviceFeeAmt,
        serviceFeeMode: pricing.serviceFeeMode,
        cardFeeAmt: pricing.cardFeeAmt,
        cardFeeMode: pricing.cardFeeMode,
        otherFeeAmt: pricing.otherFeeAmt,
        otherFeeMode: pricing.otherFeeMode,
        ...posGuestCountSpread(row.guest_count),
      }

      const kitchenDedupeKey = buildDineInAddKitchenAutoPrintDedupeKey(orderId, kitchenCartLines, {
        formatNote: formatLineNoteForPrint,
      })

      dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
      logPosPrintDebug('remote_dine_in_add_autoprint', { orderId, changedCount: changedIds.length })

      const dispatchRemoteKitchen = () => {
        dispatchDineInAddonKitchenPrint({
          kitchenCartLines,
          dedupeKey: kitchenDedupeKey,
          orderNo: orderNoStr,
          storeCode,
          tableName,
          memo,
          guestCount: Number(row.guest_count ?? 0) || undefined,
          logEvent: 'remote_dine_in_add_kitchen_autoprint',
        })
      }

      if (shouldAutoPrintReceipt) {
        void printReceiptNow(receiptPayloadRemote, null, false, undefined, true)
      }
      if (autoPrintKitchenSlipOnOrder && kitchenCartLines.length > 0) {
        const kitchenDelayMs = shouldAutoPrintReceipt
          ? typeof window !== 'undefined' && window.cmPosShell
            ? resolveAfterReceiptToKitchenDelayMs()
            : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
          : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
        setTimeout(dispatchRemoteKitchen, kitchenDelayMs)
      }
    }
    const channels = currentStoreCodeVariants
      .map((storeCode) =>
        subscribePosOrdersUpdate(onUpdate, {
          store: storeCode,
          ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        })
      )
      .filter(Boolean)
    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    currentStoreCodeVariants,
    autoPrintReceiptOnPayment,
    autoPrintReceiptOnAddOrder,
    autoPrintReceiptOnOrder,
    auth?.tenantId,
    autoPrintKitchenSlipOnOrder,
    pricingAdjustments,
    posReceiptLineOpts,
    parseRealtimePosOrderRowItemsJson,
    enrichPromoItemsWithOptionName,
    dispatchDineInAddonKitchenPrint,
    buildDineInQtySnapshot,
    shouldSkipDineInRemoteAddAutoprint,
    resolveDineInSnapshotItemKey,
    formatLineNoteForPrint,
    logPosPrintDebug,
    t,
    refetchCurrentStore,
    printReceiptNow,
    printKitchenFromPosOrder,
    reserveKitchenAutoPrintKey,
    playIncomingOrderBeep,
  ])

  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) {
      if (!isMainPosDevice) {
        hasInitializedMainPosPollRef.current = false
        lastSeenOrderIdRef.current = 0
        lastSeenOrderIdPersistedRef.current = 0
        startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
        prevStoreForPollRef.current = null
        lastMetaScanAtRef.current = 0
      }
      triggerMainPosPollNowRef.current = null
      return
    }
    if (prevStoreForPollRef.current !== currentStoreId) {
      const persistedLastSeen = readMainPosLastSeenOrderId(currentStoreId)
      hasInitializedMainPosPollRef.current = false
      lastSeenOrderIdRef.current = persistedLastSeen
      lastSeenOrderIdPersistedRef.current = persistedLastSeen
      startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
      prevStoreForPollRef.current = currentStoreId
      grabCancelWatchSnapshotRef.current.clear()
      grabCancelWatchSeededRef.current = false
      lastMetaScanAtRef.current = 0
      printedHallDiscountReprintKeysRef.current.clear()
    }
    const today = getPosBusinessDateStr()
    const poll = async () => {
      if (mainPosPollInFlightRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      mainPosPollInFlightRef.current = true
      try {
        const runPaymentReceiptScan = async () => {
          if (!autoPrintReceiptOnPayment) return
          if (
            paymentReceiptScanSeededRef.current &&
            !shouldUseMainPosHeavyOrderScanFallback({
              realtimeChannelHealthy: realtimeChannelHealthyRef.current,
              lastRealtimeOrderEventAtMs: lastRealtimeOrderEventAtRef.current,
            })
          ) {
            return
          }
          try {
            const paidLikeRows = await getPosOrders({
              startStr: today,
              endStr: today,
              posBizDayScope: true,
              storeCode: currentStoreId,
              statusPaidLike: true,
              limit: 800,
              orderBy: 'id.desc',
              pollMinimal: true,
            })
            if (!paymentReceiptScanSeededRef.current) {
              for (const order of paidLikeRows) {
                const oid = Number(order.id)
                if (!Number.isFinite(oid) || oid <= 0) continue
                if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) continue
                if (posOrderPaymentSum(order) <= 0) continue
                if (!(order.items || []).length) continue
                printedPaymentReceiptIdsRef.current.add(oid)
              }
              paymentReceiptScanSeededRef.current = true
              return
            }
            const candidates = paidLikeRows.filter((order) => {
              const oid = Number(order.id)
              if (!Number.isFinite(oid) || oid <= 0) return false
              if (printedPaymentReceiptIdsRef.current.has(oid)) return false
              if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) return false
              if (posOrderPaymentSum(order) <= 0) return false
              if (!(order.items || []).length) return false
              return true
            })
            candidates.sort((a, b) => Number(a.id) - Number(b.id))
            let staggerMs = 0
            for (const order of candidates) {
              const oid = Number(order.id)
              setTimeout(() => {
                void (async () => {
                  try {
                    const fullRows = await getPosOrders({
                      orderId: oid,
                      storeCode: currentStoreId,
                    })
                    const full = fullRows[0]
                    if (!full) return
                    if (!isPosOrderPaidLikeStatus(String(full.status ?? ''))) return
                    if (posOrderPaymentSum(full) <= 0) return
                    if (!(full.items || []).length) return
                    await dispatchPaymentReceiptFromOrder(full)
                  } catch {
                    /* ignore */
                  }
                })()
              }, staggerMs)
              staggerMs += 900
            }
          } catch {
            /* ignore payment scan errors */
          }
        }

        const sinceId = hasInitializedMainPosPollRef.current && lastSeenOrderIdRef.current > 0 ? lastSeenOrderIdRef.current : undefined
        const orders = await getPosOrders({
          startStr: today,
          endStr: today,
          posBizDayScope: true,
          storeCode: currentStoreId,
          pollMinimal: true,
          ...(sinceId != null ? { sinceId } : {}),
        })
        if (!hasInitializedMainPosPollRef.current) {
          const maxId = orders.length ? Math.max(...orders.map((o) => o.id ?? 0)) : 0
          for (const o of orders) {
            const oid = Number(o.id)
            if (Number.isFinite(oid) && oid > 0) {
              seenOrderIdsRef.current.add(oid)
              if (
                String(o.orderType ?? '').trim().toLowerCase() === 'dine_in' &&
                (o.items || []).length > 0
              ) {
                const qtySnap = buildDineInQtySnapshot(o.items || [])
                if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
              }
            }
          }
          const seededMax = Math.max(lastSeenOrderIdRef.current, maxId)
          bumpLastSeenOrderId(seededMax)
          hasInitializedMainPosPollRef.current = true
          runGrabCancelWatchOnOrders(orders, { seedOnly: true })
          await runPaymentReceiptScan()
          return
        }
        const newOrders = orders
        let shouldRefreshCurrentStore = false
        for (const order of newOrders) {
          const oid = Number(order.id)
          if (!Number.isFinite(oid) || oid <= 0) continue
          if (!isCurrentStoreOrder(order.storeCode ?? '')) {
            logPosPrintDebug('poll_skip_store_mismatch', {
              orderId: oid,
              rowStore: String(order.storeCode ?? ''),
            })
            continue
          }
          if (!shouldTreatAsIncomingOrder(oid, order.createdAt)) {
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_skip_not_incoming', {
              orderId: oid,
              createdAt: String(order.createdAt ?? ''),
            })
            continue
          }
          if (seenOrderIdsRef.current.has(oid)) {
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_skip_seen', { orderId: oid })
            continue
          }
          if (consumeSuppressMainPosAutoPrintForQueuedSync(oid)) {
            seenOrderIdsRef.current.add(oid)
            bumpLastSeenOrderId(oid)
            logPosPrintDebug('poll_suppress_queued_sync', { orderId: oid })
            continue
          }
          const items = prepareOrderItemsForKitchenPrint(
            order.items || [],
            (order as { deliveryAppCode?: string }).deliveryAppCode ??
              (order.items || []).find((row) => String(row.deliveryAppCode ?? '').trim())?.deliveryAppCode
          )
          /* 품목이 아직 비어 있으면 seen/워터마크에 넣지 않음 → 다음 폴링에서 다시 조회 */
          if (items.length === 0) {
            logPosPrintDebug('poll_skip_empty_items', { orderId: oid })
            continue
          }
          seenOrderIdsRef.current.add(oid)
          bumpLastSeenOrderId(oid)
          const inferredDeliveryCode =
            String((order as unknown as { deliveryAppCode?: string }).deliveryAppCode ?? '').trim() ||
            String(
              (order.items || []).find((it) => String(it.deliveryAppCode ?? '').trim())?.deliveryAppCode ?? ''
            ).trim()
          autoFocusIncomingDeliveryOrder({
            orderId: oid,
            orderType: String(order.orderType ?? ''),
            deliveryAppCode: inferredDeliveryCode,
            status: String(order.status ?? ''),
            createdAt: String(order.createdAt ?? ''),
            storeCode: String(order.storeCode ?? ''),
            memo: String(order.memo ?? ''),
          })
          shouldRefreshCurrentStore = true
          const receiptPayloadPoll = {
            ...hallOrderReceiptPayloadFromPosOrder(order, pricingAdjustments, {
              ...posReceiptLineOpts,
              orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, t),
              storeCodeFallback: currentStoreId,
            }),
            _autoPrintDedupeKey: `order:${oid}:hall:auto`,
          }
          const runKitchenForPolledOrder = () => {
            void dispatchKitchenAutoPrintForPosOrder(order, {
              dedupeKey: `order:${oid}:kitchen`,
              flow: 'poll',
            })
          }
          const isPendingDelivery =
            String(order.orderType ?? '').trim().toLowerCase() === 'delivery' &&
            String(order.status ?? '').trim().toLowerCase() === 'pending'
          const shouldWaitForDeliveryAccept =
            isPendingDelivery && isApiInboundDeliveryOrderMemo(String(order.memo ?? ''))
          const shouldWaitForMemberPortalPrepay = isMemberPortalPaymentPendingOrder({
            memo: String(order.memo ?? ''),
            status: String(order.status ?? ''),
            payment_qr: order.paymentQr,
            created_by: undefined,
          })
          const shouldDeferAutoprint = shouldWaitForDeliveryAccept || shouldWaitForMemberPortalPrepay
          if (!shouldDeferAutoprint) {
            logPosPrintDebug('poll_autoprint_start', {
              orderId: oid,
              autoPrintReceiptOnOrder,
              autoPrintKitchenSlipOnOrder,
              itemCount: items.length,
              isPendingDelivery,
              shouldWaitForDeliveryAccept,
              shouldWaitForMemberPortalPrepay,
            })
            if (autoPrintReceiptOnOrder && autoPrintKitchenSlipOnOrder) {
              printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true, runKitchenForPolledOrder)
            } else if (autoPrintReceiptOnOrder) {
              printReceiptNow(receiptPayloadPoll, undefined, false, undefined, true)
            } else if (autoPrintKitchenSlipOnOrder) {
              setTimeout(runKitchenForPolledOrder, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
            }
          } else {
            logPosPrintDebug('poll_deferred_autoprint', {
              orderId: oid,
              status: String(order.status ?? ''),
              isInboundDeliveryOrder: isApiInboundDeliveryOrderMemo(String(order.memo ?? '')),
              shouldWaitForMemberPortalPrepay,
            })
          }
          if (String(order.orderType ?? '').trim().toLowerCase() === 'dine_in' && items.length > 0) {
            const qtySnap = buildDineInQtySnapshot(items)
            if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
          }
        }
        if (shouldRefreshCurrentStore) {
          refetchCurrentStore()
        }

        const nowMs = Date.now()
        const shouldRunMetaScan =
          !lastMetaScanAtRef.current ||
          nowMs - lastMetaScanAtRef.current >= MAIN_POS_META_SCAN_INTERVAL_MS ||
          nowMs - lastRealtimeOrderEventAtRef.current >= MAIN_POS_META_SCAN_INTERVAL_MS
        if (shouldRunMetaScan) {
          lastMetaScanAtRef.current = nowMs
          const needHeavyMetaScan = shouldUseMainPosHeavyOrderScanFallback({
            realtimeChannelHealthy: realtimeChannelHealthyRef.current,
            lastRealtimeOrderEventAtMs: lastRealtimeOrderEventAtRef.current,
          })
          const wantMetaDineInAddonReceipt =
            autoPrintReceiptOnAddOrder || autoPrintReceiptOnOrder
          const wantMetaDineInAddonKitchen = autoPrintKitchenSlipOnOrder
          const wantDineInAddonMetaScan = wantMetaDineInAddonReceipt || wantMetaDineInAddonKitchen
          if (needHeavyMetaScan || wantDineInAddonMetaScan) {
            try {
              const watchOrders = await getPosOrders({
                startStr: today,
                endStr: today,
                posBizDayScope: true,
                storeCode: currentStoreId,
                limit: 800,
                orderBy: 'id.desc',
                pollMinimal: true,
              })
              if (wantDineInAddonMetaScan) {
                for (const o of watchOrders) {
                const oid = Number(o.id)
                if (!Number.isFinite(oid) || oid <= 0) continue
                if (String(o.orderType ?? '').trim().toLowerCase() !== 'dine_in') continue
                const statusLower = String(o.status ?? '').trim().toLowerCase()
                if (statusLower === 'completed' || statusLower === 'cancelled' || statusLower === 'canceled') continue
                if (isPosOrderPaidLikeStatus(statusLower)) continue
                if (posOrderPaymentSum(o) > 0) continue
                const items = (o.items || []).map((it) =>
                  mapPosOrderItemForKitchenDelta(it as unknown as Record<string, unknown>)
                )
                if (!items.length) continue
                const prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(oid)
                const newQtyById = buildDineInQtySnapshot(items)
                if (newQtyById.size === 0) continue
                const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(oid)
                if (suppressUntil != null) {
                  if (Date.now() < suppressUntil) {
                    dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                    logPosPrintDebug('poll_meta_skip_self_dine_in_suppress', { orderId: oid })
                    continue
                  }
                  mainPosSelfDineInUpdateSuppressUntilRef.current.delete(oid)
                }
                if (!prevQtyById) {
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  continue
                }
                const changedIds = [...newQtyById.keys()].filter((id) => {
                  const prevQty = Number(prevQtyById.get(id) ?? 0)
                  const nextQty = Number(newQtyById.get(id) ?? 0)
                  if (prevQty <= 0) return nextQty > 0
                  return nextQty > prevQty
                })
                if (changedIds.length === 0) {
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  continue
                }
                const storeCodePoll = String(o.storeCode ?? currentStoreId)
                const changedSet = new Set(changedIds)
                if (
                  shouldSkipDineInRemoteAddAutoprint(oid, storeCodePoll, prevQtyById, newQtyById, changedSet)
                ) {
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  logPosPrintDebug('poll_meta_remote_dine_in_add_skip_recent_local_print', { orderId: oid })
                  continue
                }
                const cartLikeNew = items.map((it) => ({
                  ...it,
                  id: resolveDineInSnapshotItemKey(it),
                  quantity: it.qty,
                  qty: it.qty,
                  ...(it.note ? { note: formatLineNoteForPrint(it.note) } : {}),
                }))
                const kitchenCartLines = buildKitchenCartLinesFromSnapshotDelta(
                  cartLikeNew,
                  prevQtyById,
                  newQtyById,
                  (line) => resolveDineInSnapshotItemKey(line)
                )
                dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                refetchCurrentStore()
                const receiptPrintItemsRemote = items.map((it) => ({
                  ...it,
                  ...(changedSet.has(resolveDineInSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
                }))
                const hallAddonLinesRemote = receiptPrintItemsRemote.filter((it) => it.isAddon === true)
                const mergeSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
                const discountAmt = Number(o.discountAmt ?? 0)
                const couponDiscountAmt = Number(o.couponDiscountAmt ?? 0)
                const pricing = computePosPricing({
                  subtotal: mergeSubtotal,
                  discountAmt,
                  cardPaymentAmount: 0,
                  adjustments: pricingAdjustments,
                })
                const orderNoStr = String(o.orderNo ?? '')
                const tableNamePoll = String(o.tableName ?? '')
                const memoPoll = String(o.memo ?? '')
                const receiptPayloadRemote = {
                  orderNo: orderNoStr,
                  storeCode: storeCodePoll,
                  orderType: t('posOrderTypeDineIn') || '매장',
                  tableName: tableNamePoll,
                  memo: memoPoll,
                  items: receiptPrintItemsRemote,
                  subtotal: mergeSubtotal,
                  discountAmt,
                  couponDiscountAmt,
                  discountReason: String(o.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  _autoPrintDedupeKey: `order:${oid}:hall:add:${buildDineInAddKitchenPrintDedupeSuffix(
                    hallAddonLinesRemote.length > 0 ? hallAddonLinesRemote : kitchenCartLines,
                    { formatNote: formatLineNoteForPrint }
                  )}`,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...posGuestCountSpread(o.guestCount),
                }
                logPosPrintDebug('poll_meta_remote_dine_in_add_receipt', {
                  orderId: oid,
                  changedCount: changedIds.length,
                })
                if (wantMetaDineInAddonReceipt) {
                  void printReceiptNow(receiptPayloadRemote, undefined, false, undefined, true)
                }
                if (wantMetaDineInAddonKitchen && kitchenCartLines.length > 0) {
                  const kitchenDelayMs = wantMetaDineInAddonReceipt
                    ? typeof window !== 'undefined' && window.cmPosShell
                      ? resolveAfterReceiptToKitchenDelayMs()
                      : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
                    : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
                  setTimeout(() => {
                    dispatchDineInAddonKitchenPrint({
                      kitchenCartLines,
                      dedupeKey: buildDineInAddKitchenAutoPrintDedupeKey(oid, kitchenCartLines, {
                        formatNote: formatLineNoteForPrint,
                      }),
                      orderNo: orderNoStr,
                      storeCode: storeCodePoll,
                      tableName: tableNamePoll,
                      memo: memoPoll,
                      guestCount: Number(o.guestCount ?? 0) || undefined,
                      logEvent: 'poll_meta_remote_dine_in_add_kitchen',
                    })
                  }, kitchenDelayMs)
                }
                }
              }
              if (needHeavyMetaScan) {
                if (!grabCancelWatchSeededRef.current) {
                  runGrabCancelWatchOnOrders(watchOrders, { seedOnly: true })
                } else if (runGrabCancelWatchOnOrders(watchOrders, { seedOnly: false })) {
                  refetchCurrentStore()
                }
              }
            } catch {
              /* meta scan: dine-in add / grab cancel */
            }
          }
        }

        await runPaymentReceiptScan()
      } catch {
        // ignore poll errors
      } finally {
        mainPosPollInFlightRef.current = false
      }
    }
    triggerMainPosPollNowRef.current = () => {
      const now = Date.now()
      if (now - lastTriggerMainPosPollAtRef.current < MAIN_POS_TRIGGER_POLL_MIN_MS) return
      if (mainPosPollInFlightRef.current) return
      lastTriggerMainPosPollAtRef.current = now
      void poll()
    }

    let pollLoopCancelled = false

    const scheduleNextPoll = () => {
      if (pollLoopCancelled) return
      const delayMs = resolveMainPosPollIntervalMs({
        realtimeChannelHealthy: realtimeChannelHealthyRef.current,
        realtimeRecentlyActive: isMainPosRealtimeRecentlyActive(lastRealtimeOrderEventAtRef.current),
      })
      mainPosPollTimerRef.current = setTimeout(() => {
        void poll().finally(() => {
          if (!pollLoopCancelled) scheduleNextPoll()
        })
      }, delayMs)
    }

    void poll().finally(() => scheduleNextPoll())

    return () => {
      pollLoopCancelled = true
      triggerMainPosPollNowRef.current = null
      if (mainPosPollTimerRef.current) {
        clearTimeout(mainPosPollTimerRef.current)
        mainPosPollTimerRef.current = null
      }
    }
  }, [
    isMainPosDevice,
    currentStoreId,
    autoPrintReceiptOnOrder,
    autoPrintReceiptOnAddOrder,
    autoPrintKitchenSlipOnOrder,
    autoPrintReceiptOnPayment,
    pricingAdjustments,
    posReceiptLineOpts,
    menus,
    autoFocusIncomingDeliveryOrder,
    t,
    lang,
    refetchCurrentStore,
    isCurrentStoreOrder,
    logPosPrintDebug,
    bumpLastSeenOrderId,
    shouldTreatAsIncomingOrder,
    buildDineInQtySnapshot,
    shouldSkipDineInRemoteAddAutoprint,
    resolveDineInSnapshotItemKey,
    resolveOrderItemDisplayName,
    enrichPromoItemsWithOptionName,
    printReceiptNow,
    dispatchDineInAddonKitchenPrint,
    formatLineNoteForPrint,
    mapPosOrderItemForKitchenDelta,
  ])

  /** 절전·탭 복귀·온라인 복구 시 Realtime 재구독 + 즉시 증분 폴링 */
  useEffect(() => {
    if (!isMainPosDevice || !currentStoreId) return
    const onResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      logPosPrintDebug('realtime_resume_reconnect', {})
      realtimeChannelStateRef.current.clear()
      realtimeChannelHealthyRef.current = false
      setRealtimeResubscribeTick((n) => n + 1)
      triggerMainPosPollNowRef.current?.()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('online', onResume)
    return () => {
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('online', onResume)
    }
  }, [isMainPosDevice, currentStoreId, logPosPrintDebug])

  useEffect(() => {
    if (selectedTableId) {
      setActiveFloor(getTableFloor(selectedTableId))
    } else if (servingTableId) {
      setActiveFloor(getTableFloor(servingTableId))
    }
  }, [selectedTableId, servingTableId, floorLayoutForView])

  useEffect(() => {
    if (selectedTableId || servingTableId) return
    const hasActiveFloorTable = floorLayoutForView.some(
      (tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) === activeFloor
    )
    if (hasActiveFloorTable || floorLayoutForView.length === 0) return
    const floors = Array.from(
      new Set(floorLayoutForView.map((tbl) => Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as 1 | 2 | 3))
    ).sort((a, b) => a - b)
    if (floors[0] && floors[0] !== activeFloor) {
      setActiveFloor(floors[0])
    }
  }, [floorLayoutForView, activeFloor, selectedTableId, servingTableId])

  const tryOpenDrawerForPayment = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      if (isPosDemo) return
      if (!payment || !currentStoreId) return
      const cashAmt = Math.max(0, Number(payment.paymentCash || 0))
      if (cashAmt <= 0) return
      // force 는 "수동 강제 열기 전용"으로 간주: 자동 결제 오픈은 수행하지 않음
      if (drawerOpenOption === 'force') return
      const res = await openPosCashDrawerSecure({
        reason: 'cash_payment',
        source: 'payment_auto',
        storeCode: currentStoreId,
        userName: auth?.user || '',
        drawerOpenOption,
      })
      if (res.success) {
        // 성공 시 이전 실패 경고 상태를 즉시 해제해 다음 실패를 정확히 알린다.
        drawerOpenWarnedRef.current = false
      }
      if (!res.success && shouldWarnPosCashDrawerFailure(res.error) && !drawerOpenWarnedRef.current) {
        drawerOpenWarnedRef.current = true
        await appAlert(formatPosCashDrawerFailureMessage(t, res.error))
      }
    },
    [isPosDemo, currentStoreId, auth?.user, drawerOpenOption, t, openPosCashDrawerSecure]
  )

  const tryOpenDrawerOnOrderComplete = useCallback(
    async (
      payment: CartPanelPaymentPayload | null | undefined,
      options?: { skipAutoOpen?: boolean }
    ) => {
      /** 분할 결제는 인원별 현금 확정 때만 열고, 최종 완료 단계에서는 다시 열지 않는다. */
      if (options?.skipAutoOpen || splitCashDrawerStepsRef.current > 0) {
        splitCashDrawerStepsRef.current = 0
        return
      }
      /**
       * 서랍 킥과 영수증 무인쇄가 같은 프린터 RAW/스풀을 두고 경쟁하면
       * Windows에서 인쇄가 수 초~10초 밀릴 수 있음 → 하이브리드는 영수증이 먼저 잡도록 짧게 지연.
       */
      void (async () => {
        try {
          const hybrid =
            typeof window !== 'undefined' &&
            typeof window.cmPosShell?.printHtml === 'function'
          if (hybrid) {
            await new Promise<void>((r) => setTimeout(r, 900))
          }
          await tryOpenDrawerForPayment(payment)
        } catch (e) {
          console.error('tryOpenDrawerForPayment:', e)
        }
      })()
    },
    [tryOpenDrawerForPayment]
  )

  const handleSplitCashPaymentStep = useCallback(
    async (payment: CartPanelPaymentPayload) => {
      splitCashDrawerStepsRef.current += 1
      await tryOpenDrawerForPayment(payment)
    },
    [tryOpenDrawerForPayment]
  )

  const runLinkposPaymentIfNeeded = useCallback(
    async (payment: CartPanelPaymentPayload | null | undefined) => {
      if (isPosDemo) return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      const cardAmount = Math.max(0, Number(payment?.paymentCard || 0))
      if (cardAmount <= 0) return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }

      // API 미활성·강제 수기면 단말 호출 금지 (브리지 health만으로 승인 위장 방지)
      // HTTPS POS → localhost health는 혼합콘텐츠로 막히므로 IPC(probeLinkposLocalReady) 우선
      const linkposApiOn = isLinkposCardApiEnabled()
      const localBridgeReady = linkposApiOn ? await probeLinkposLocalReady() : false

      // 로컬 EDC 준비 + API ON 이면 매장「단말 생략」보다 단말 우선. API OFF면 항상 수기.
      if (
        !(linkposApiOn && localBridgeReady) &&
        shouldSkipLinkposTerminalForCard(posPrinterSettingsRef.current?.linkposSkipTerminalForCard)
      ) {
        return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      }
      if (!linkposApiOn) {
        return { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
      }
      if (!currentStoreId) {
        return { ok: false as const, message: 'store_required' }
      }
      const rawBank = String(payment?.deliveryPaymentChannel ?? '').trim()
      const bankIdMatch = rawBank.match(/bank[:=]\s*([0-9]{2,3})/i)
      /** J6는 선택 필드 — 미지정이면 단말 기본값 사용 (하드코딩 '04' 금지) */
      const bankId = bankIdMatch?.[1] || ''
      const ref1 = `POS${Date.now().toString().slice(-14)}`.slice(0, 20)
      const ref2 = String(auth?.user || '').trim().slice(0, 20)

      setCustomerDisplayPaymentMessage(
        t('posWaitingEdcCard') || 'กรุณารูดหรือเสียบบัตรที่เครื่องครับ'
      )

      const result = await executeLinkposPayment({
        amount: cardAmount,
        bankId,
        reference1: ref1,
        reference2: ref2,
        storeCode: currentStoreId,
        timeoutMs: 120000,
      })
      setCustomerDisplayPaymentMessage('')
      if (!result.success) {
        const raw = String(result.message || '').trim()
        const soft =
          raw === 'edc_nak' || raw === 'serial_not_ready' || raw === 'serial_response_timeout'
            ? t('posCardApprovalFailedSoft') ||
              'เครื่องยังไม่พร้อมหรือรายการไม่สำเร็จ กรุณาลองอีกครั้งครับ'
            : (t('posCardApprovalFailed') || '카드 승인에 실패했습니다.') +
              (raw ? ` (${raw})` : '')
        await appAlert(soft)
        return { ok: false as const, message: soft }
      }
      // API disabled stub(payment null)을 카드 승인 성공으로 취급하지 않음
      if (!result.payment) {
        const soft =
          t('posCardApprovalFailedSoft') ||
          'เครื่องยังไม่พร้อมหรือรายการไม่สำเร็จ กรุณาลองอีกครั้งครับ'
        await appAlert(soft)
        return { ok: false as const, message: soft }
      }
      return { ok: true as const, linkposPayment: result.payment as LinkposPaymentSummary }
    },
    [isPosDemo, currentStoreId, auth?.user, t]
  )

  const sleepMs = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), [])

  const noteKbankRateLimitResponse = useCallback((message: unknown): boolean => {
    if (!isKbankRateLimitError(message)) return false
    // 이미 pause 중이면 만료 시각을 뒤로 미루지 않음 (Void/Inquiry 연타로 3분 타이머 리셋 방지).
    if (Date.now() < kbankApiPausedUntilRef.current) return true
    const until = Date.now() + KBANK_RATE_LIMIT_BACKOFF_MS
    kbankApiPausedUntilRef.current = until
    setKbankApiPausedUntilMs(until)
    return true
  }, [])

  const clearKbankApiPause = useCallback(() => {
    kbankApiPausedUntilRef.current = 0
    setKbankApiPausedUntilMs(0)
  }, [])

  const isKbankApiPaused = useCallback(
    () => Date.now() < kbankApiPausedUntilRef.current,
    []
  )

  const alertIfKbankApiPaused = useCallback(
    async (label: string): Promise<boolean> => {
      if (!isKbankApiPaused()) return true
      const waitSec = Math.max(1, Math.ceil((kbankApiPausedUntilRef.current - Date.now()) / 1000))
      const waitMin = Math.max(1, Math.ceil(waitSec / 60))
      await appAlert(
        String(t('posKbankRateLimitAlert') || '')
          .replace('{minutes}', String(waitMin))
          .replace('{label}', label) ||
          `KBank API rate limit exceeded. Wait about ${waitMin} minute(s), then try ${label} once (do not tap repeatedly).`
      )
      return false
    },
    [isKbankApiPaused, t]
  )

  const enforceKbankCooldown = useCallback(
    async (
      bucket: 'generate' | 'inquiry' | 'followup',
      minIntervalMs: number,
      label: string
    ): Promise<boolean> => {
      const targetRef =
        bucket === 'generate'
          ? kbankGenerateLastAtRef
          : bucket === 'inquiry'
            ? kbankInquiryLastAtRef
            : kbankFollowupLastAtRef
      const now = Date.now()
      const elapsed = now - targetRef.current
      const remainingMs = minIntervalMs - elapsed
      if (remainingMs > 0) {
        const waitSec = Math.ceil(remainingMs / 1000)
        await appAlert(
          `KBank rate-limit protection: wait about ${waitSec}s before ${label}.`
        )
        return false
      }
      targetRef.current = now
      return true
    },
    []
  )

  const openKbankOutcomeModal = useCallback(
    (next: KbankOutcomeState, dedupeKey?: string) => {
      const key = String(dedupeKey || `${next.kind}:${next.refId}:${next.amount}`).trim()
      if (key && kbankOutcomeLastKeyRef.current === key) return
      if (key) kbankOutcomeLastKeyRef.current = key
      setKbankOutcomeState(next)
    },
    []
  )

  const tryRunKbankPendingFinalize = useCallback(
    (refId: string, approval: { txnNo?: string; cardBrands?: string[] }) => {
      const key = String(refId || '').trim()
      if (!key) return false
      const finalize = pendingKbankFinalizeRef.current[key]
      if (!finalize) return false
      delete pendingKbankFinalizeRef.current[key]
      delete deferredKbankApprovalRef.current[key]
      void Promise.resolve(finalize(approval)).catch((e) =>
        console.error('kbank pending finalize:', e)
      )
      return true
    },
    []
  )

  const registerPendingKbankFinalize = useCallback(
    (
      partnerTxnId: string,
      fn: (approval: { txnNo?: string; cardBrands?: string[] }) => void | Promise<void>
    ) => {
      const key = String(partnerTxnId || '').trim()
      if (!key) return
      pendingKbankFinalizeRef.current[key] = fn
      const deferred = deferredKbankApprovalRef.current[key]
      if (deferred) {
        tryRunKbankPendingFinalize(key, deferred)
      }
    },
    [tryRunKbankPendingFinalize]
  )

  const purgeKbankPendingFinalize = useCallback((partnerTxnId: string) => {
    const key = String(partnerTxnId || '').trim()
    if (!key) return
    delete pendingKbankFinalizeRef.current[key]
    delete deferredKbankApprovalRef.current[key]
  }, [])

  const clearKbankQrFromLinkpos = useCallback(() => {
    setLinkposQrBridgeStatus('idle')
    void executeLinkposClearQr({ storeCode: currentStoreId })
  }, [currentStoreId])

  const pushKbankQrToLinkposDisplay = useCallback(
    async (params: {
      qrPayload: string
      amount: number
      reference1?: string
      reference2?: string
    }) => {
      setLinkposQrBridgeStatus('idle')
      const out = await executeLinkposDisplayQr({
        qrPayload: params.qrPayload,
        amount: params.amount,
        reference1: params.reference1,
        reference2: params.reference2,
        storeCode: currentStoreId,
      })
      if (out.success) {
        setLinkposQrBridgeStatus('ok')
      } else if (out.message !== 'linkpos_card_api_disabled') {
        setLinkposQrBridgeStatus('failed')
      }
      return out
    },
    [currentStoreId]
  )

  const presentKbankPaymentApproved = useCallback(
    (input: {
      refId: string
      amount?: number
      approvalCode?: string
      timeLabel?: string
      dedupeKey?: string
      paymentMethod?: string
      cardBrands?: string[]
    }) => {
      const refId = String(input.refId || '').trim()
      if (!refId) return
      const brands = input.cardBrands ?? kbankOpsCardBrands
      const approval = { txnNo: input.approvalCode, cardBrands: brands }
      const alreadyNotified = kbankCallbackNotifiedTxRef.current === refId
      // QR 대기 결제: 승인되면 등록된 후처리(주문 paid 마감·영수증). 콜백이 먼저 오면 deferred 후 등록 시 실행.
      if (!alreadyNotified) {
        clearKbankQrFromLinkpos()
        if (!tryRunKbankPendingFinalize(refId, approval)) {
          deferredKbankApprovalRef.current[refId] = approval
        }
      }
      kbankCallbackNotifiedTxRef.current = refId
      setKbankCallbackState('received')
      clearKbankApiPause()
      setCustomerDisplayPaymentMessage('')
      if (alreadyNotified) return
      openKbankOutcomeModal(
        {
          kind: 'success',
          amount:
            input.amount != null && Number.isFinite(input.amount)
              ? input.amount
              : Math.max(0, Number(liveKbankQrAmount || 0)),
          refId,
          paymentMethod:
            input.paymentMethod ||
            (liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR'),
          cardLabel: brands.length > 0 ? brands.join(' / ') : undefined,
          approvalCode: input.approvalCode,
          timeLabel: input.timeLabel || formatPosDateTimeMedium(new Date(), lang),
        },
        input.dedupeKey || `success:${refId}`
      )
    },
    [
      kbankOpsCardBrands,
      liveKbankQrAmount,
      liveKbankQrType,
      openKbankOutcomeModal,
      lang,
      tryRunKbankPendingFinalize,
      clearKbankQrFromLinkpos,
      clearKbankApiPause,
    ]
  )

  const presentKbankApprovedFromInquiry = useCallback(
    (
      partnerTxnUid: string,
      st: {
        success?: boolean
        status?: string | null
        statusCode?: string | null
        data?: Record<string, unknown>
      },
      dedupePrefix: string,
      options?: { amount?: number; paymentMethod?: string }
    ): boolean => {
      if (!st.success) return false
      const stData = (st.data || {}) as Record<string, unknown>
      if (!isKbankInquiryResponseApproved(st.status, stData, st.statusCode)) return false
      const stTxnNo = extractKbankPaymentTxnNo(stData).slice(0, 20)
      if (stTxnNo) setKbankOpsTxnNo(stTxnNo)
      const inquiryMeta = extractKbankQrResponseMeta(stData)
      const brands = resolveKbankCreditCardBrandLabels({
        sof: inquiryMeta.sof,
        cardScheme: inquiryMeta.cardScheme,
      })
      if (brands.length > 0) setKbankOpsCardBrands(brands)
      presentKbankPaymentApproved({
        refId: partnerTxnUid,
        amount: options?.amount,
        paymentMethod: options?.paymentMethod,
        approvalCode: stTxnNo || undefined,
        cardBrands: brands,
        dedupeKey: `${dedupePrefix}:${partnerTxnUid}:${stTxnNo || st.status || ''}`,
      })
      return true
    },
    [presentKbankPaymentApproved]
  )

  /** KBank QR 직원 모니터 세션 정리 (QR 이미지·후속 처리 ID·상태 초기화) */
  const clearKbankQrSession = useCallback(() => {
    purgeKbankPendingFinalize(kbankOpsTxnUidRef.current)
    clearKbankQrFromLinkpos()
    setLiveKbankQrPayload('')
    setLiveKbankQrType('THAI_QR')
    setKbankOpsTxnUid('')
    setKbankOpsOrigTxnUid('')
    setKbankOpsTxnNo('')
    setCustomerDisplayPaymentMessage('')
    setKbankCallbackState('idle')
    kbankManualCancelPendingRef.current = false
    kbankCcInquiryTriggeredRef.current = ''
  }, [purgeKbankPendingFinalize, clearKbankQrFromLinkpos])

  const runKbankQrPaymentIfNeeded = useCallback(
    async (
      payment: CartPanelPaymentPayload | null | undefined,
      context?: { orderType?: string; orderLabel?: string; orderId?: number }
    ) => {
      if (isPosDemo) return { ok: true as const }
      kbankManualCancelPendingRef.current = false
      const qrAmount = Math.max(0, Number(payment?.paymentQr || 0))
      if (qrAmount <= 0) return { ok: true as const }
      if (!isKbankPilotStore) return { ok: true as const }
      if (!currentStoreId) {
        const msg = t('posStoreRequired') || '매장 정보가 필요합니다.'
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }
      const canGenerate = await enforceKbankCooldown('generate', 5000, 'Generate QR')
      if (!canGenerate) {
        return { ok: false as const, message: 'kbank_generate_cooldown' }
      }
      const selectedQrType = String(payment?.paymentQrType || 'THAI_QR').trim().toUpperCase()
      // 고객 모니터 없으면 QR API 생성 후 EDC 표시를 기본 선호 (Jayle 등)
      const preferEdcDisplay =
        Boolean(payment?.paymentQrShowOnEdc) ||
        (!dualMonitorEnabled && isLinkposCardApiEnabled())
      const requestedQrType = selectedQrType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'THAI_QR'

      const existingQrPayload = String(liveKbankQrPayload || '').trim()
      const existingPartnerTxnId = String(kbankOpsTxnUid || '').trim()
      const canReuseLiveQr =
        Boolean(existingQrPayload && existingPartnerTxnId) &&
        kbankCallbackState === 'waiting' &&
        !kbankManualCancelPendingRef.current &&
        Math.abs(liveKbankQrAmount - qrAmount) < 0.001 &&
        liveKbankQrType === requestedQrType

      if (canReuseLiveQr) {
        setCustomerDisplayPaymentMessage(
          (t('posPaymentQr') || 'QR') + ' ' + (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
        )
        return {
          ok: false as const,
          qrPending: true as const,
          message: 'kbank_qr_pending',
          partnerTransactionId: existingPartnerTxnId,
          qrAmount,
          qrType: requestedQrType,
        }
      }

      if (!(await alertIfKbankApiPaused('Generate QR'))) {
        return { ok: false as const, message: 'kbank_rate_limit_paused' }
      }

      setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posLoading') || '로딩 중'))

      const terminalId = String(kbankOpsTerminalId || '').trim()
      const partnerTransactionIdSeed = `POSQR${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
      const generate = await executeKbankGenerateQr({
        amount: qrAmount,
        qrType: requestedQrType,
        storeCode: currentStoreId,
        orderId: context?.orderId,
        partnerTransactionId: partnerTransactionIdSeed,
        reference1: String(context?.orderType || '').slice(0, 20),
        reference2: String(context?.orderLabel || '').slice(0, 20),
        ...(terminalId ? { terminalId } : {}),
      })
      if (!generate.success) {
        setLiveKbankQrPayload('')
        setLiveKbankQrType('THAI_QR')
        setLiveKbankQrTypeSource('requested')
        setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
        setKbankGenerateAuditText(
          generate.requestMessage
            ? buildKbankGenerateAuditPaste({
                partnerTxnUid: String(
                  generate.partnerTransactionId || partnerTransactionIdSeed
                ),
                amount: qrAmount,
                requestedQrType,
                sentQrTypeCode: generate.sentQrTypeCode || undefined,
                bankQrTypeCode: generate.bankQrTypeCode,
                bankSof: generate.bankSof,
                requestMessage: generate.requestMessage,
                responseMessage: generate.responseMessage,
                storeCode: currentStoreId,
              })
            : ''
        )
        setKbankCallbackState('idle')
        setKbankOpsTxnUid('')
        setKbankOpsOrigTxnUid('')
        setKbankOpsTxnNo('')
        setCustomerDisplayPaymentMessage('')
        const rateLimited = isKbankRateLimitError(generate.message || generate.statusMessage)
        if (rateLimited) {
          noteKbankRateLimitResponse(generate.message || generate.statusMessage)
        }
        const msg =
          rateLimited
            ? 'KBank rate limit exceeded. Wait 2–5 minutes, then try Generate QR again (do not tap repeatedly).'
            : requestedQrType === 'CREDIT_CARD' &&
                isKbankCreditCardQrUnavailableError(generate.statusCode, generate.message)
              ? t('posKbankCreditCardQrNotRegisteredAlert') ||
                'This store is not registered for Credit Card QR with KBank. Use Thai QR, or ask KBank to enable Credit Card QR for the merchant.'
              : (t('posPaymentQr') || 'QR') + ' ' + (generate.message || 'generate_failed')
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }

      const partnerTransactionId = String(generate.partnerTransactionId || partnerTransactionIdSeed)
        .trim()
        .slice(0, 32)

      const data = (generate.data || {}) as Record<string, unknown>
      const generatedInfo = extractKbankGenerateResponseInfo(data)
      const generateTxnNoRaw = String(generatedInfo.txnNo || '').trim().slice(0, 20)
      setKbankOpsTxnUid(partnerTransactionId)
      setKbankOpsOrigTxnUid(partnerTransactionId)
      // Generate APIC* is QR session id — not for CC Inquiry; payment txnNo comes from callback/inquiry (e.g. 26440008).
      if (generateTxnNoRaw && isKbankPaymentTxnNo(generateTxnNoRaw)) {
        setKbankOpsTxnNo(generateTxnNoRaw)
      } else if (generateTxnNoRaw && isKbankQrSessionTxnNo(generateTxnNoRaw)) {
        setKbankOpsTxnNo('')
      } else if (generateTxnNoRaw) {
        setKbankOpsTxnNo(generateTxnNoRaw)
      } else {
        setKbankOpsTxnNo('')
      }
      setKbankCallbackState('waiting')
      const generatedQrPayload = String(generatedInfo.qrPayload || '').trim()
      const generatedCardBrands = resolveKbankCreditCardBrandLabels({
        sof: generatedInfo.sof,
        cardScheme: generatedInfo.cardScheme,
      })
      setKbankOpsCardBrands(generatedCardBrands)
      if (!generatedQrPayload) {
        setCustomerDisplayPaymentMessage('')
        const msg =
          (t('posPaymentQr') || 'QR') +
          ` response parse failed (${requestedQrType}): qrPayload/qrCode not found.`
        await appAlert(msg)
        return { ok: false as const, message: msg }
      }
      setLiveKbankQrPayload(generatedQrPayload)
      setLiveKbankQrAmount(qrAmount)
      const bankQrMeta = extractKbankQrResponseMeta(data)
      const qrTypeDetails = resolveKbankDisplayQrTypeDetails({
        qrType: String(generate.bankQrTypeCode || bankQrMeta.qrTypeCode || '').trim(),
        sof: generatedInfo.sof ?? generate.bankSof,
        requested: requestedQrType,
        emvPayload: generatedQrPayload,
      })
      setLiveKbankQrType(qrTypeDetails.displayType)
      setLiveKbankQrTypeSource(qrTypeDetails.source)
      setKbankSentQrTypeCode(String(generate.sentQrTypeCode || '').trim())
      setKbankGenerateAuditText(
        buildKbankGenerateAuditPaste({
          partnerTxnUid: partnerTransactionId,
          amount: qrAmount,
          requestedQrType: requestedQrType,
          sentQrTypeCode: generate.sentQrTypeCode || undefined,
          bankQrTypeCode: qrTypeDetails.bankQrTypeCode || generate.bankQrTypeCode,
          bankSof: qrTypeDetails.bankSof || generate.bankSof,
          requestMessage: generate.requestMessage,
          responseMessage: generate.responseMessage,
          storeCode: currentStoreId,
        })
      )
      if (requestedQrType === 'CREDIT_CARD') {
        if (qrTypeDetails.displayType === 'THAI_QR') {
          await appAlert(
            t('posKbankQrReturnedThaiAlert') ||
              'You selected Credit Card QR, but KBank returned Thai QR (PromptPay). Ask KBank to enable Credit Card QR for this merchant.'
          )
        } else if (qrTypeDetails.source === 'requested') {
          await appAlert(
            t('posKbankQrBankTypeUnknownAlert') ||
              'Credit Card QR was requested (qrType 4). KBank did not return qrType in the response. Please send the audit message below to KBank.'
          )
        }
      }
      void (async () => {
        const out = await pushKbankQrToLinkposDisplay({
          qrPayload: generatedQrPayload,
          amount: qrAmount,
          reference1: String(context?.orderType || '').slice(0, 20),
          reference2: String(context?.orderLabel || '').slice(0, 20),
        })
        if (preferEdcDisplay && !out.success && out.message !== 'linkpos_card_api_disabled') {
          await appAlert(
            t('posQrShowOnEdcFallback') ||
              'แสดงบนเครื่องไม่สำเร็จ — ใช้ QR บนจอแคชเชียร์ได้ครับ'
          )
        }
      })()
      setCustomerDisplayPaymentMessage(
        preferEdcDisplay
          ? t('posWaitingEdcQr') || 'กรุณาสแกน QR บนเครื่องรูดบัตรครับ'
          : (t('posPaymentQr') || 'QR') + ' ' + (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      let originalTransactionId = String(generatedInfo.originalTxnId || '').trim()
      let refId = String(generatedInfo.referenceId || '').trim()

      const finalizeKbankQrFailureWithManualOption = async (
        failureHint: string
      ): Promise<
        | { ok: true; partnerTransactionId: string; pending: true }
        | { ok: false; message: string }
      > => {
        const manualMsg =
          (t('posPaymentQr') || 'QR') +
          ' ' +
          failureHint +
          '. ' +
          (t('posProceedQuestion') || '수동 처리로 주문 저장을 계속할까요?')
        const proceed = await appConfirm(manualMsg)
        if (!proceed) {
          setLiveKbankQrPayload('')
          setLiveKbankQrType('THAI_QR')
          setKbankCallbackState('idle')
          setKbankOpsTxnUid('')
          setKbankOpsOrigTxnUid('')
          setKbankOpsTxnNo('')
          setCustomerDisplayPaymentMessage('')
          return { ok: false as const, message: failureHint }
        }
        setCustomerDisplayPaymentMessage(t('posPaymentQr') + ' ' + (t('posManual') || '수동 처리'))
        return { ok: true as const, partnerTransactionId, pending: true as const }
      }

      // Thai QR only: one optional inquiry after 10s (auto-poll handles later sync).
      // Credit Card QR skips this — CC needs numeric payment txnNo; silent auto-inquiry burns UAT quota
      // and can trigger rate-limit pause before staff tap Inquiry.
      if (requestedQrType !== 'CREDIT_CARD') {
        await sleepMs(10_000)
        if (kbankManualCancelPendingRef.current) {
          return { ok: false as const, message: 'kbank_qr_cancelled' }
        }
        if (!isKbankApiPaused()) {
          kbankInquiryLastAtRef.current = Date.now()
          const st = await executeKbankCheckStatus({
            storeCode: currentStoreId,
            orderId: context?.orderId,
            partnerTransactionId,
            originalTransactionId: partnerTransactionId,
            refId: refId || undefined,
            payload: {
              origPartnerTxnUid: partnerTransactionId,
              qrType: requestedQrType,
            },
          })
          const stData = (st.data || {}) as Record<string, unknown>
          const stTxnNo = extractKbankPaymentTxnNo(stData).slice(0, 20)
          if (stTxnNo) setKbankOpsTxnNo(stTxnNo)
          if (!st.success && noteKbankRateLimitResponse(st.statusMessage || st.message)) {
            /* stay pending; staff can Inquiry after backoff */
          } else if (st.success) {
            if (
              presentKbankApprovedFromInquiry(partnerTransactionId, st, 'success', {
                amount: qrAmount,
                paymentMethod: 'PromptPay QR',
              })
            ) {
              return { ok: true as const, partnerTransactionId }
            }
            const s = String(st.status || '').trim().toLowerCase()
            if (s === 'declined' || s === 'failed') {
              const txnStatusRaw = String(
                stData.txnStatus || stData.transactionStatus || stData.status || stData.paymentStatus || ''
              )
                .trim()
                .toUpperCase()
              const declineBlob = `${String(st.statusMessage || '')} ${String(st.message || '')} ${txnStatusRaw}`
                .trim()
                .toLowerCase()
              const treatedAsCancelled =
                kbankManualCancelPendingRef.current ||
                txnStatusRaw.includes('CANCEL') ||
                declineBlob.includes('cancel')
              if (treatedAsCancelled) {
                kbankManualCancelPendingRef.current = false
                setKbankCallbackState('failed')
                setCustomerDisplayPaymentMessage('')
                openKbankOutcomeModal(
                  {
                    kind: 'cancelled',
                    amount: qrAmount,
                    refId: partnerTransactionId,
                    paymentMethod: 'PromptPay QR',
                    timeLabel: formatPosDateTimeMedium(new Date(), lang),
                  },
                  `cancelled-by-inquiry:${partnerTransactionId}`
                )
                return { ok: false as const, message: 'kbank_qr_cancelled' }
              }
              setKbankCallbackState('failed')
              const failureHint =
                s === 'failed'
                  ? String(st.statusMessage || st.message || t('processFail') || '결제 실패').trim()
                  : t('posPaymentDeclined') || '결제가 거절되었습니다.'
              return finalizeKbankQrFailureWithManualOption(failureHint)
            }
          } else if (!st.success) {
            const failureHint = String(
              st.statusMessage || st.message || t('processFail') || 'kbank_check_status_failed'
            ).trim()
            if (!noteKbankRateLimitResponse(failureHint)) {
              return finalizeKbankQrFailureWithManualOption(failureHint)
            }
          }
          const inquiryMeta = extractKbankQrResponseMeta(stData)
          if (inquiryMeta.qrTypeCode || inquiryMeta.sof) {
            const inquiryDetails = resolveKbankDisplayQrTypeDetails({
              qrType: inquiryMeta.qrTypeCode,
              sof: inquiryMeta.sof,
              requested: requestedQrType,
              emvPayload: String(liveKbankQrPayload || '').trim(),
            })
            setLiveKbankQrType(inquiryDetails.displayType)
            setLiveKbankQrTypeSource(inquiryDetails.source)
          }
          if (!originalTransactionId) originalTransactionId = String(st.originalTransactionId || '').trim()
          if (!refId) refId = String(st.refId || '').trim()
        }
      }

      if (kbankManualCancelPendingRef.current) {
        return { ok: false as const, message: 'kbank_qr_cancelled' }
      }

      // Still pending after inquiry: keep QR visible and wait for callback / manual Inquiry.
      setCustomerDisplayPaymentMessage(
        (t('posPaymentQr') || 'QR') +
          ' ' +
          (t('posPending') || '대기') +
          ' — ' +
          (t('posScanToPayHint') || '스캔 후 결제해 주세요.')
      )
      return {
        ok: false as const,
        qrPending: true as const,
        message: 'kbank_qr_pending',
        partnerTransactionId,
        qrAmount,
        qrType: requestedQrType,
      }
    },
    [
      isPosDemo,
      isKbankPilotStore,
      currentStoreId,
      kbankOpsTerminalId,
      t,
      sleepMs,
      enforceKbankCooldown,
      openKbankOutcomeModal,
      presentKbankPaymentApproved,
      presentKbankApprovedFromInquiry,
      pushKbankQrToLinkposDisplay,
      isKbankApiPaused,
      noteKbankRateLimitResponse,
      alertIfKbankApiPaused,
      liveKbankQrPayload,
      liveKbankQrAmount,
      liveKbankQrType,
      kbankCallbackState,
      kbankOpsTxnUid,
      clearKbankQrSession,
      lang,
      dualMonitorEnabled,
    ]
  )

  const runKbankFollowupAction = useCallback(
    async (action: 'inquiry' | 'cancel' | 'void' | 'settlement') => {
      if (!currentStoreId) {
        await appAlert(t('posStoreRequired') || '매장 정보가 필요합니다.')
        return
      }
      const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
      if (!partnerTxnUid) {
        await appAlert(t('posKbankGenerateFirstAlert') || 'Please run QR Generate first.')
        return
      }
      const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
      const terminalId = String(kbankOpsTerminalId || '').trim()
      const txnNoRaw = String(kbankOpsTxnNo || '').trim()
      const txnAlreadyPaid =
        kbankCallbackState === 'received' ||
        kbankCallbackNotifiedTxRef.current === partnerTxnUid ||
        kbankCallbackNotifiedTxRef.current === origPartnerTxnUid
      if (txnAlreadyPaid && (action === 'void' || action === 'cancel' || action === 'inquiry')) {
        await appAlert(
          t('posKbankAlreadyPaidNoVoid') ||
            'This transaction is already paid. Void/Cancel/Inquiry is not needed — check order close and receipt.'
        )
        return
      }
      const inquiryTxnNo = resolveKbankInquiryTxnNoForRequest(txnNoRaw, {
        qrType: liveKbankQrType,
      })
      if (!(await alertIfKbankApiPaused(action))) return
      if (action === 'inquiry') {
        const canInquiry = await enforceKbankCooldown('inquiry', 30_000, 'Inquiry')
        if (!canInquiry) return
      } else {
        const canFollowup = await enforceKbankCooldown('followup', 5000, action)
        if (!canFollowup) return
      }
      setKbankOpsBusy(true)
      try {
        if (action === 'inquiry') {
          kbankInquiryLastAtRef.current = Date.now()
          const out = await executeKbankCheckStatus({
            storeCode: currentStoreId,
            partnerTransactionId: partnerTxnUid,
            originalTransactionId: origPartnerTxnUid || undefined,
            terminalId: terminalId || undefined,
            txnNo: inquiryTxnNo,
            payload: {
              ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
              ...(terminalId ? { terminalId } : {}),
              qrType: liveKbankQrType,
              ...(inquiryTxnNo ? { txnNo: inquiryTxnNo } : {}),
            },
          })
          if (out.success) {
            presentKbankApprovedFromInquiry(partnerTxnUid, out, 'inquiry', {
              paymentMethod:
                liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
            })
          } else {
            const errMsg = String(out.statusMessage || out.message || t('processFail') || 'Inquiry failed').trim()
            const rateLimited = noteKbankRateLimitResponse(errMsg)
            await appAlert(
              rateLimited
                ? String(t('posKbankRateLimitAlert') || errMsg)
                    .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                    .replace('{label}', 'Inquiry') || errMsg
                : errMsg
            )
          }
          setKbankOpsLastResult(`[INQUIRY] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'cancel') {
          const cancelPartnerTxnUid = `CCH${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankCancelQr({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: cancelPartnerTxnUid,
            terminalId: terminalId || undefined,
            payload: {
              partnerTxnUid: cancelPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
            },
          })
          if (out.success) {
            kbankManualCancelPendingRef.current = true
            purgeKbankPendingFinalize(origPartnerTxnUid || partnerTxnUid)
            clearKbankQrFromLinkpos()
            setKbankCallbackState('failed')
            openKbankOutcomeModal(
              {
                kind: 'cancelled',
                amount: Math.max(0, Number(liveKbankQrAmount || 0)),
                refId: origPartnerTxnUid || partnerTxnUid,
                paymentMethod: liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `cancel:${origPartnerTxnUid || partnerTxnUid}:${cancelPartnerTxnUid}`
            )
          }
          setKbankOpsLastResult(`[CANCEL] ${JSON.stringify(out)}`)
          return
        }
        if (action === 'void') {
          let voidTxnNo = resolveKbankVoidTxnNoForRequest(txnNoRaw) || ''
          if (!voidTxnNo) {
            kbankInquiryLastAtRef.current = Date.now()
            const inq = await executeKbankCheckStatus({
              storeCode: currentStoreId,
              partnerTransactionId: partnerTxnUid,
              originalTransactionId: origPartnerTxnUid,
              terminalId: terminalId || undefined,
              payload: {
                origPartnerTxnUid,
                qrType: liveKbankQrType,
                ...(terminalId ? { terminalId } : {}),
              },
            })
            if (inq.success) {
              const inqData = (inq.data || {}) as Record<string, unknown>
              voidTxnNo = extractKbankPaymentTxnNo(inqData).slice(0, 20)
              if (voidTxnNo) setKbankOpsTxnNo(voidTxnNo)
            }
            if (!voidTxnNo) {
              const inqErr = String(
                inq.statusMessage ||
                  inq.message ||
                  t('posKbankVoidInquiryFailed') ||
                  'Could not obtain txnNo from Inquiry. Check KBank response below.'
              ).trim()
              const rateLimited = noteKbankRateLimitResponse(inqErr)
              await appAlert(
                rateLimited
                  ? String(t('posKbankRateLimitAlert') || inqErr)
                      .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                      .replace('{label}', 'Inquiry') || inqErr
                  : inqErr
              )
              setKbankOpsLastResult(`[VOID-INQUIRY] ${JSON.stringify(inq)}`)
              return
            }
          }
          const voidPartnerTxnUid = `VOD${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
          const out = await executeKbankVoidPayment({
            storeCode: currentStoreId,
            origPartnerTxnUid,
            originalTransactionId: origPartnerTxnUid,
            partnerTxnUid: voidPartnerTxnUid,
            terminalId: terminalId || undefined,
            txnNo: voidTxnNo || undefined,
            payload: {
              partnerTxnUid: voidPartnerTxnUid,
              origPartnerTxnUid,
              ...(terminalId ? { terminalId } : {}),
              ...(voidTxnNo ? { txnNo: voidTxnNo } : {}),
            },
          })
          if (out.success) {
            const d = (out.data || {}) as Record<string, unknown>
            const nextTxnNo = extractKbankPaymentTxnNo(d).slice(0, 20) || voidTxnNo
            if (nextTxnNo) setKbankOpsTxnNo(nextTxnNo)
            purgeKbankPendingFinalize(origPartnerTxnUid || partnerTxnUid)
            clearKbankQrFromLinkpos()
            setKbankCallbackState('failed')
            openKbankOutcomeModal(
              {
                kind: 'voided',
                amount: Math.max(0, Number(liveKbankQrAmount || 0)),
                refId: origPartnerTxnUid || partnerTxnUid,
                paymentMethod: liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
                approvalCode: nextTxnNo || voidTxnNo || undefined,
                timeLabel: formatPosDateTimeMedium(new Date(), lang),
              },
              `void:${origPartnerTxnUid || partnerTxnUid}:${voidPartnerTxnUid}`
            )
          } else {
            const voidErr = String(
              out.statusMessage ||
                out.message ||
                t('posKbankVoidFailedAlert') ||
                'Void payment failed. Check KBank response in the panel below.'
            ).trim()
            const rateLimited = noteKbankRateLimitResponse(voidErr)
            await appAlert(
              rateLimited
                ? String(t('posKbankRateLimitAlert') || voidErr)
                    .replace('{minutes}', String(Math.ceil(KBANK_RATE_LIMIT_BACKOFF_MS / 60_000)))
                    .replace('{label}', 'Void') || voidErr
                : voidErr
            )
          }
          setKbankOpsLastResult(`[VOID] ${JSON.stringify(out)}`)
          return
        }
        if (liveKbankQrType === 'CREDIT_CARD') {
          await appAlert(
            t('posKbankSettlementThaiQrOnlyAlert') ||
              'Manual Settlement is not supported for Credit Card QR. Only Thai QR supports immediate settlement.'
          )
          return
        }
        if (!terminalId) {
          await appAlert(
            t('posKbankTerminalIdRequiredAlert') ||
              'terminalId is required for Settlement. Enter terminalId in the KBank panel or set KBANK_TERMINAL_ID.'
          )
          return
        }
        const settlementPartnerTxnUid = `STM${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32)
        const out = await executeKbankSettlement({
          storeCode: currentStoreId,
          partnerTxnUid: settlementPartnerTxnUid,
          terminalId,
          qrType: 'THAI_QR',
          payload: {
            partnerTxnUid: settlementPartnerTxnUid,
            terminalId,
            qrType: 'THAI_QR',
          },
        })
        setKbankOpsLastResult(`[SETTLEMENT] ${JSON.stringify(out)}`)
      } finally {
        setKbankOpsBusy(false)
      }
    },
    [
      currentStoreId,
      kbankOpsTxnUid,
      kbankOpsOrigTxnUid,
      kbankOpsTerminalId,
      kbankOpsTxnNo,
      liveKbankQrType,
      kbankCallbackState,
      t,
      enforceKbankCooldown,
      liveKbankQrAmount,
      openKbankOutcomeModal,
      presentKbankPaymentApproved,
      presentKbankApprovedFromInquiry,
      purgeKbankPendingFinalize,
      clearKbankQrFromLinkpos,
      alertIfKbankApiPaused,
      noteKbankRateLimitResponse,
      lang,
    ]
  )

  const applyKbankManualMemoTag = useCallback(
    (
      memo: string | null | undefined,
      result: { pending?: boolean; partnerTransactionId?: string } | { ok?: boolean }
    ) => {
      const base = String(memo ?? '').trim()
      const isManual = Boolean((result as { pending?: boolean }).pending)
      if (!isManual) return base
      const txnId = String((result as { partnerTransactionId?: string }).partnerTransactionId ?? '').trim()
      const tag = txnId ? `[KBANK_MANUAL:${txnId}]` : '[KBANK_MANUAL]'
      if (base.includes(tag)) return base
      if (base.includes('[KBANK_MANUAL')) return base
      return base ? `${base}\n${tag}` : tag
    },
    []
  )

  const posOrderMemoForPaymentSave = useCallback(
    (
      memo: string | null | undefined,
      splitReceipts: CartPanelSplitReceiptPayload[] | undefined,
      kbankResult: { pending?: boolean; partnerTransactionId?: string } | { ok?: boolean }
    ) =>
      upsertPosSplitReceiptsInMemo(
        applyKbankManualMemoTag(memo, kbankResult),
        normalizePosSplitReceiptSnapshots(splitReceipts)
      ),
    [applyKbankManualMemoTag]
  )

  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    const localTxId = String(kbankOpsTxnUid || '').trim()
    if (!localTxId) {
      setKbankCallbackState('idle')
      return
    }
    if (kbankCallbackState === 'idle') {
      setKbankCallbackState('waiting')
    }
    let cancelled = false
    const applyCallbackAttempt = async () => {
      const businessDate = getPosBusinessDateStr()
      const rows = await getPosPaymentAttempts({
        startStr: businessDate,
        endStr: businessDate,
        storeCode: currentStoreId,
        status: 'all',
        localTxId,
        limit: 1,
      })
      if (cancelled || !Array.isArray(rows) || rows.length === 0) return
      const hit = rows[0] as PosPaymentAttempt | undefined
      if (!hit) return
      const status = String(hit.status || '').trim().toLowerCase()
      const lowerText = String(hit.responseText || '').trim().toLowerCase()
      const txnNoFromTextMatch =
        lowerText.match(/(?:txnno|transactionno)\s*[:=]\s*(\d{6,16})/i) ||
        lowerText.match(/\btxnno\b.*?(\d{6,16})\b/i)
      const txnNoFromText = String(txnNoFromTextMatch?.[1] || '').trim()
      const tracePaymentTxnNo = String(hit.traceNo || '').trim()
      let paymentTxnNo = ''
      if (isKbankPaymentTxnNo(tracePaymentTxnNo)) {
        paymentTxnNo = tracePaymentTxnNo
      } else if (isKbankPaymentTxnNo(txnNoFromText)) {
        paymentTxnNo = txnNoFromText
      }
      if (paymentTxnNo && !resolveKbankInquiryTxnNoForRequest(kbankOpsTxnNo, { qrType: liveKbankQrType })) {
        setKbankOpsTxnNo(paymentTxnNo.slice(0, 20))
      }
      if (isKbankPaymentAttemptApproved(hit)) {
        setKbankOpsLastResult(
          `[CALLBACK] ${JSON.stringify({
            localTxId,
            status: hit.status,
            responseCode: hit.responseCode,
            responseText: hit.responseText,
            traceNo: hit.traceNo,
            createdAt: hit.createdAt,
          })}`
        )
        const methodFromText = lowerText.includes('credit') || lowerText.includes('card')
        presentKbankPaymentApproved({
          refId: localTxId,
          amount: Math.max(0, Number(hit.approvedAmount || hit.requestAmount || liveKbankQrAmount || 0)),
          paymentMethod:
            liveKbankQrType === 'CREDIT_CARD' || methodFromText
              ? 'Credit Card QR'
              : 'PromptPay QR',
          approvalCode:
            String(hit.approvalCode || paymentTxnNo || kbankOpsTxnNo || '').trim() || undefined,
          timeLabel: formatPosDateTimeMedium(hit.createdAt ? new Date(hit.createdAt) : new Date(), lang),
          dedupeKey: `callback:${localTxId}:${hit.createdAt || ''}:${hit.responseCode || ''}`,
        })
        return
      }
      if (status === 'declined' || status === 'failed' || status === 'timeout' || status === 'error') {
        setKbankCallbackState('failed')
      }
    }
    void applyCallbackAttempt().catch(() => {})
    const callbackPollMs = liveKbankQrType === 'CREDIT_CARD' ? 5_000 : 8_000
    const timerId = window.setInterval(() => {
      void applyCallbackAttempt().catch(() => {})
    }, callbackPollMs)
    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    kbankOpsTxnUid,
    kbankOpsTxnNo,
    kbankCallbackState,
    liveKbankQrAmount,
    liveKbankQrType,
    kbankOpsCardBrands,
    presentKbankPaymentApproved,
    lang,
  ])

  /** Callback 미수신 시 KBank Inquiry로 승인 상태 동기화 (은행 결제 완료·POS 대기 불일치 완화). */
  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
    if (!partnerTxnUid || kbankCallbackState !== 'waiting') return

    let cancelled = false
    const pollApprovedViaInquiry = async () => {
      if (cancelled || kbankCallbackNotifiedTxRef.current === partnerTxnUid) return
      if (isKbankApiPaused()) return
      const inquiryCooldownMs = liveKbankQrType === 'CREDIT_CARD' ? 20_000 : 60_000
      if (Date.now() - kbankInquiryLastAtRef.current < inquiryCooldownMs) return

      kbankInquiryLastAtRef.current = Date.now()
      const terminalId = String(kbankOpsTerminalId || '').trim()
      const pollInquiryTxnNo = resolveKbankInquiryTxnNoForRequest(String(kbankOpsTxnNo || '').trim(), {
        qrType: liveKbankQrType,
      })
      try {
        const st = await executeKbankCheckStatus({
          storeCode: currentStoreId,
          partnerTransactionId: partnerTxnUid,
          originalTransactionId: origPartnerTxnUid || undefined,
          terminalId: terminalId || undefined,
          txnNo: pollInquiryTxnNo,
          payload: {
            ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
            ...(terminalId ? { terminalId } : {}),
            qrType: liveKbankQrType,
            ...(pollInquiryTxnNo ? { txnNo: pollInquiryTxnNo } : {}),
          },
        })
        if (cancelled) return
        if (!st.success) {
          noteKbankRateLimitResponse(st.statusMessage || st.message)
          return
        }
        presentKbankApprovedFromInquiry(partnerTxnUid, st, 'auto-inquiry', {
          paymentMethod:
            liveKbankQrType === 'CREDIT_CARD' ? 'Credit Card QR' : 'PromptPay QR',
        })
      } catch {
        /* noop */
      }
    }

    // CC: 콜백·txnNo 즉시 Inquiry가 먼저이고, 여기는 보조 폴백(쿼터 고려해 Thai보다 짧게만).
    const pollFirstDelayMs = liveKbankQrType === 'CREDIT_CARD' ? 12_000 : 60_000
    const pollIntervalMs = liveKbankQrType === 'CREDIT_CARD' ? 45_000 : 120_000
    const firstDelayMs = window.setTimeout(() => {
      void pollApprovedViaInquiry()
    }, pollFirstDelayMs)
    const intervalId = window.setInterval(() => {
      void pollApprovedViaInquiry()
    }, pollIntervalMs)

    return () => {
      cancelled = true
      window.clearTimeout(firstDelayMs)
      window.clearInterval(intervalId)
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    kbankOpsTxnUid,
    kbankOpsOrigTxnUid,
    kbankOpsTerminalId,
    kbankOpsTxnNo,
    kbankCallbackState,
    presentKbankPaymentApproved,
    presentKbankApprovedFromInquiry,
    isKbankApiPaused,
    noteKbankRateLimitResponse,
    liveKbankQrType,
  ])

  /** Credit Card QR: txnNo(숫자) 수신 즉시 Inquiry → 승인 팝업 (콜백 지연 대비). */
  useEffect(() => {
    if (!isKbankPilotStore || !currentStoreId) return
    if (liveKbankQrType !== 'CREDIT_CARD') return
    if (kbankCallbackState !== 'waiting') return
    const partnerTxnUid = String(kbankOpsTxnUid || '').trim()
    if (!partnerTxnUid || kbankCallbackNotifiedTxRef.current === partnerTxnUid) return
    const inquiryTxnNo = resolveKbankInquiryTxnNoForRequest(kbankOpsTxnNo, {
      qrType: 'CREDIT_CARD',
    })
    if (!inquiryTxnNo) return
    const triggerKey = `${partnerTxnUid}:${inquiryTxnNo}`
    if (kbankCcInquiryTriggeredRef.current === triggerKey) return
    if (isKbankApiPaused()) return
    kbankCcInquiryTriggeredRef.current = triggerKey

    let cancelled = false
    void (async () => {
      if (Date.now() - kbankInquiryLastAtRef.current < 3_000) return
      kbankInquiryLastAtRef.current = Date.now()
      const origPartnerTxnUid = kbankOrigPartnerTxnUidForFollowup(partnerTxnUid)
      const terminalId = String(kbankOpsTerminalId || '').trim()
      try {
        const st = await executeKbankCheckStatus({
          storeCode: currentStoreId,
          partnerTransactionId: partnerTxnUid,
          originalTransactionId: origPartnerTxnUid || undefined,
          terminalId: terminalId || undefined,
          txnNo: inquiryTxnNo,
          payload: {
            ...(origPartnerTxnUid ? { origPartnerTxnUid } : {}),
            ...(terminalId ? { terminalId } : {}),
            qrType: 'CREDIT_CARD',
            txnNo: inquiryTxnNo,
          },
        })
        if (cancelled) return
        if (!st.success) {
          noteKbankRateLimitResponse(st.statusMessage || st.message)
          return
        }
        const shown = presentKbankApprovedFromInquiry(partnerTxnUid, st, 'cc-txn-inquiry', {
          paymentMethod: 'Credit Card QR',
        })
        if (!shown) kbankCcInquiryTriggeredRef.current = ''
      } catch {
        kbankCcInquiryTriggeredRef.current = ''
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    isKbankPilotStore,
    currentStoreId,
    liveKbankQrType,
    kbankCallbackState,
    kbankOpsTxnUid,
    kbankOpsTxnNo,
    kbankOpsTerminalId,
    presentKbankApprovedFromInquiry,
    isKbankApiPaused,
    noteKbankRateLimitResponse,
  ])

  const applyTaxInvoiceProfile = useCallback((profile: PosTaxInvoiceData) => {
    setTiCustomerType(profile.customerType === 'company' ? 'company' : 'person')
    setTiMemberNo(String(profile.memberNo || '').trim())
    setTiName(String(profile.name || '').trim())
    setTiTaxId(String(profile.taxId || '').replace(/\D/g, '').slice(0, 13))
    setTiBranchNo(String(profile.branchNo || '').replace(/\D/g, '').slice(0, 5))
    setTiPhone(String(profile.phone || '').replace(/\D/g, '').slice(0, 10))
    setTiEmail(String(profile.email || '').trim())
    setTiAddress(String(profile.address || '').trim())
  }, [])

  const openTaxInvoiceEditorForOrder = useCallback((order: Order | null | undefined) => {
    if (!order) return
    const parsed = parsePosOrderMemo(order.memo)
    setTaxInvoiceTargetOrder(order)
    setTaxSearchField('taxId')
    setTaxSearchKeyword('')
    setTaxSearchRows([])
    setTaxSearchMessage('')
    if (parsed.taxInvoice) {
      applyTaxInvoiceProfile(parsed.taxInvoice)
      return
    }
    setTiCustomerType('person')
    setTiMemberNo('')
    setTiName('')
    setTiTaxId('')
    setTiBranchNo('')
    setTiPhone('')
    setTiEmail('')
    setTiAddress('')
  }, [applyTaxInvoiceProfile])

  const normalizedTiTaxId = tiTaxId.replace(/\D/g, '').slice(0, 13)
  const normalizedTiBranchNo = tiBranchNo.replace(/\D/g, '').slice(0, 5)
  const normalizedTiPhone = tiPhone.replace(/\D/g, '').slice(0, 10)
  const normalizedTiEmail = tiEmail.trim()
  const normalizedTiAddress = tiAddress.trim()
  const normalizedTiName = tiName.trim()
  const normalizedTiMemberNo = tiMemberNo.trim()
  const taxBranchRequired = tiCustomerType === 'company'
  const effectiveTiBranchNo = taxBranchRequired ? normalizedTiBranchNo : (normalizedTiBranchNo || '00000')
  const taxEmailValid =
    normalizedTiEmail.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedTiEmail)
  const taxFormErrors: string[] = []
  if (!normalizedTiName) taxFormErrors.push('name')
  if (normalizedTiTaxId.length !== 13) taxFormErrors.push('taxId')
  if (taxBranchRequired && effectiveTiBranchNo.length !== 5) taxFormErrors.push('branch')
  if (!taxBranchRequired && normalizedTiBranchNo && normalizedTiBranchNo.length !== 5) taxFormErrors.push('branch')
  if (normalizedTiPhone.length < 9 || normalizedTiPhone.length > 10) taxFormErrors.push('phone')
  if (!normalizedTiAddress) taxFormErrors.push('address')
  if (!taxEmailValid) taxFormErrors.push('email')

  const handleTaxRecipientSearch = async () => {
    if (!auth?.store || !auth?.role) {
      await appAlert(t('posReceiptPayCorrectUnauthorized') || '권한 정보가 없습니다.')
      return
    }
    const keyword = taxSearchKeyword.trim()
    if (!keyword) {
      setTaxSearchMessage(t('posTaxSearchNeedKeyword') || '검색어를 입력해 주세요.')
      return
    }
    const qForApi =
      taxSearchField === 'taxId' || taxSearchField === 'phone'
        ? keyword.replace(/\D/g, '')
        : keyword
    if (!qForApi) {
      setTaxSearchMessage(t('posTaxSearchNeedKeyword') || '검색어를 입력해 주세요.')
      return
    }
    setTaxSearchLoading(true)
    setTaxSearchMessage('')
    try {
      const res = await getPosTaxInvoiceRecipients({
        userStore: auth.store,
        userRole: auth.role,
        storeCode: currentStoreId || undefined,
        q: qForApi,
        by: taxSearchField,
        limit: 20,
      })
      if (!res.success) {
        setTaxSearchRows([])
        setTaxSearchMessage(String(res.message || t('itemsNoResults') || '검색 결과가 없습니다.'))
        return
      }
      const rows = Array.isArray(res.rows) ? res.rows.filter((r) => r.is_active) : []
      setTaxSearchRows(rows)
      if (rows.length === 0) {
        setTaxSearchMessage(t('posTaxSearchNoSavedProfile') || '저장된 수취인 정보가 없습니다.')
      }
    } catch (e) {
      setTaxSearchRows([])
      setTaxSearchMessage(String(e || 'search_failed'))
    } finally {
      setTaxSearchLoading(false)
    }
  }

  const buildPosOrderItemsForUpdate = (order: Order) =>
    order.items.map((it) => ({
      id: String(it.id || ''),
      name: String(it.name || ''),
      price: Number(it.price || 0),
      qty: Math.max(1, Number(it.quantity || 1)),
      ...(it.note?.trim() ? { note: it.note.trim() } : {}),
      ...(it.menuId ? { menuId1: String(it.menuId) } : {}),
      ...(it.optionId ? { optionId1: String(it.optionId) } : {}),
      ...(it.optionCode ? { optionCode1: String(it.optionCode) } : {}),
      ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
    }))

  const handleSaveTaxInvoiceForOrder = async () => {
    if (!taxInvoiceTargetOrder) return
    if (!(await ensureBusinessOpenForOrder())) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    if (taxFormErrors.length > 0) {
      await appAlert(t('posTaxInvoiceInvalid') || '세금계산서 정보를 확인해 주세요.')
      return
    }
    const taxInvoicePayload: PosTaxInvoiceData = {
      memberNo: normalizedTiMemberNo,
      customerType: tiCustomerType,
      name: normalizedTiName,
      taxId: normalizedTiTaxId,
      branchNo: effectiveTiBranchNo,
      phone: normalizedTiPhone,
      email: normalizedTiEmail,
      address: normalizedTiAddress,
      member: Boolean(normalizedTiMemberNo),
    }
    const nextMemo = upsertPosOrderTaxInvoiceMemo(taxInvoiceTargetOrder.memo, taxInvoicePayload)
    const orderId = Number(taxInvoiceTargetOrder.id)
    if (!Number.isFinite(orderId) || orderId <= 0 || !taxInvoiceTargetOrder.items?.length) {
      await appAlert(t('posPrintUnavailable'))
      return
    }
    setTaxInvoiceSaving(true)
    try {
      const res = await updatePosOrder({
        id: orderId,
        terminalStoreCode: currentStoreId,
        items: buildPosOrderItemsForUpdate(taxInvoiceTargetOrder),
        tableName: String(taxInvoiceTargetOrder.tableName || ''),
        memo: nextMemo,
        discountAmt: Number(taxInvoiceTargetOrder.discountAmt || 0),
        discountReason: String(taxInvoiceTargetOrder.discountReason || ''),
        paymentCash: Number(taxInvoiceTargetOrder.paymentCash || 0),
        paymentCard: Number(taxInvoiceTargetOrder.paymentCard || 0),
        paymentQr: Number(taxInvoiceTargetOrder.paymentQr || 0),
        paymentOther: Number(taxInvoiceTargetOrder.paymentOther || 0),
        paymentDeliveryApp: Number(taxInvoiceTargetOrder.paymentDeliveryApp || 0),
        deliveryPaymentChannel:
          Number(taxInvoiceTargetOrder.paymentDeliveryApp || 0) > 0.005
            ? String(taxInvoiceTargetOrder.deliveryPaymentChannel || 'grab')
            : null,
        memberId: Number(taxInvoiceTargetOrder.memberId || 0),
        memberNo: String(taxInvoiceTargetOrder.memberNo || ''),
        ...posOrderCouponFieldsFromOrderRow(taxInvoiceTargetOrder),
        pointUsed: Number(taxInvoiceTargetOrder.pointUsed || 0),
        pointEarned: Number(taxInvoiceTargetOrder.pointEarned || 0),
        guestCount: Number(taxInvoiceTargetOrder.guestCount || 0),
      })
      if (!res.success) {
        await appAlert(
          translateApiMessage(String(res.message || ''), t) || t('processFail') || '실패'
        )
        return
      }
      /** 결제 후 세금 정보 저장 시: 결제(세금계산서) 영수증 재인쇄 — 홀 주문표는 매장·VAT·결제 수단이 빠짐 */
      const orderPaymentRecorded =
        taxInvoiceTargetOrder.status === 'paid' ||
        taxInvoiceTargetOrder.status === 'completed' ||
        orderPaymentsSum(taxInvoiceTargetOrder) > 0.005
      if (isMainPosDevice && orderPaymentRecorded) {
        const settings = await getPrinterSettingsForStore(currentStoreId)
        const receiptBase = receiptModalDataFromTerminalOrderTaxReprint(
          taxInvoiceTargetOrder,
          currentStoreId,
          nextMemo,
          pricingAdjustments,
          posReceiptLineOpts
        )
        const receiptData = {
          ...receiptBase,
          items: enrichReceiptModalItemsForPromoDisplay(receiptBase.items, {
            ...posReceiptLineOpts,
            memo: receiptBase.memo,
            deliveryAppCode: receiptBase.deliveryAppCode,
          }),
        }
        const receiptHtml = await buildPosPaymentReceiptDocumentHtmlAsync({
          receiptData,
          menus,
          optionNameByCode,
          orderTypeLabels: {
            dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
            takeout: tPrint('posOrderTypeTakeout') ?? '포장',
            delivery: tPrint('posOrderTypeDelivery') ?? '배달',
          },
          t: tPrint,
          lang: printLang,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          printedAt: new Date(),
          printerSettings: settings,
          forceSimpleTextMode: shouldForceSimplePaymentReceiptForStore(currentStoreId),
        })
        printPosHtmlDocument(receiptHtml, {
          title: tPrint('posReceipt') || '영수증',
          printDelayMs: 0,
          fallbackCleanupMs: 120_000,
          focusIframeBeforePrint: false,
          printRole: 'receipt',
          printReceiptKind: 'payment',
          escPosCutOverride: resolveEscPosCutOverride(settings, {
            printRole: 'receipt',
            printReceiptKind: 'payment',
          }),
          onPrintUnavailable: () => {
            void appAlert(t('posPrintUnavailable'))
          },
        })
      }
      if (auth?.store && auth?.role) {
        await upsertPosTaxInvoiceRecipient({
          userStore: auth.store,
          userRole: auth.role,
          storeCode: currentStoreId,
          memberNo: normalizedTiMemberNo || null,
          customerType: tiCustomerType,
          name: normalizedTiName,
          taxId: normalizedTiTaxId,
          branchNo: effectiveTiBranchNo,
          phone: normalizedTiPhone,
          email: normalizedTiEmail,
          address: normalizedTiAddress,
          source: orderPaymentRecorded ? 'terminal_after_payment' : 'terminal_pre_payment',
        })
      }
      await appAlert(t('msg_saved'))
      setTaxInvoiceTargetOrder(null)
      setTaxSearchRows([])
      setTaxSearchMessage('')
      await refetchCurrentStore()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTaxInvoiceSaving(false)
    }
  }

  const deliveryApps = deliveryAppsFromApi
    .filter((a) => a.enabled)
    .map((a) => ({ id: a.code, name: a.name }))
  const deliveryAppsFallback = deliveryApps.length === 0 ? [
    { id: 'grab', name: 'Grab' },
    { id: 'lineman', name: 'Line Man' },
    { id: 'shopee', name: 'Shopee' },
  ] : []
  const effectiveDeliveryApps = deliveryApps.length > 0 ? deliveryApps : deliveryAppsFallback
  const grabDeliveryHintVisible = String(deliveryApp ?? '').trim().toLowerCase() === 'grab'
  const cartOrderType = activeTab === 'delivery' ? 'delivery' : activeTab === 'takeout' ? 'takeout' : 'dine-in'
  const formatTakeoutSlotLabel = (slot: string) => {
    const rawTemplate = String(t('posTakeoutSlotN') ?? '').trim()
    const template =
      rawTemplate && rawTemplate !== 'posTakeoutSlotN' && !/^pos[A-Z]/.test(rawTemplate)
        ? rawTemplate
        : '포장 {{n}}'
    return template.replace('{{n}}', slot)
  }
  const baseTakeoutLabel = takeoutMode === 'member'
    ? (takeoutMemberName.trim() || (t('posTakeoutMemberName') || '회원 이름'))
    : formatTakeoutSlotLabel(takeoutSlot)
  const takeoutLabel = translateTakeoutOrderDisplayLabel(
    selectedTakeoutTargetLabel || baseTakeoutLabel,
    t
  )
  const buildTerminalCartSessionKeyForTab = useCallback(
    (tab: 'tables' | 'delivery' | 'takeout') => {
      const orderType = tab === 'delivery' ? 'delivery' : tab === 'takeout' ? 'takeout' : 'dine-in'
      return getPosCartSessionKey({
        currentStoreId,
        orderType,
        selectedTableId: selectedTableId ?? '',
        deliveryApp: orderType === 'delivery' ? deliveryApp : null,
        deliveryOrderNo: orderType === 'delivery' ? deliveryOrderNo : null,
        takeoutLabel:
          orderType === 'takeout' || orderType === 'delivery'
            ? translateTakeoutOrderDisplayLabel(selectedTakeoutTargetLabel || baseTakeoutLabel, t)
            : null,
      })
    },
    [
      currentStoreId,
      selectedTableId,
      deliveryApp,
      deliveryOrderNo,
      selectedTakeoutTargetLabel,
      baseTakeoutLabel,
      t,
    ]
  )
  const resolveTakeoutOrderBarLabel = (order: Order) => {
    const memberTable = resolveMemberPortalTakeoutTableDisplay({
      tableName: order.tableName,
      memo: order.memo,
      memberId: order.memberId,
      memberNo: order.memberNo,
      labelText: { memberPortalOrder: t('posMemberPortalOrder') || '회원주문' },
    })
    const raw =
      memberTable ||
      String(order.customerName ?? '').trim() ||
      String(order.tableName ?? '').trim()
    return translateTakeoutOrderDisplayLabel(raw, t, { fallbackOrderId: order.id })
  }

  const buildTakeoutBarItemFields = (order: Order) => {
    const label = resolveTakeoutOrderBarLabel(order)
    const meta = resolveMemberPortalTakeoutMeta({
      memo: order.memo,
      memberId: order.memberId,
      memberNo: order.memberNo,
      tableName: order.tableName,
    })
    if (!meta.isMemberPortal) {
      return { label, subLabel: undefined as string | undefined, rightLabel: label }
    }
    const memberLabel =
      buildMemberPortalTakeoutDisplayLabel(meta, {
        memberPortalOrder: t('posMemberPortalOrder') || '회원주문',
      }) || label
    const timeSubLabel = buildMemberPortalTakeoutBarSubLabel({
      createdAt: order.createdAt,
      pickupAtRaw: meta.pickupAtRaw,
      lang,
      orderTimeLabel: t('posOrderTimeShort') || '주문',
      pickupTimeLabel: t('posPickupAtShort') || '픽업',
    })
    return {
      label: memberLabel,
      subLabel: timeSubLabel || undefined,
      rightLabel: `#${order.id}`,
    }
  }

  const takeoutMergePeerTables = useMemo((): Table[] => {
    const takeoutFallback = t('posOrderTypeTakeout') || 'Takeout'
    const rows = [...takeoutOrders, ...packagedTakeoutOrders]
    return rows
      .filter((o) => {
        if (o.status === 'paid' || o.status === 'cancelled' || o.status === 'completed') return false
        if (!o.items?.length) return false
        if (orderPaymentsSum(o) > 0.005) return false
        return true
      })
      .map((o) => {
        const nameRaw =
          String(o.tableName ?? '').trim() ||
          String(o.customerName ?? '').trim() ||
          `${takeoutFallback} #${o.id}`
        return {
          id: `merge-takeout-${o.id}`,
          name: translateTakeoutOrderDisplayLabel(nameRaw, t, { fallbackOrderId: o.id }),
          seats: 0,
          x: 0,
          y: 0,
          width: 80,
          height: 60,
          shape: 'square' as const,
          rotation: 0,
          isOccupied: true,
          order: o,
        }
      })
  }, [takeoutOrders, packagedTakeoutOrders, t])

  const findOpenUnpaidTakeoutForLabel = useCallback(
    (draftLabel: string): Order | null => {
      const label = String(draftLabel ?? '').trim()
      if (!label) return null
      const draftSlotNo = extractTakeoutSlotNumberFromLabel(label)
      const candidates = [...takeoutOrders, ...packagedTakeoutOrders]
      for (const o of candidates) {
        if (o.type !== 'takeout') continue
        const st = String(o.status ?? '').trim().toLowerCase()
        if (st === 'paid' || st === 'completed' || st === 'cancelled' || st === 'canceled' || st === 'refunded') {
          continue
        }
        if (orderPaymentsSum(o) > 0.005) continue
        if (!o.items?.length) continue
        const orderLabel = String(o.tableName ?? o.customerName ?? '').trim()
        if (!orderLabel) continue
        if (takeoutMode === 'member') {
          const memberWant = takeoutMemberName.trim()
          if (memberWant && orderLabel.localeCompare(memberWant, undefined, { sensitivity: 'accent' }) === 0) {
            return o
          }
          continue
        }
        if (draftSlotNo) {
          const orderSlotNo = extractTakeoutSlotNumberFromLabel(orderLabel)
          if (orderSlotNo && orderSlotNo === draftSlotNo) return o
        }
        if (orderLabel.localeCompare(label, undefined, { sensitivity: 'accent' }) === 0) return o
      }
      return null
    },
    [takeoutOrders, packagedTakeoutOrders, takeoutMode, takeoutMemberName]
  )

  const openTakeoutDraftWithLabel = useCallback(
    (label: string) => {
      const trimmed = String(label ?? '').trim()
      if (!trimmed) return
      const cacheKey = getPosCartSessionKey({
        currentStoreId,
        orderType: 'takeout',
        selectedTableId: '',
        deliveryApp: null,
        deliveryOrderNo: null,
        takeoutLabel: translateTakeoutOrderDisplayLabel(trimmed, t),
      })
      replacePosCartItemsCache(cacheKey, [])
      clearCartFromTerminal()
      setPendingTakeoutOrderId(null)
      setPendingReceiptOrderNo(null)
      setSelectedTakeoutTargetId('takeout-draft')
      setSelectedTakeoutTargetLabel(trimmed)
    },
    [currentStoreId, t, clearCartFromTerminal]
  )

  const enterTakeoutAddOrderMode = useCallback(
    (order: Order) => {
      const oid = Number(order.id)
      if (!Number.isFinite(oid) || oid <= 0) return
      clearCartFromTerminal()
      setPendingTakeoutOrderId(oid)
      setPendingReceiptOrderNo(order.orderNo ?? null)
      setSelectedTakeoutTargetLabel(resolveTakeoutOrderBarLabel(order))
      setSelectedTakeoutTargetId('takeout-draft')
    },
    [clearCartFromTerminal, resolveTakeoutOrderBarLabel]
  )

  const requestTakeoutFreshDraft = useCallback(
    async (label: string) => {
      const trimmed = String(label ?? '').trim()
      if (!trimmed) return
      const existing = findOpenUnpaidTakeoutForLabel(trimmed)
      if (existing) {
        const existingLabel = resolveTakeoutOrderBarLabel(existing)
        const msg = (t('posTakeoutOpenBillExistsBody') || '{{label}}에 미결제 주문이 있습니다.')
          .replace(/\{\{label\}\}/g, existingLabel)
        const openNewBill = await appConfirm(msg)
        if (!openNewBill) {
          enterTakeoutAddOrderMode(existing)
          return
        }
      }
      openTakeoutDraftWithLabel(trimmed)
    },
    [findOpenUnpaidTakeoutForLabel, resolveTakeoutOrderBarLabel, enterTakeoutAddOrderMode, openTakeoutDraftWithLabel, t]
  )

  const takeoutFreshHandledRef = useRef(false)
  const takeoutFreshParam = searchParams.get('takeoutFresh')
  useEffect(() => {
    if (takeoutFreshParam !== '1' || orderType !== 'takeout') return
    if (takeoutFreshHandledRef.current) return
    takeoutFreshHandledRef.current = true
    const label =
      takeoutMode === 'member' && takeoutMemberName.trim()
        ? takeoutMemberName.trim()
        : formatTakeoutSlotLabel(takeoutSlot)
    void (async () => {
      await requestTakeoutFreshDraft(label)
      try {
        const params = new URLSearchParams(window.location.search)
        params.delete('takeoutFresh')
        const qs = params.toString()
        router.replace(qs ? `/pos/terminal?${qs}` : '/pos/terminal?type=takeout', { scroll: false })
      } catch {
        // ignore URL cleanup errors
      }
    })()
  }, [
    takeoutFreshParam,
    orderType,
    takeoutMode,
    takeoutMemberName,
    takeoutSlot,
    requestTakeoutFreshDraft,
    router,
  ])

  const filteredTakeoutMembers = takeoutMemberName.trim()
    ? takeoutMemberNames.filter((name) => name.toLowerCase().includes(takeoutMemberName.trim().toLowerCase())).slice(0, 6)
    : takeoutMemberNames.slice(0, 6)

  const getOrderVisual = (order: {
    status?: string
    createdAt?: Date | string
    items?: { id?: string; name?: string; servedAt?: string | null }[]
  }) => {
    const items = Array.isArray(order.items) ? order.items : []
    const servedCount = items.filter((item) => Boolean(item.servedAt)).length
    const normalizedStatus = String(order.status || '').toLowerCase()
    const createdAt = order.createdAt
      ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt))
      : undefined
    /** POS `pending`은 플랫폼·수동 주문의 미수락 상태 — 목록에서 조리중과 구분 */
    if (normalizedStatus === 'pending') {
      return { status: 'pending' as const, createdAt, targetMin: 0 }
    }
    const allServed = items.length > 0 && servedCount >= items.length
    const status: 'preparing' | 'partial_served' | 'packaged' | 'completed' =
      normalizedStatus === 'completed'
        ? 'completed'
        : normalizedStatus === 'ready' && allServed
          ? 'packaged'
          : servedCount > 0
            ? 'partial_served'
            : 'preparing'
    const getItemTarget = (item: { id?: string; name?: string }) => {
      const rawId = String(item.id || '').trim()
      const rawName = String(item.name || '').trim()
      const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
      const idKey = normalizedId.split('-')[0]
      if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
      const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
      if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
      return 0
    }
    const targetMin = status === 'preparing'
      ? Math.max(0, ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') })))
      : 0
    return { status, createdAt, targetMin }
  }

  const detectDeliveryApp = (text: string): PosDeliveryApp | null => {
    const raw = text.toLowerCase()
    for (const app of deliveryAppsFromApi) {
      const keywords = app.matchKeywords || []
      if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) return app
    }
    if (deliveryAppsFromApi.length === 0) {
      if (raw.includes('grab') || raw.includes('그랩')) return { id: 0, code: 'grab', name: 'Grab', matchKeywords: ['grab'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'lime', storeCode: null }
      if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) return { id: 0, code: 'lineman', name: 'Line Man', matchKeywords: ['lineman'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'sky', storeCode: null }
      if (raw.includes('shopee') || raw.includes('쇼피')) return { id: 0, code: 'shopee', name: 'Shopee', matchKeywords: ['shopee'], displayOrder: 0, enabled: true, dineOutEnabled: true, accentColor: 'amber', storeCode: null }
    }
    return null
  }

  const detectDeliveryOrderNo = (text: string): string => {
    const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/)
    if (hashMatch?.[1]) return hashMatch[1]
    const bracketMatch = text.match(/\(([^)]+)\)/)
    if (bracketMatch?.[1]) return bracketMatch[1].trim()
    return ''
  }

  const mapPosAccentToBar = (accent: string | null | undefined): NonNullable<OrderBarItem['deliveryAppAccent']> => {
    const raw = String(accent || '').trim().toLowerCase()
    if (raw === 'grab' || raw === 'lime') return 'lime'
    if (raw === 'lineman' || raw === 'sky') return 'sky'
    if (raw === 'shopee' || raw === 'amber') return 'amber'
    if (raw === 'slate') return 'slate'
    return 'slate'
  }

  const resolveMatchedDeliveryAppForOrder = (order: Order): PosDeliveryApp | null => {
    const storedCode = String(order.deliveryAppCode ?? '').trim().toLowerCase()
    if (storedCode) {
      for (const app of deliveryAppsFromApi) {
        const c = String(app.code || '').trim().toLowerCase()
        if (c && c === storedCode) return app
      }
    }
    const tableName = String(order.tableName || '').trim()
    const memo = String(order.memo || '').trim()
    const label = String(order.customerName || '').trim()
    const orderNoRaw = String(order.orderNo || '').trim()
    const probeText = [label, memo, orderNoRaw, tableName].filter(Boolean).join(' \n ')
    const byKeyword = detectDeliveryApp(probeText)
    if (byKeyword) return byKeyword

    const platformName = getPosDeliveryPlatformName(
      { tableName, orderNo: orderNoRaw, memo },
      deliveryAppsFromApi
    ).trim()
    if (!platformName) return null
    const want = platformName.toLowerCase()
    for (const app of deliveryAppsFromApi) {
      const n = String(app.name || '').trim().toLowerCase()
      if (n && n === want) return app
      const c = String(app.code || '').trim().toLowerCase()
      if (c && c === want) return app
    }
    return null
  }

  const cookElapsedBarFields = (
    order: Order,
    barStatus: OrderBarStatus
  ): Pick<OrderBarItem, 'elapsedEndAt'> => {
    const elapsedEndAt = resolveOrderBarCookElapsedEndAt(order, barStatus)
    return elapsedEndAt ? { elapsedEndAt } : {}
  }

  const buildDeliveryBarFields = (
    order: Order
  ): Pick<OrderBarItem, 'deliveryAppAccent' | 'deliveryAppName' | 'posOrderNo' | 'platformOrderNo' | 'rightLabel'> => {
    const tableName = String(order.tableName || '').trim()
    const memo = String(order.memo || '').trim()
    const orderNoRaw = String(order.orderNo || '').trim()
    const pick = pickPosChannelOrderNo({ tableName, orderNo: orderNoRaw, memo })
    const orderNoDisp = orderNoRaw ? formatPosOrderNoForPrint(orderNoRaw) : ''
    const platformOrderNo =
      pick.kind === 'hash' || pick.kind === 'memo_anchor'
        ? (pick.text.trim() ? `#${pick.text.trim()}` : '')
        : ''

    const matched = resolveMatchedDeliveryAppForOrder(order)
    const platformFromKeywords = getPosDeliveryPlatformName({ tableName, orderNo: orderNoRaw, memo }, deliveryAppsFromApi).trim()
    const platformFromStoredCode = (() => {
      const c = String(order.deliveryAppCode ?? '').trim().toLowerCase()
      if (!c) return ''
      if (c === 'grab') return 'Grab'
      if (c === 'lineman' || c === 'line_man') return 'Line Man'
      if (c === 'shopee') return 'Shopee'
      return ''
    })()
    const platformLabel = (matched?.name || platformFromKeywords || platformFromStoredCode).trim()
    const accentRaw = matched?.accentColor || null
    const accent = mapPosAccentToBar(accentRaw || (platformLabel.toLowerCase().includes('grab') ? 'lime' : platformLabel.toLowerCase().includes('line') ? 'sky' : platformLabel.toLowerCase().includes('shopee') ? 'amber' : 'slate'))

    const customer =
      formatGrabDeliveryTableDisplayName(tableName, memo) ||
      String(order.customerName || '').trim()
    return {
      deliveryAppAccent: accent,
      deliveryAppName: platformLabel || undefined,
      ...(orderNoDisp ? { posOrderNo: orderNoDisp } : {}),
      ...(platformOrderNo ? { platformOrderNo } : {}),
      ...(customer ? { rightLabel: customer } : {}),
    }
  }

  const deliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...deliveryOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const visual = getOrderVisual(order)
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel:
          visual.status === 'pending'
            ? t('posOrderBarPendingAccept') || '수락 대기'
            : t('posOrderStatusPreparing') || '진행 중',
        ...bar,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const packagedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedDeliveryOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: t('posDeliveryPackagingComplete') || '포장 완료',
        ...bar,
      } satisfies OrderBarItem
    })
  }, [packagedDeliveryOrders, t, deliveryAppsFromApi])

  const completedDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...completedDeliveryOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: formatPosOrderNoForPrint(order.orderNo || ''),
        ...cookElapsedBarFields(order, 'completed'),
        ...bar,
      } satisfies OrderBarItem
    })
  }, [completedDeliveryOrders, t, deliveryAppsFromApi])

  const allDeliveryBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...deliveryOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedDeliveryOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedDeliveryOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    const listTypeRank = (lt: 'in_progress' | 'packaged' | 'completed') =>
      lt === 'completed' ? 3 : lt === 'packaged' ? 2 : 1
    const byId = new Map<string, Tagged>()
    for (const row of merged) {
      const oid = String(row.id || '').trim()
      if (!oid) continue
      const lt = (row as Tagged)._listType || 'in_progress'
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, row)
        continue
      }
      const prevLt = (prev as Tagged)._listType || 'in_progress'
      if (listTypeRank(lt) > listTypeRank(prevLt)) {
        byId.set(oid, row)
        continue
      }
      if (listTypeRank(lt) === listTypeRank(prevLt)) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(row.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, row)
      }
    }
    const filtered = Array.from(byId.values())
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const label = String(order.customerName || '').trim() || `${t('posOrderTypeDelivery') || '배달'} #${order.id}`
      const listType = (order as Tagged)._listType
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      const bar = buildDeliveryBarFields(order)
      return {
        id: `delivery-order-${order.id}`,
        label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel:
          listType === 'completed'
            ? formatPosOrderNoForPrint(order.orderNo || '')
            : listType === 'packaged'
              ? t('posDeliveryPackagingComplete') || '포장 완료'
              : visual.status === 'pending'
                ? t('posOrderBarPendingAccept') || '수락 대기'
                : t('posOrderStatusPreparing') || '진행 중',
        ...(barStatus === 'completed' ? cookElapsedBarFields(order, 'completed') : {}),
        ...bar,
      } satisfies OrderBarItem
    })
  }, [deliveryOrders, packagedDeliveryOrders, completedDeliveryOrders, menuTargets, t, deliveryAppsFromApi])

  const inProgressOrPackagedDeliveryBarItems = useMemo(() => {
    const merged = [...deliveryBarItems, ...packagedDeliveryBarItems]
    const statusRank = (st: OrderBarItem['status']) => {
      if (st === 'packaged') return 4
      if (st === 'completed') return 3
      if (st === 'partial_served') return 2
      if (st === 'preparing') return 1
      if (st === 'pending') return 0
      return 0
    }
    const byId = new Map<string, OrderBarItem>()
    for (const it of merged) {
      const m = /^delivery-order-(.+)$/.exec(String(it.id || '').trim())
      const oid = (m?.[1] || '').trim()
      if (!oid) continue
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, it)
        continue
      }
      const a = statusRank(it.status)
      const b = statusRank(prev.status)
      if (a > b) {
        byId.set(oid, it)
        continue
      }
      if (a === b) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(it.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, it)
      }
    }
    const deduped = Array.from(byId.values())
    deduped.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return deduped
  }, [deliveryBarItems, packagedDeliveryBarItems])
  const currentDeliveryBarItems = deliveryListMode === 'all' ? allDeliveryBarItems : deliveryListMode === 'completed' ? completedDeliveryBarItems : inProgressOrPackagedDeliveryBarItems

  const takeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const orders = [...takeoutOrders]
    orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return orders.map((order) => {
      const barFields = buildTakeoutBarItemFields(order)
      const visual = getOrderVisual(order)
      return {
        id: `takeout-order-${order.id}`,
        label: barFields.label,
        status: visual.status,
        createdAt: visual.createdAt,
        targetMin: visual.targetMin,
        subLabel:
          barFields.subLabel ||
          (visual.status === 'pending'
            ? t('posOrderBarPendingAccept') || '수락 대기'
            : t('posOrderStatusPreparing') || '진행 중'),
        rightLabel: barFields.rightLabel,
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, menuTargets, t, lang])

  const packagedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...packagedTakeoutOrders]
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const barFields = buildTakeoutBarItemFields(order)
      return {
        id: `takeout-order-${order.id}`,
        label: barFields.label,
        status: 'packaged' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: barFields.subLabel || t('posDeliveryPackagingComplete') || '포장 완료',
        rightLabel: barFields.rightLabel,
      } satisfies OrderBarItem
    })
  }, [packagedTakeoutOrders, t, lang])

  const completedTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    const filtered = [...completedTakeoutOrders]
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return filtered.map((order) => {
      const barFields = buildTakeoutBarItemFields(order)
      return {
        id: `takeout-order-${order.id}`,
        label: barFields.label,
        status: 'completed' as const,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: 0,
        subLabel: barFields.subLabel || formatPosOrderNoForPrint(order.orderNo || ''),
        rightLabel: barFields.rightLabel,
        ...cookElapsedBarFields(order, 'completed'),
      } satisfies OrderBarItem
    })
  }, [completedTakeoutOrders, t, lang])

  const allTakeoutBarItems = useMemo<OrderBarItem[]>(() => {
    type Tagged = Order & { _listType?: 'in_progress' | 'packaged' | 'completed' }
    const merged: Tagged[] = [
      ...takeoutOrders.map((o) => ({ ...o, _listType: 'in_progress' as const })),
      ...packagedTakeoutOrders.map((o) => ({ ...o, _listType: 'packaged' as const })),
      ...completedTakeoutOrders.map((o) => ({ ...o, _listType: 'completed' as const })),
    ]
    const listTypeRank = (lt: 'in_progress' | 'packaged' | 'completed') =>
      lt === 'completed' ? 3 : lt === 'packaged' ? 2 : 1
    const byId = new Map<string, Tagged>()
    for (const row of merged) {
      const oid = String(row.id || '').trim()
      if (!oid) continue
      const lt = (row as Tagged)._listType || 'in_progress'
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, row)
        continue
      }
      const prevLt = (prev as Tagged)._listType || 'in_progress'
      if (listTypeRank(lt) > listTypeRank(prevLt)) {
        byId.set(oid, row)
        continue
      }
      if (listTypeRank(lt) === listTypeRank(prevLt)) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(row.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, row)
      }
    }
    const filtered = Array.from(byId.values())
    filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return filtered.map((order) => {
      const barFields = buildTakeoutBarItemFields(order)
      const listType = (order as Tagged)._listType
      const visual = getOrderVisual(order)
      const barStatus = listType === 'completed' ? 'completed' as const : listType === 'packaged' ? 'packaged' as const : visual.status
      return {
        id: `takeout-order-${order.id}`,
        label: barFields.label,
        status: barStatus,
        createdAt: order.createdAt ? (order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt)) : undefined,
        targetMin: listType === 'in_progress' ? visual.targetMin : 0,
        subLabel:
          barFields.subLabel ||
          (listType === 'completed'
            ? formatPosOrderNoForPrint(order.orderNo || '')
            : listType === 'packaged'
              ? t('posDeliveryPackagingComplete') || '포장 완료'
              : visual.status === 'pending'
                ? t('posOrderBarPendingAccept') || '수락 대기'
                : t('posOrderStatusPreparing') || '진행 중'),
        rightLabel: barFields.rightLabel,
        ...(barStatus === 'completed' ? cookElapsedBarFields(order, 'completed') : {}),
      } satisfies OrderBarItem
    })
  }, [takeoutOrders, packagedTakeoutOrders, completedTakeoutOrders, menuTargets, t, lang])

  const inProgressOrPackagedTakeoutBarItems = useMemo(() => {
    const merged = [...takeoutBarItems, ...packagedTakeoutBarItems]
    const statusRank = (st: OrderBarItem['status']) => {
      if (st === 'packaged') return 4
      if (st === 'completed') return 3
      if (st === 'partial_served') return 2
      if (st === 'preparing') return 1
      if (st === 'pending') return 0
      return 0
    }
    const byId = new Map<string, OrderBarItem>()
    for (const it of merged) {
      const m = /^takeout-order-(.+)$/.exec(String(it.id || '').trim())
      const oid = (m?.[1] || '').trim()
      if (!oid) continue
      const prev = byId.get(oid)
      if (!prev) {
        byId.set(oid, it)
        continue
      }
      const a = statusRank(it.status)
      const b = statusRank(prev.status)
      if (a > b) {
        byId.set(oid, it)
        continue
      }
      if (a === b) {
        const prevTime = new Date(prev.createdAt || 0).getTime()
        const nextTime = new Date(it.createdAt || 0).getTime()
        if (nextTime >= prevTime) byId.set(oid, it)
      }
    }
    const deduped = Array.from(byId.values())
    deduped.sort((a, b) => (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime()))
    return deduped
  }, [takeoutBarItems, packagedTakeoutBarItems])
  const memberPortalTakeoutBarItems = useMemo(() => {
    return allTakeoutBarItems.filter((item) => {
      const m = /^takeout-order-(.+)$/.exec(String(item.id || '').trim())
      const oid = m?.[1] || ''
      if (!oid) return false
      const order =
        takeoutOrders.find((o) => String(o.id) === oid) ||
        packagedTakeoutOrders.find((o) => String(o.id) === oid) ||
        completedTakeoutOrders.find((o) => String(o.id) === oid)
      if (!order) return false
      return resolveMemberPortalTakeoutMeta({
        memo: order.memo,
        memberId: order.memberId,
        memberNo: order.memberNo,
        tableName: order.tableName,
      }).isMemberPortal
    })
  }, [allTakeoutBarItems, takeoutOrders, packagedTakeoutOrders, completedTakeoutOrders])

  const currentTakeoutBarItems =
    takeoutListMode === 'member_portal'
      ? memberPortalTakeoutBarItems
      : takeoutListMode === 'all'
        ? allTakeoutBarItems
        : takeoutListMode === 'completed'
          ? completedTakeoutBarItems
          : inProgressOrPackagedTakeoutBarItems

  const handleTableSelect = (tableId: string) => {
    /** 서빙 모드(selectedTableId=null)에서 다른 테이블로 바꿀 때도 cart·pending 초기화 */
    const prevContextTableId = selectedTableId ?? servingTableId
    if (prevContextTableId !== tableId) {
      clearCartFromTerminal()
      setPendingDineInOrderId(null)
      pendingDineInOrderTableRef.current = ''
    }
    const table = currentStore?.tables.find((t) => t.id === tableId)
    const order = demoDineInOrder?.tableId === tableId ? demoDineInOrder.order : table?.order
    if (order) {
      setSelectedTableId(null)
      setServingTableId(tableId)
      return
    }
    setServingTableId(null)
    setSelectedTableId(tableId)
  }
  const handleAddItemToCart = useCallback((item: CartPanelAddItemPayload) => {
    if (!isPosDemo && businessOpenBlocked) {
      void appAlert(
        t('posBusinessOpenRequiredBody') ||
          '오늘 POS를 시작하려면 먼저 영업 관리 > 영업 시작에서 돈통 시제를 입력·저장해 주세요.'
      )
      return
    }
    // CartPanel ref가 있으면 addItem으로 위임 (패널 내부 setCartItems = setTerminalCartLines)
    if (cartRef.current?.addItem) {
      cartRef.current.addItem(item)
    } else {
      // 패널 마운트 전/전환 중이면 state 직접 갱신
      setTerminalCartLines((prev) => mergeCartPanelAddItem(prev, item))
    }
  }, [businessOpenBlocked, isPosDemo, t])

  const renderTerminalCartPanel = (
    debugOwner: 'inline-mobile' | 'side-panel' | 'inline-delivery' | 'inline-takeout'
  ) => (
            <CartPanel
              debugOwner={debugOwner}
              onImperativeBridge={bindCartImperative}
              cartItems={terminalCartLines}
              setCartItems={setTerminalCartLines}
              posMenus={menus}
              stores={stores}
            currentStoreId={currentStoreId}
            selectedTable={selectedTable}
            dineInMultiFloorLayout={dineInMultiFloorLayout}
            onStoreChange={() => {}}
            t={t}
            onSplitCashPaymentStep={handleSplitCashPaymentStep}
            onPaymentModalOpenChange={(open) => {
              setTourPaymentModalOpen(open)
              if (open) {
                splitCashDrawerStepsRef.current = 0
                setTourPaymentCompletedCount(0)
              } else {
                setTourPaymentTab('cash')
                setTourTaxInvoiceEnabled(false)
              }
            }}
            onPaymentTabChange={setTourPaymentTab}
            onTaxInvoiceToggleChange={setTourTaxInvoiceEnabled}
            onPaymentComplete={() => setTourPaymentCompletedCount((v) => v + 1)}
            onPostPaymentCashChange={setPostPaymentCashChangeBaht}
            onGuestCountChange={setTourCartGuestCount}
            requireGuestCount={requireGuestCount}
            posDineInDemoDefaultGuestCount={undefined}
            lockOrderType
            orderType={cartOrderType}
            onBackToTableSelection={
              activeTab === 'tables' && selectedTableId ? () => setSelectedTableId(null) : undefined
            }
            deliveryApp={deliveryApp ?? undefined}
            deliveryAppName={effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name}
            deliveryOrderNo={deliveryOrderNo}
            takeoutLabel={takeoutLabel}
            pricingAdjustments={pricingAdjustments}
            pendingOrderId={activeTab === 'tables' ? pendingDineInOrderId : activeTab === 'takeout' ? pendingTakeoutOrderId : activeTab === 'delivery' ? pendingDeliveryOrderId : null}
            posBackendActionInFlight={posCartBackendBusy}
            onCustomerDisplayPaymentDraftChange={setCustomerDisplayPaymentDraft}
            onDeliveryOrderComplete={async (payload, existingOrderId) => {
              if (posCartBackendBusyRef.current) {
                await alertPaymentBackendBusy()
                return false
              }
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingDeliveryOrderId(null)
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return true
                }
                if (!(await ensureBusinessOpenForOrder())) return false
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const cartItemsForSave = cartLinesToPosOrderItems(payloadItemsNormalized)
                let itemsForPaymentSave = cartItemsForSave
                let memoWithKbank = upsertPosSplitReceiptsInMemo(
                  String(payload.memo ?? ''),
                  normalizePosSplitReceiptSnapshots(payload.splitReceipts)
                )
                let kbankQrPending = false
                let kbankPartnerTxnId = ''
                if (existingOrderId != null && payload.payment != null) {
                  itemsForPaymentSave = await mergePaymentItemsPreferLocal(existingOrderId, cartItemsForSave)
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return false
                  const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                    orderType: 'delivery',
                    orderLabel: payload.orderLabel,
                    orderId: existingOrderId,
                  })
                  kbankQrPending = !kbankQr.ok && (kbankQr as { qrPending?: boolean }).qrPending === true
                  if (!kbankQr.ok && !kbankQrPending) return false
                  kbankPartnerTxnId = String(
                    (kbankQr as { partnerTransactionId?: string }).partnerTransactionId || ''
                  ).trim()
                  memoWithKbank = posOrderMemoForPaymentSave(payload.memo, payload.splitReceipts, kbankQr)
                  const updateRes = await updatePosOrder({
                    id: existingOrderId,
                    terminalStoreCode: currentStoreId,
                    items: itemsForPaymentSave,
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                    pointUsed: payload.pointUsed,
                    ...posOrderPaymentFieldsFromSnapshot(payload.payment),
                    linkposPayment: linkpos.linkposPayment,
                    ...(isOmniPaymentFastPath ? { skipPostPaymentSideEffects: true } : {}),
                    pricingAdjustments,
                  })
                  if (!updateRes.success) {
                    await appAlert(
                      localizeApiMessage(updateRes.message, t, t('msg_save_fail') || '저장 실패', lang)
                    )
                    return false
                  }
                  capturePaymentReceiptMember(updateRes, {
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    memberTierCode: payload.memberTierCode,
                  })
                  if (!kbankQrPending) {
                    const completedOk = await applyPaidStatusAfterPaymentSave({
                      id: existingOrderId,
                      status: 'paid',
                    })
                    if (!completedOk) {
                      clearPaymentReceiptMember()
                      return false
                    }
                  }
                }
                const finalizeDeliveryPaid = async (): Promise<boolean> => {
                  if (kbankQrPending && existingOrderId != null) {
                    const completedOk = await applyPaidStatusAfterPaymentSave({
                      id: existingOrderId,
                      status: 'paid',
                    })
                    if (!completedOk) return false
                  }
                  void tryOpenDrawerOnOrderComplete(payload.payment, {
                    skipAutoOpen: Boolean(payload.splitReceipts?.length),
                  })
                  const receiptPayload = buildCheckoutPaymentReceiptModalData({
                    orderNo: pendingReceiptOrderNo ?? '',
                    storeCode: currentStoreId,
                    orderType: 'delivery',
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    items: itemsForPaymentSave,
                    discountAmt: payload.discountAmt,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    discountReason: payload.discountReason,
                    appliedCoupons: payload.appliedCoupons,
                    cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment),
                    paymentSum: payload.payment
                      ? posOrderPaymentSum({
                          paymentCash: payload.payment.paymentCash,
                          paymentCard: payload.payment.paymentCard,
                          paymentQr: payload.payment.paymentQr,
                          paymentOther: payload.payment.paymentOther,
                          paymentDeliveryApp: payload.payment.paymentDeliveryApp,
                        } as PosOrder)
                      : 0,
                    adjustments: pricingAdjustments,
                    paymentFields: payload.payment
                      ? receiptPaymentFieldsFromSnapshot(payload.payment)
                      : undefined,
                    deliveryAppCode: String(deliveryApp ?? '').trim()
                      ? String(deliveryApp).trim().toLowerCase()
                      : undefined,
                    suppressReceiptModalAutoPrint: !isMainPosDevice,
                    serverOrderId: existingOrderId,
                  })
                  const splitBatch = makeSplitPaymentReceiptBatch(
                    {
                      orderNo: receiptPayload.orderNo,
                      storeCode: receiptPayload.storeCode,
                      orderType: receiptPayload.orderType,
                      tableName: receiptPayload.tableName,
                      memo: receiptPayload.memo,
                      discountReason: receiptPayload.discountReason,
                      vatFeeMode: receiptPayload.vatFeeMode,
                    },
                    payload.splitReceipts,
                    !isMainPosDevice,
                    existingOrderId
                  )
                  dispatchCheckoutPaymentReceipt({
                    receiptPayload,
                    splitBatch,
                    orderId: existingOrderId,
                  })
                  setPendingReceiptOrderNo(null)
                  setPendingDeliveryOrderId(null)
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                  /** 결제 버튼 잠금(backendBusy) 해제를 우선하기 위해 재조회는 백그라운드 처리 */
                  void refetchCurrentStore()
                  if (payload.payment != null) schedulePostPaymentCustomerQr()
                  return true
                }
                if (kbankQrPending && kbankPartnerTxnId) {
                  registerPendingKbankFinalize(kbankPartnerTxnId, () => {
                    void finalizeDeliveryPaid()
                  })
                  void refetchCurrentStore()
                  return true
                }
                return await finalizeDeliveryPaid()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
                await appAlert(tr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
                return false
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onTakeoutOrderComplete={async (payload, existingOrderId) => {
              if (posCartBackendBusyRef.current) {
                await alertPaymentBackendBusy()
                return false
              }
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingTakeoutOrderId(null)
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return true
                }
                if (!(await ensureBusinessOpenForOrder())) return false
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const cartItemsForSave = cartLinesToPosOrderItems(payloadItemsNormalized)
                let itemsForPaymentSave = cartItemsForSave
                let memoWithKbank = upsertPosSplitReceiptsInMemo(
                  String(payload.memo ?? ''),
                  normalizePosSplitReceiptSnapshots(payload.splitReceipts)
                )
                let kbankQrPending = false
                let kbankPartnerTxnId = ''
                if (existingOrderId != null && payload.payment != null) {
                  itemsForPaymentSave = await mergePaymentItemsPreferLocal(existingOrderId, cartItemsForSave)
                  const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                  if (!linkpos.ok) return false
                  const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                    orderType: 'takeout',
                    orderLabel: payload.orderLabel,
                    orderId: existingOrderId,
                  })
                  kbankQrPending = !kbankQr.ok && (kbankQr as { qrPending?: boolean }).qrPending === true
                  if (!kbankQr.ok && !kbankQrPending) return false
                  kbankPartnerTxnId = String(
                    (kbankQr as { partnerTransactionId?: string }).partnerTransactionId || ''
                  ).trim()
                  memoWithKbank = posOrderMemoForPaymentSave(payload.memo, payload.splitReceipts, kbankQr)
                  const updateRes = await updatePosOrder({
                    id: existingOrderId,
                    terminalStoreCode: currentStoreId,
                    items: itemsForPaymentSave,
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                    pointUsed: payload.pointUsed,
                    ...posOrderPaymentFieldsFromSnapshot(payload.payment),
                    linkposPayment: linkpos.linkposPayment,
                    ...(isOmniPaymentFastPath ? { skipPostPaymentSideEffects: true } : {}),
                    pricingAdjustments,
                  })
                  if (!updateRes.success) {
                    await appAlert(
                      localizeApiMessage(updateRes.message, t, t('msg_save_fail') || '저장 실패', lang)
                    )
                    return false
                  }
                  capturePaymentReceiptMember(updateRes, {
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    memberTierCode: payload.memberTierCode,
                  })
                  if (!kbankQrPending) {
                    const completedOk = await applyPaidStatusAfterPaymentSave({
                      id: existingOrderId,
                      status: 'paid',
                    })
                    if (!completedOk) {
                      clearPaymentReceiptMember()
                      return false
                    }
                  }
                }
                const finalizeTakeoutPaid = async (): Promise<boolean> => {
                  if (kbankQrPending && existingOrderId != null) {
                    const completedOk = await applyPaidStatusAfterPaymentSave({
                      id: existingOrderId,
                      status: 'paid',
                    })
                    if (!completedOk) return false
                  }
                  void tryOpenDrawerOnOrderComplete(payload.payment, {
                    skipAutoOpen: Boolean(payload.splitReceipts?.length),
                  })
                  const receiptPayload = buildCheckoutPaymentReceiptModalData({
                    orderNo: pendingReceiptOrderNo ?? '',
                    storeCode: currentStoreId,
                    orderType: 'takeout',
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    items: itemsForPaymentSave,
                    discountAmt: payload.discountAmt,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    discountReason: payload.discountReason,
                    appliedCoupons: payload.appliedCoupons,
                    cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment),
                    paymentSum: payload.payment
                      ? posOrderPaymentSum({
                          paymentCash: payload.payment.paymentCash,
                          paymentCard: payload.payment.paymentCard,
                          paymentQr: payload.payment.paymentQr,
                          paymentOther: payload.payment.paymentOther,
                          paymentDeliveryApp: payload.payment.paymentDeliveryApp,
                        } as PosOrder)
                      : 0,
                    adjustments: pricingAdjustments,
                    paymentFields: payload.payment
                      ? receiptPaymentFieldsFromSnapshot(payload.payment)
                      : undefined,
                    suppressReceiptModalAutoPrint: !isMainPosDevice,
                    serverOrderId: existingOrderId,
                  })
                  const splitBatch = makeSplitPaymentReceiptBatch(
                    {
                      orderNo: receiptPayload.orderNo,
                      storeCode: receiptPayload.storeCode,
                      orderType: receiptPayload.orderType,
                      tableName: receiptPayload.tableName,
                      memo: receiptPayload.memo,
                      discountReason: receiptPayload.discountReason,
                      vatFeeMode: receiptPayload.vatFeeMode,
                    },
                    payload.splitReceipts,
                    !isMainPosDevice,
                    existingOrderId
                  )
                  dispatchCheckoutPaymentReceipt({
                    receiptPayload,
                    splitBatch,
                    orderId: existingOrderId,
                  })
                  setPendingReceiptOrderNo(null)
                  setPendingTakeoutOrderId(null)
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                  /** 결제 버튼 잠금(backendBusy) 해제를 우선하기 위해 재조회는 백그라운드 처리 */
                  void refetchCurrentStore()
                  if (payload.payment != null) schedulePostPaymentCustomerQr()
                  return true
                }
                if (kbankQrPending && kbankPartnerTxnId) {
                  registerPendingKbankFinalize(kbankPartnerTxnId, () => {
                    void finalizeTakeoutPaid()
                  })
                  void refetchCurrentStore()
                  return true
                }
                return await finalizeTakeoutPaid()
              } catch (e) {
                console.error('updatePosOrder/updatePosOrderStatus:', e)
                await appAlert(tr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
                return false
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onOrderSubmit={async (payload) => {
              if (posCartBackendBusyRef.current) return
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              /** `await getPosOrders` 등으로 한참 뒤에 맞추면 카트가 비거나 바뀐 뒤라 수량이 엇갈릴 수 있음 → 제출 직후 스냅샷 */
              const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
              let existingOrder = selectedTable?.order ?? null
              const explicitExistingOrderId = Number((payload as { existingOrderId?: unknown }).existingOrderId ?? 0)
              let existingOrderId =
                Number.isFinite(explicitExistingOrderId) && explicitExistingOrderId > 0
                  ? explicitExistingOrderId
                  : Number(existingOrder?.id ?? 0)
              const pendingExistingOrderId = Number(pendingDineInOrderId ?? 0)
              const payloadTableKey = posDineInTableMatchKey(
                payload.tableName,
                getTableFloor(selectedTableId ?? servingTableId)
              )
              const pendingTableKey = posDineInTableMatchKey(
                pendingDineInOrderTableRef.current,
                getTableFloor(selectedTableId ?? servingTableId)
              )
              if (
                Number.isFinite(pendingExistingOrderId) &&
                pendingExistingOrderId > 0 &&
                pendingTableKey &&
                payloadTableKey &&
                pendingTableKey !== payloadTableKey
              ) {
                logPosPrintDebug('submit_block_dine_in_pending_table_mismatch', {
                  pendingExistingOrderId,
                  pendingTableKey,
                  payloadTableKey,
                  payloadTableName: payload.tableName,
                })
                await appAlert(
                  t('posDineInPendingTableMismatch') ||
                    '다른 테이블 주문과 연결된 상태입니다. 테이블을 다시 선택한 뒤 추가 주문해 주세요.'
                )
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
                return
              }
              if (
                !(Number.isFinite(existingOrderId) && existingOrderId > 0) &&
                Number.isFinite(pendingExistingOrderId) &&
                pendingExistingOrderId > 0 &&
                payloadTableKey &&
                pendingTableKey &&
                pendingTableKey === payloadTableKey
              ) {
                const recentPending = pendingDineInOrderSavedAtRef.current
                const isRecentPendingMatch =
                  recentPending.orderId === pendingExistingOrderId &&
                  recentPending.tableKey === pendingTableKey &&
                  Date.now() - recentPending.atMs <= 2 * 60 * 1000
                if (isRecentPendingMatch) {
                  existingOrderId = pendingExistingOrderId
                } else {
                  logPosPrintDebug('submit_skip_stale_pending_dine_in_fallback', {
                    pendingExistingOrderId,
                    payloadTableKey,
                    pendingTableKey,
                    recentPendingOrderId: recentPending.orderId,
                    recentPendingTableKey: recentPending.tableKey,
                    recentPendingAgeMs:
                      recentPending.atMs > 0 ? Date.now() - recentPending.atMs : null,
                  })
                }
              }
              const isOpenForDineInAddStatus = (raw: unknown): boolean => {
                const s = String(raw ?? '').trim().toLowerCase()
                if (!s) return false
                if (isPosOrderPaidLikeStatus(s)) return false
                if (s === 'completed' || s === 'cancelled' || s === 'canceled' || s === 'refunded') return false
                return true
              }
              const isEligibleExistingDineInOrder = (
                row: { id?: unknown; tableName?: unknown; orderType?: unknown; status?: unknown; items?: unknown[] } | null | undefined
              ): boolean => {
                const oid = Number(row?.id ?? 0)
                if (!(Number.isFinite(oid) && oid > 0)) return false
                const rt = String(row?.orderType ?? 'dine_in').trim().toLowerCase()
                if (rt && rt !== 'dine_in') return false
                const rowItems = Array.isArray(row?.items) ? row.items : []
                if (rowItems.length === 0) return false
                if (!isOpenForDineInAddStatus(row?.status)) return false
                if (!payloadTableKey) return true
                const rowTableKey = posDineInTableMatchKey(
                  String(row?.tableName ?? ''),
                  getTableFloor(selectedTableId ?? servingTableId)
                )
                return Boolean(rowTableKey && rowTableKey === payloadTableKey)
              }
              if (!isEligibleExistingDineInOrder(existingOrder as unknown as {
                id?: unknown
                tableName?: unknown
                orderType?: unknown
                status?: unknown
                items?: unknown[]
              })) {
                existingOrder = null
                existingOrderId = 0
              }
              if ((existingOrder == null || Number(existingOrder.id ?? 0) !== existingOrderId) && Number.isFinite(existingOrderId) && existingOrderId > 0) {
                try {
                  const rows = await getPosOrders({
                    orderId: existingOrderId,
                    storeCode: currentStoreId,
                    limit: 1,
                  })
                  const hit = Array.isArray(rows) ? rows[0] : null
                  if (hit) {
                    const mappedItems: OrderItem[] = (hit.items || []).map((it, idx) => ({
                      id: String(it.id ?? `line-${idx}`),
                      name: String(it.name ?? ''),
                      quantity: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
                      price: Number(it.price ?? 0) || 0,
                      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
                      ...(String(it.menuId1 ?? (it as { menu_id1?: string }).menu_id1 ?? '').trim()
                        ? {
                            menuId: String(it.menuId1 ?? (it as { menu_id1?: string }).menu_id1 ?? '').trim(),
                          }
                        : {}),
                      ...(String(it.promoId ?? '').trim() ? { promoId: String(it.promoId).trim() } : {}),
                      ...(String(it.promoCode ?? '').trim() ? { promoCode: String(it.promoCode).trim() } : {}),
                      ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
                      ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
                      ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
                      ...(String(it.cancelledAt ?? '').trim() ? { cancelledAt: String(it.cancelledAt) } : {}),
                      ...(String(it.cancelledBy ?? '').trim() ? { cancelledBy: String(it.cancelledBy) } : {}),
                      ...(String(it.cancelReason ?? '').trim() ? { cancelReason: String(it.cancelReason) } : {}),
                    }))
                    existingOrder = {
                      id: String(hit.id ?? existingOrderId),
                      type: 'dine-in',
                      items: mappedItems,
                      total: Number(hit.total ?? 0) || 0,
                      status: (() => {
                        const s = String(hit.status ?? '').trim().toLowerCase()
                        if (s === 'pending' || s === 'preparing' || s === 'ready' || s === 'paid' || s === 'completed' || s === 'cancelled') {
                          return s
                        }
                        return 'pending'
                      })(),
                      createdAt: new Date(hit.createdAt || Date.now()),
                      tableName: String(hit.tableName ?? payload.tableName ?? ''),
                      orderNo: String(hit.orderNo ?? '').trim() || undefined,
                      guestCount: Math.max(0, Math.trunc(Number(hit.guestCount ?? 0) || 0)),
                    }
                    if (!isEligibleExistingDineInOrder({
                      id: hit.id,
                      tableName: hit.tableName,
                      orderType: hit.orderType,
                      status: hit.status,
                      items: hit.items as unknown[],
                    })) {
                      existingOrder = null
                      existingOrderId = 0
                    }
                  }
                } catch (e) {
                  console.warn('lookup existing dine-in order failed:', e)
                }
              }
              const isAddOrder = existingOrder != null && Number.isFinite(existingOrderId) && existingOrderId > 0
              if (isAddOrder && existingOrderId > 0) {
                /** Omni: 로컬 테이블 주문 줄이 있으면 추가 getPosOrders 생략 */
                const localItemsOk =
                  isOmniPaymentFastPath && Array.isArray(existingOrder?.items) && existingOrder.items.length > 0
                if (!localItemsOk) {
                  try {
                    const serverItemsForMerge = await fetchPosOrderItemsForPaymentMerge(
                      existingOrderId,
                      currentStoreId
                    )
                    if (serverItemsForMerge.length > 0) {
                      existingOrder = {
                        ...(existingOrder ?? {
                          id: String(existingOrderId),
                          type: 'dine-in' as const,
                          items: [],
                          total: 0,
                          status: 'pending' as const,
                          createdAt: new Date(),
                        }),
                        items: mapPosOrderItemsToTerminalOrderSnapshot(serverItemsForMerge) as OrderItem[],
                      }
                    }
                  } catch (e) {
                    console.warn('refresh existing dine-in lines before add-order merge failed:', e)
                  }
                }
              }
              try {
                if (isPosDemo) {
                  const tid = selectedTableId
                  /** 데모 바닥 id(`demo-table-*`)는 매장 `tables`에 없을 수 있음 — `selectedTable`과 동일하게 해석 */
                  const tbl = tid ? selectedTable : undefined
                  if (activeTab === 'tables' && tid && tbl) {
                    const subtotal = payload.items.reduce(
                      (s, it) => s + it.price * Math.max(1, Number(it.quantity) || 1),
                      0
                    )
                    const discountAmt = payload.discountAmt ?? 0
                    const pricing = computePosPricing({
                      subtotal,
                      discountAmt,
                      cardPaymentAmount: 0,
                      adjustments: pricingAdjustments,
                    })
                    const orderItems: OrderItem[] = payload.items.map((it, idx) => ({
                      id: String(it.id || `demo-line-${idx}`),
                      name: it.name,
                      quantity: Math.max(1, Number(it.quantity) || 1),
                      price: it.price,
                      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
                    }))
                    const order: Order = {
                      id: '900001',
                      tableId: tid,
                      type: 'dine-in',
                      items: orderItems,
                      total: pricing.finalTotal,
                      status: 'preparing',
                      createdAt: new Date(),
                      orderNo: `DEMO-${Date.now()}`,
                      guestCount: Math.max(1, Math.trunc(Number(payload.guestCount ?? 1) || 1)),
                      ...(String(payload.memo ?? '').trim() ? { memo: String(payload.memo).trim() } : {}),
                    }
                    setDemoDineInOrder({ tableId: tid, order })
                    setPendingDineInOrderId(null)
                    pendingDineInOrderTableRef.current = ''
                    setServingTableId(tid)
                    setSelectedTableId(null)
                    clearCartFromTerminal()
                    await refetchCurrentStore()
                    return
                  }
                  setPendingDineInOrderId(null)
                  pendingDineInOrderTableRef.current = ''
                  setDemoDineInOrder(null)
                  setServingTableId(null)
                  setSelectedTableId(null)
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return
                }
                if (!(await ensureBusinessOpenForOrder())) return
                const incomingItems = cartLinesToPosOrderItems(payloadItemsNormalized)
                /** 카트에 기존 줄이 없을 때(첫 주문 후 카트 비움)에도 DB·영수증이 한 주문으로 유지되도록 병합 */
                const posItemsForSave =
                  isAddOrder && existingOrder
                    ? mergeDineInAddonCartPosItemsWithExisting(
                        orderUiItemsToPosOrderItems(existingOrder.items),
                        incomingItems
                      )
                    : incomingItems
                let savedOrderNo = ''
                let savedOrderId: number | null = null
                let queuedLocalOrderNo: string | null = null
                let queuedWithoutServerId = false
                // 기존 주문 id만 남고 본문 스냅샷이 비는 레이스(리패치/동기화 직후)에서는
                // 저장을 막지 않고 신규 저장 경로로 폴백해 주문 유실을 방지한다.
                if (isAddOrder && existingOrder) {
                  /**
                   * 추가 주문: 카트가 기존+신규 전체일 수도 있고, 신규 줄만 있을 수도 있다.
                   * `posItemsForSave`는 `mergeDineInAddonCartPosItemsWithExisting`로 후자일 때 DB 줄을 유지한다.
                   */
                  if (isMainPosDevice) {
                    mainPosSelfDineInUpdateSuppressUntilRef.current.set(
                      existingOrderId,
                      Date.now() + DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS
                    )
                  }
                  const addonMemberFields = resolvePosOrderMemberFieldsForAddonUpdate(
                    {
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      pointUsed: payload.pointUsed,
                    },
                    existingOrder
                  )
                  const updateReq = {
                    id: existingOrderId,
                    items: posItemsForSave,
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    ...addonMemberFields,
                    ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                    pointEarned: 0,
                    guestCount: payload.guestCount ?? existingOrder.guestCount,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                  }
                  const res = await updatePosOrder(updateReq)
                  if (!res.success) {
                    const msg = localizeApiPopupMessage(res.message, t('posOrderSaveFailed') || '주문 저장에 실패했습니다.')
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = existingOrderId
                  savedOrderNo = existingOrder.orderNo ?? ''
                  logPosPrintDebug('submit_save_success_update_pos_order', {
                    orderId: savedOrderId,
                    orderNo: savedOrderNo,
                    isAddOrder: true,
                    incomingItems: incomingItems.length,
                  })
                } else {
                  const saveReq = {
                    storeCode: currentStoreId,
                    createdBy: auth?.user ?? '',
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountAmt: payload.discountAmt,
                    discountReason: payload.discountReason,
                    serviceAmt: payload.serviceAmt,
                    serviceReason: payload.serviceReason,
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    localOrderNo: posSaveClientKey,
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                    items: incomingItems,
                  }
                  const res = await savePosOrderWithOffline(saveReq)
                  if (!res.success) {
                    const msg = localizeApiPopupMessage((res as { message?: string }).message, t('posOrderSaveFailed') || '주문 저장에 실패했습니다.')
                    await appAlert(msg)
                    return
                  }
                  savedOrderId = res.orderId ?? null
                  savedOrderNo = (res as { orderNo?: string }).orderNo ?? ''
                  const queued = Boolean((res as { queued?: boolean }).queued)
                  await notifyQueuedSave(savedOrderNo, queued)
                  if (queued && savedOrderNo.startsWith('LOCAL-')) queuedLocalOrderNo = savedOrderNo
                  queuedWithoutServerId = queued && !(savedOrderId != null && savedOrderId > 0)
                  if (queuedWithoutServerId) {
                    upsertOptimisticOrder({
                      storeCode: currentStoreId,
                      orderNo: savedOrderNo,
                      orderType: 'dine_in',
                      tableName: payload.tableName,
                      tableLayoutFloor:
                        parsePosTableFloorFromLabel(payload.tableName) ??
                        getTableFloor(selectedTableId ?? servingTableId),
                      memo: payload.memo,
                      status: 'pending',
                      total: incomingItems.reduce(
                        (acc, it) => acc + Number(it.price ?? 0) * resolveCartLineQuantityForSave(it),
                        0
                      ),
                      items: incomingItems.map((it) => ({
                        id: String(it.id ?? ''),
                        name: String(it.name ?? ''),
                        quantity: resolveCartLineQuantityForSave(it),
                        price: Number(it.price ?? 0),
                        ...(String((it as { menuId?: string }).menuId ?? '').trim()
                          ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                          : {}),
                        ...(String((it as { optionId?: string }).optionId ?? '').trim()
                          ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                          : {}),
                        ...(String((it as { note?: string }).note ?? '').trim()
                          ? { note: String((it as { note?: string }).note).trim() }
                          : {}),
                      })),
                    })
                  }
                  logPosPrintDebug('submit_save_success_new_pos_order', {
                    orderId: savedOrderId,
                    orderNo: savedOrderNo,
                    queued,
                    incomingItems: incomingItems.length,
                  })
                }
                const markQueuedLocalPrintedIfNeeded = () => {
                  if (!queuedLocalOrderNo) return
                  registerLocallyPrintedQueuedOrderNo(queuedLocalOrderNo)
                  queuedLocalOrderNo = null
                }
                let skipLocalAutoPrint = false
                if (savedOrderId != null) {
                  // 추가 주문은 기존 orderId로 merge 저장이라 이미 seen에 있음. 여기서 skip하면 홀/주방 인쇄가 막힘(폴링·로컬 중복 방지는 신규 주문에만 적용).
                  if (!isAddOrder) {
                    skipLocalAutoPrint = seenOrderIdsRef.current.has(savedOrderId)
                  }
                  seenOrderIdsRef.current.add(savedOrderId)
                  bumpLastSeenOrderId(savedOrderId)
                }

                type ReceiptPrintLine = {
                  id: string
                  name: string
                  price: number
                  qty: number
                  note?: string
                  isAddon?: boolean
                  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                }
                const mapPosItemToReceiptLine = (
                  it: (typeof posItemsForSave)[number],
                  addon: boolean
                ): ReceiptPrintLine => ({
                  id: String(it.id ?? ''),
                  name: String(it.name ?? ''),
                  price: Number(it.price ?? 0),
                  qty: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }),
                  ...(String((it as { note?: string }).note ?? '').trim()
                    ? { note: String((it as { note?: string }).note).trim() }
                    : {}),
                  ...(Array.isArray((it as { promoItems?: { menuId: string; optionId: string | null; quantity: number }[] }).promoItems)
                    ? {
                        promoItems: enrichPromoItemsWithOptionName(
                          (it as { promoItems: { menuId: string; optionId: string | null; quantity: number }[] }).promoItems
                        ),
                      }
                    : {}),
                  ...(addon ? { isAddon: true as const } : {}),
                })
                const receiptPrintItems: ReceiptPrintLine[] = posItemsForSave.map((it) => {
                  if (!isAddOrder || !existingOrder) {
                    return mapPosItemToReceiptLine(it, false)
                  }
                  const id = normalizeCartLineIdForSave(it.id)
                  const prev = existingOrder.items.find((e) => normalizeCartLineIdForSave(e.id) === id)
                  const qNow = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
                  const qPrev = prev
                    ? resolveCartLineQuantityForSave(prev as { quantity?: unknown; qty?: unknown })
                    : 0
                  const addon = !prev || qNow > qPrev
                  return mapPosItemToReceiptLine(it, addon)
                })

                const mergeSubtotal = receiptPrintItems.reduce((s, i) => s + i.price * i.qty, 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({
                  subtotal: mergeSubtotal,
                  discountAmt,
                  cardPaymentAmount: 0,
                  adjustments: pricingAdjustments,
                })
                const orderNoStr = savedOrderNo
                const existingItemsBeforeAdd =
                  isAddOrder && existingOrder ? orderUiItemsToPosOrderItems(existingOrder.items) : []
                const kitchenCartLines =
                  isAddOrder && existingOrder
                    ? resolveDineInKitchenLinesForAddSubmit(posItemsForSave, existingItemsBeforeAdd, {
                        formatNote: formatLineNoteForPrint,
                      })
                    : payloadItemsNormalized
                /** 홀 추가주문 dedupe는 주방 delta가 아니라 isAddon 줄 기준.
                 * 음료만 추가 시 예전엔 kitchenCartLines가 비어 `hall:add:0`으로 묶여 이후 홀 출력이 막힘. */
                const hallAddonLinesForDedupe = isAddOrder
                  ? receiptPrintItems.filter((it) => it.isAddon === true)
                  : []
                const addHallDedupeSuffix = isAddOrder
                  ? buildDineInAddKitchenPrintDedupeSuffix(
                      hallAddonLinesForDedupe.length > 0 ? hallAddonLinesForDedupe : kitchenCartLines,
                      { formatNote: formatLineNoteForPrint }
                    )
                  : ''
                const addKitchenDedupeSuffix = isAddOrder
                  ? buildDineInAddKitchenPrintDedupeSuffix(kitchenCartLines, {
                      formatNote: formatLineNoteForPrint,
                    })
                  : ''
                const hallDedupeKeyForSubmit =
                  savedOrderId != null && savedOrderId > 0
                    ? isAddOrder
                      ? `order:${savedOrderId}:hall:add:${addHallDedupeSuffix}`
                      : `order:${savedOrderId}:hall:auto`
                    : `submit:hall:${orderNoStr}`
                const receiptPayloadSubmit = {
                  orderNo: savedOrderNo,
                  storeCode: currentStoreId,
                  orderType: t('posOrderTypeDineIn') || '매장',
                  tableName: payload.tableName,
                  memo: payload.memo,
                  items: receiptPrintItems,
                  subtotal: mergeSubtotal,
                  discountAmt,
                  couponDiscountAmt: payload.couponDiscountAmt ?? 0,
                  ...posOrderTierDiscountFieldsFromPayload(payload),
                  discountReason: String(payload.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...posGuestCountSpread(payload.guestCount),
                  _autoPrintDedupeKey: hallDedupeKeyForSubmit,
                }
                const storeAutoPrint = isOmniPaymentFastPath
                  ? readStoreAutoPrintFlagsSync()
                  : await resolveStoreAutoPrintFlags(currentStoreId)
                const shouldAutoPrintReceipt = isAddOrder
                  ? storeAutoPrint.receiptOnAddOrder
                  : storeAutoPrint.receiptOnOrder
                const autoPrintKitchenForSubmit = storeAutoPrint.kitchenOnOrder
                if (savedOrderId != null && savedOrderId > 0) {
                  const qtySnap = buildDineInQtySnapshot(receiptPrintItems)
                  if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(savedOrderId, qtySnap)
                  if (isMainPosDevice) {
                    mainPosSelfDineInUpdateSuppressUntilRef.current.set(
                      savedOrderId,
                      Date.now() + DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS
                    )
                  }
                }
                const scheduleKitchenAfterDineInSubmit = () => {
                  if (kitchenCartLines.length === 0) return
                  if (isAddOrder) {
                    dispatchDineInAddonKitchenPrint({
                      kitchenCartLines,
                      dedupeKey: buildDineInAddKitchenAutoPrintDedupeKey(
                        savedOrderId ?? orderNoStr,
                        kitchenCartLines,
                        { formatNote: formatLineNoteForPrint }
                      ),
                      orderNo: orderNoStr,
                      storeCode: currentStoreId,
                      tableName: payload.tableName,
                      memo: payload.memo,
                      guestCount: payload.guestCount,
                      logEvent: 'submit_kitchen_autoprint_dispatch',
                    })
                    return
                  }
                  const kitchenPrintKey =
                    savedOrderId != null ? `order:${savedOrderId}:kitchen` : `submit:${orderNoStr}:${payload.tableName || ''}:new`
                  if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
                  const runKitchenFromSnapshot = () => {
                    logPosPrintDebug('submit_kitchen_autoprint_dispatch', {
                      orderId: savedOrderId,
                      orderNo: orderNoStr,
                      kitchenPrintKey,
                      kitchenLines: kitchenCartLines.length,
                      isAddOrder,
                      source: 'snapshot',
                    })
                    const itemsForKitchen = kitchenCartLines.map((i) => {
                      const line = i as {
                        menuId?: string
                        menuId1?: string
                        menu_id1?: string
                        menuId2?: string
                        note?: string
                        promoId?: string
                        promoCode?: string
                        promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                      }
                      const menuId = String(
                        line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? ''
                      ).trim()
                      const note = String(line.note ?? '').trim()
                      const promoId = String(line.promoId ?? '').trim()
                      const promoCode = String(line.promoCode ?? '').trim()
                      return {
                        id: i.id,
                        name: i.name,
                        price: i.price,
                        qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
                        ...(menuId ? { menuId } : {}),
                        ...(note ? { note } : {}),
                        ...(promoId ? { promoId } : {}),
                        ...(promoCode ? { promoCode } : {}),
                        ...(Array.isArray(line.promoItems)
                          ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) }
                          : {}),
                      }
                    })
                    getPrinterSettingsForStore(currentStoreId)
                      .then(async (settings) => {
                        const ki = kitchenSlipPrintI18n(settings, lang)
                        const menusForPrint = await resolveMenusForKitchenPrint(
                          itemsForKitchen as Array<Record<string, unknown>>,
                          currentStoreId
                        )
                        const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
                          itemsForKitchen as Array<Record<string, unknown>>,
                          menusForPrint
                        )
                        const slips = buildKitchenSlipGroups(
                          kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
                          buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
                        )
                        if (!slips.length) return
                        const slipDesign = resolveKitchenSlipDesign(settings)
                        const memoLine = buildPosCustomerMemoLineForPrint(payload.memo, ki.t, ki.lang)
                        const tablePartR = payload.tableName
                          ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(payload.tableName, ki.t)
                          : ''
                        const printOne = (idx: number) => {
                          if (idx >= slips.length) return
                          const slip = slips[idx]
                          const html = buildKitchenSlipDocumentHtml({
                            label: slip.label,
                            orderNo: orderNoStr,
                            storeCode: currentStoreId,
                            orderTypeLabel: ki.orderTypeLabels.dine_in || '매장',
                            tablePart: tablePartR,
                            dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                            items: kitchenSlipItemsForPrint(
                              slip.items,
                              kitchenItemsWithResolvedPromo(
                                itemsForKitchen as Record<string, unknown>[]
                              ) as KitchenSlipRoutingItem[],
                              ki,
                              menusForPrint,
                              optionNameByCodeForPrint
                            ),
                            memoLine: memoLine || null,
                            escapeHtml,
                            design: slipDesign,
          printerSettings: settings,
                            optionNameByCode: optionNameByCodeForPrint,
                            printColorAdjust: 'exact',
                            ...posKitchenGuestSpread(payload.guestCount, ki.t('posOrderGuestCount')),
                          })
                          printPosHtmlDocument(html, {
                            title: slip.label,
                            printDelayMs: 0,
                            focusIframeBeforePrint: false,
                            printRole: 'kitchen',
                            kitchenStation: slip.station,
                            escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
                            onPrintUnavailable: () => {
                              void appAlert(t('posPrintUnavailable'))
                            },
                            onAfterCleanup: () => {
                              if (idx + 1 < slips.length)
                                setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                            },
                          })
                        }
                        setTimeout(() => printOne(0), 0)
                      })
                      .catch((e) => console.error('Kitchen slip print:', e))
                  }
                  if (savedOrderId != null && savedOrderId > 0) {
                    void getPosOrders({
                      orderId: savedOrderId,
                      storeCode: currentStoreId,
                      limit: 1,
                    })
                      .then((rows) => rows?.[0])
                      .then((latestOrder) => {
                        if (!latestOrder?.items?.length) throw new Error('latest_order_not_ready')
                        const latestStatus = String(latestOrder.status ?? '').trim().toLowerCase()
                        if (latestStatus === 'cancelled' || latestStatus === 'canceled' || latestStatus === 'refunded') {
                          logPosPrintDebug('submit_kitchen_autoprint_skip_cancelled_order', {
                            orderId: savedOrderId,
                            orderNo: orderNoStr,
                            status: latestStatus,
                          })
                          return
                        }
                        logPosPrintDebug('submit_kitchen_autoprint_dispatch', {
                          orderId: savedOrderId,
                          orderNo: orderNoStr,
                          kitchenPrintKey,
                          kitchenLines: latestOrder.items.length,
                          isAddOrder,
                          source: 'canonical',
                        })
                        return printKitchenFromPosOrder(latestOrder)
                      })
                      .catch((e) => {
                        console.warn('submit canonical kitchen fetch failed, fallback to snapshot:', e)
                        runKitchenFromSnapshot()
                      })
                    return
                  }
                  runKitchenFromSnapshot()
                }
                const kitchenDelayAfterReceiptMs =
                  typeof window !== 'undefined' && window.cmPosShell
                    ? resolveAfterReceiptToKitchenDelayMs()
                    : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
                if (isMainPosDevice && !skipLocalAutoPrint) {
                  if (shouldAutoPrintReceipt) {
                    markQueuedLocalPrintedIfNeeded()
                    logPosPrintDebug('submit_receipt_autoprint_dispatch', {
                      orderId: savedOrderId,
                      orderNo: orderNoStr,
                      autoPrintKitchenSlipOnOrder: autoPrintKitchenForSubmit,
                      skipLocalAutoPrint,
                      receiptItems: receiptPrintItems.length,
                    })
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true)
                  }
                  if (autoPrintKitchenForSubmit && kitchenCartLines.length > 0) {
                    if (!shouldAutoPrintReceipt) {
                      markQueuedLocalPrintedIfNeeded()
                      logPosPrintDebug('submit_kitchen_only_autoprint_dispatch', {
                        orderId: savedOrderId,
                        orderNo: orderNoStr,
                        skipLocalAutoPrint,
                        kitchenLines: kitchenCartLines.length,
                      })
                    }
                    setTimeout(
                      scheduleKitchenAfterDineInSubmit,
                      shouldAutoPrintReceipt ? kitchenDelayAfterReceiptMs : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
                    )
                  }
                  if (!shouldAutoPrintReceipt && !autoPrintKitchenForSubmit) {
                  /** 자동 인쇄(영수증·주방) 모두 꺼진 경우: 수동 인쇄 안내 모달(Windows 인쇄 대화상자로 이어짐) */
                  setReceiptData({
                    orderNo: orderNoStr,
                    items: receiptPrintItems,
                    subtotal: mergeSubtotal,
                    discountAmt,
                    total: pricing.finalTotal,
                    storeCode: currentStoreId,
                    orderType: t('posOrderTypeDineIn') || '매장',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    discountReason: payload.discountReason,
                    vatFeeAmt: pricing.vatFeeAmt,
                    vatFeeMode: pricing.vatFeeMode,
                    ...receiptTaxDisplayFieldsFromPricing(pricing),
                    serviceFeeAmt: pricing.serviceFeeAmt,
                    serviceFeeMode: pricing.serviceFeeMode,
                    cardFeeAmt: pricing.cardFeeAmt,
                    cardFeeMode: pricing.cardFeeMode,
                    otherFeeAmt: pricing.otherFeeAmt,
                    otherFeeMode: pricing.otherFeeMode,
                    receiptAutoPrintContext: isAddOrder ? 'add_order' : 'order',
                  })
                  }
                }
                /** 저장 후 카트·세션 캐시 비움 — 탭 전환 복원 시 이전 주문 줄이 추가주문 주방에 섞이지 않게 */
                const submittedTableIdForCache = selectedTableId ?? servingTableId
                replacePosCartItemsCache(
                  getPosCartSessionKey({
                    currentStoreId,
                    orderType: 'dine-in',
                    selectedTableId: submittedTableIdForCache ?? '',
                    deliveryApp: null,
                    deliveryOrderNo: null,
                    takeoutLabel: null,
                  }),
                  []
                )
                replacePosCartItemsCache(buildTerminalCartSessionKeyForTab('tables'), [])
                if (savedOrderId != null) {
                  setPendingDineInOrderId(savedOrderId)
                  pendingDineInOrderTableRef.current = String(payload.tableName ?? '').trim()
                  pendingDineInOrderSavedAtRef.current = {
                    orderId: Number(savedOrderId) || 0,
                    atMs: Date.now(),
                    tableKey:
                      posDineInTableMatchKey(
                        String(payload.tableName ?? '').trim(),
                        getTableFloor(selectedTableId ?? servingTableId)
                      ) || '',
                  }
                }
                /** 저장 후 cart 비움 + 해당 테이블 서빙 패널로 (바닥에 품목 잔존·결제 카트 단절 방지) */
                const submittedTableId = selectedTableId ?? servingTableId
                clearCartFromTerminal()
                setSelectedTableId(null)
                setServingTableId(submittedTableId)
                /** Omni: optimistic+refetch를 버튼 잠금에서 분리 — 저장 성공 직후 주문 버튼 해제 */
                if (isOmniPaymentFastPath) {
                  void refreshStoreListAfterOrderSave({
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    status: 'pending',
                    orderNo: savedOrderNo,
                    serverOrderId: savedOrderId,
                    total: mergeSubtotal - (payload.discountAmt ?? 0),
                    items: mapPosOrderItemsToTerminalOrderSnapshot(posItemsForSave),
                    queuedWithoutServerId,
                  })
                } else {
                  await refreshStoreListAfterOrderSave({
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: payload.memo,
                    status: 'pending',
                    orderNo: savedOrderNo,
                    serverOrderId: savedOrderId,
                    total: mergeSubtotal - (payload.discountAmt ?? 0),
                    items: mapPosOrderItemsToTerminalOrderSnapshot(posItemsForSave),
                    queuedWithoutServerId,
                  })
                }
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onDineInOrderComplete={async (payload, existingOrderId) => {
              if (posCartBackendBusyRef.current) {
                await alertPaymentBackendBusy()
                return false
              }
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              try {
                if (isPosDemo) {
                  setPendingReceiptOrderNo(null)
                  setPendingDineInOrderId(null)
                  pendingDineInOrderTableRef.current = ''
                  setDemoDineInOrder(null)
                  setServingTableId(null)
                  setSelectedTableId(null)
                  clearCartFromTerminal()
                  clearReceiptQueue()
                  await refetchCurrentStore()
                  return true
                }
                if (!(await ensureBusinessOpenForOrder())) return false
                let orderIdToComplete: number | null = null
                let orderNo: string = ''
                const pay = payload.payment
                const linkpos = pay ? await runLinkposPaymentIfNeeded(pay) : { ok: true as const, linkposPayment: null as LinkposPaymentSummary | null }
                if (!linkpos.ok) return false
                const kbankQr = pay
                  ? await runKbankQrPaymentIfNeeded(pay, {
                      orderType: 'dine_in',
                      orderLabel: payload.tableName,
                      orderId: existingOrderId ?? undefined,
                    })
                  : { ok: true as const }
                const kbankQrPending =
                  !kbankQr.ok && (kbankQr as { qrPending?: boolean }).qrPending === true
                if (!kbankQr.ok && !kbankQrPending) return false
                const kbankPartnerTxnId = String(
                  (kbankQr as { partnerTransactionId?: string }).partnerTransactionId || ''
                ).trim()
                const memoWithKbank = posOrderMemoForPaymentSave(payload.memo, payload.splitReceipts, kbankQr)
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const cartItemsForSave = cartLinesToPosOrderItems(payloadItemsNormalized)
                let itemsForPaymentSave = cartItemsForSave
                const targetClose: 'paid' | 'completed' = payload.isPrepaid ? 'paid' : 'completed'
                /** 서버에 행이 있을 때만 update API 사용 (오프라인 임시 음수 id 제외) */
                if (existingOrderId != null && existingOrderId > 0 && pay != null) {
                  itemsForPaymentSave = await mergePaymentItemsPreferLocal(existingOrderId, cartItemsForSave)
                  const updateRes = await updatePosOrder({
                    id: existingOrderId,
                    terminalStoreCode: currentStoreId,
                    items: itemsForPaymentSave,
                    tableName: payload.tableName,
                    memo: memoWithKbank,
                    discountAmt: payload.discountAmt ?? 0,
                    discountReason: payload.discountReason ?? '',
                    serviceAmt: payload.serviceAmt ?? 0,
                    serviceReason: payload.serviceReason ?? '',
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                    pointUsed: payload.pointUsed,
                    guestCount: payload.guestCount,
                    ...posOrderPaymentFieldsFromSnapshot(pay),
                    linkposPayment: linkpos.linkposPayment,
                    ...(isOmniPaymentFastPath ? { skipPostPaymentSideEffects: true } : {}),
                    pricingAdjustments,
                  })
                  if (!updateRes.success) {
                    await appAlert(
                      localizeApiMessage(updateRes.message, t, t('msg_save_fail') || '저장 실패', lang)
                    )
                    return false
                  }
                  capturePaymentReceiptMember(updateRes, {
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    memberTierCode: payload.memberTierCode,
                  })
                  orderIdToComplete = existingOrderId
                  orderNo = pendingReceiptOrderNo ?? ''
                } else if (pay != null) {
                  const localNoCandidate =
                    (pendingReceiptOrderNo?.startsWith('LOCAL-') ? pendingReceiptOrderNo : null) ??
                    (servingTable?.order?.orderNo?.startsWith('LOCAL-')
                      ? servingTable.order.orderNo
                      : null) ??
                    (selectedTable?.order?.orderNo?.startsWith('LOCAL-')
                      ? selectedTable.order.orderNo
                      : null)
                  let mergedLocal = false
                  if (localNoCandidate) {
                    mergedLocal = await mergeQueuedSavePosOrderByLocalOrderNo(localNoCandidate, (body) => ({
                      ...body,
                      items: itemsForPaymentSave,
                      tableName: payload.tableName,
                      memo: memoWithKbank,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      serviceAmt: payload.serviceAmt ?? 0,
                      serviceReason: payload.serviceReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      ...posOrderPaymentFieldsFromSnapshot(pay),
                      linkposPayment: linkpos.linkposPayment,
                      kbankPartnerTransactionId: String((kbankQr as { partnerTransactionId?: string }).partnerTransactionId || '') || null,
                      pricingAdjustments,
                      ...(kbankQrPending ? {} : { closeStatus: targetClose }),
                    }))
                  }
                  if (mergedLocal) {
                    orderNo = localNoCandidate ?? ''
                    orderIdToComplete = null
                    await notifyQueuedSave(orderNo, true)
                    capturePaymentReceiptMember(
                      {
                        memberId: payload.memberId,
                        memberNo: payload.memberNo,
                        memberTierCode: payload.memberTierCode,
                      },
                      {
                        memberId: payload.memberId,
                        memberNo: payload.memberNo,
                        memberTierCode: payload.memberTierCode,
                      }
                    )
                  } else {
                    const res = await savePosOrderWithOffline({
                      storeCode: currentStoreId,
                      createdBy: auth?.user ?? '',
                      orderType: 'dine_in',
                      tableName: payload.tableName,
                      memo: memoWithKbank,
                      discountAmt: payload.discountAmt ?? 0,
                      discountReason: payload.discountReason ?? '',
                      serviceAmt: payload.serviceAmt ?? 0,
                      serviceReason: payload.serviceReason ?? '',
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      ...posOrderCouponFieldsFromPayload(payload),
                    ...posOrderTierDiscountFieldsFromPayload(payload),
                      pointUsed: payload.pointUsed,
                      guestCount: payload.guestCount,
                      localOrderNo: posSaveClientKey,
                      items: itemsForPaymentSave,
                      ...posOrderPaymentFieldsFromSnapshot(pay),
                      linkposPayment: linkpos.linkposPayment,
                      kbankPartnerTransactionId: String((kbankQr as { partnerTransactionId?: string }).partnerTransactionId || '') || null,
                      pricingAdjustments,
                      ...(kbankQrPending ? {} : { closeStatus: targetClose }),
                    })
                    if (!res.success) {
                      const msg = (res as { message?: string }).message || t('posOrderSaveFailed') || '주문 저장에 실패했습니다.'
                      await appAlert(msg)
                      return false
                    }
                    orderIdToComplete = (res as { orderId?: number }).orderId ?? null
                    orderNo = (res as { orderNo?: string }).orderNo ?? ''
                    await notifyQueuedSave(orderNo, (res as { queued?: boolean }).queued)
                    capturePaymentReceiptMember(res, {
                      memberId: payload.memberId,
                      memberNo: payload.memberNo,
                      memberTierCode: payload.memberTierCode,
                    })
                  }
                }
                const finalizeDineInPaid = async (): Promise<boolean> => {
                  if (orderIdToComplete != null) {
                    const targetStatus = payload.isPrepaid ? 'paid' : 'completed'
                    /**
                     * Omni: 기존 주문은 status를 백그라운드. 신규+closeStatus는 저장 시 이미 마감 → 생략.
                     * 충만: 항상 await(기존 동작).
                     */
                    const statusAlreadyClosedBySave =
                      isOmniPaymentFastPath &&
                      pay != null &&
                      !kbankQrPending &&
                      !(existingOrderId != null && existingOrderId > 0)
                    if (!statusAlreadyClosedBySave) {
                      const statusOk = await applyPaidStatusAfterPaymentSave({
                        id: orderIdToComplete,
                        status: targetStatus,
                      })
                      if (!statusOk) return false
                    }
                    /** 후불(완료)만 즉시 테이블 비움. 선불(paid)은 테이블·내역 유지 */
                    if (!payload.isPrepaid && payload.tableName) {
                      clearTableOrder(currentStoreId, payload.tableName)
                    }
                  } else if (pay != null && payload.tableName && !payload.isPrepaid) {
                    /** 오프라인 등 orderId 없이 저장만 한 후불 완료 시 테이블 비움 */
                    clearTableOrder(currentStoreId, payload.tableName)
                  }
                  void tryOpenDrawerOnOrderComplete(payload.payment, {
                    skipAutoOpen: Boolean(payload.splitReceipts?.length),
                  })
                  const receiptPayload = buildCheckoutPaymentReceiptModalData({
                    orderNo,
                    storeCode: currentStoreId,
                    orderType: 'dine_in',
                    tableName: payload.tableName,
                    memo: memoWithKbank,
                    items: itemsForPaymentSave,
                    discountAmt: payload.discountAmt,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    discountReason: payload.discountReason,
                    appliedCoupons: payload.appliedCoupons,
                    cardPaymentAmount: resolveCardPaymentAmountForPricing(pay),
                    paymentSum: pay
                      ? posOrderPaymentSum({
                          paymentCash: pay.paymentCash,
                          paymentCard: pay.paymentCard,
                          paymentQr: pay.paymentQr,
                          paymentOther: pay.paymentOther,
                          paymentDeliveryApp: pay.paymentDeliveryApp,
                        } as PosOrder)
                      : 0,
                    adjustments: pricingAdjustments,
                    paymentFields: pay ? receiptPaymentFieldsFromSnapshot(pay) : undefined,
                    suppressReceiptModalAutoPrint: !isMainPosDevice,
                    serverOrderId: orderIdToComplete ?? undefined,
                  })
                  const splitBatch = makeSplitPaymentReceiptBatch(
                    {
                      orderNo: receiptPayload.orderNo,
                      storeCode: receiptPayload.storeCode,
                      orderType: receiptPayload.orderType,
                      tableName: receiptPayload.tableName,
                      memo: receiptPayload.memo,
                      discountReason: receiptPayload.discountReason,
                      vatFeeMode: receiptPayload.vatFeeMode,
                    },
                    payload.splitReceipts,
                    !isMainPosDevice,
                    orderIdToComplete
                  )
                  dispatchCheckoutPaymentReceipt({
                    receiptPayload,
                    splitBatch,
                    orderId: orderIdToComplete,
                  })
                  setPendingReceiptOrderNo(null)
                  setPendingDineInOrderId(null)
                  pendingDineInOrderTableRef.current = ''
                  setServingTableId(null)
                  setSelectedTableId(null)
                  /** 결제 버튼 잠금(backendBusy) 해제를 우선하기 위해 재조회는 백그라운드 처리 */
                  void refetchCurrentStore()
                  if (pay) schedulePostPaymentCustomerQr()
                  return true
                }
                /** QR 대기 결제: 모달을 닫고 주문은 open 유지, 승인되면 후처리 실행 */
                if (kbankQrPending && kbankPartnerTxnId) {
                  registerPendingKbankFinalize(kbankPartnerTxnId, () => {
                    void finalizeDineInPaid()
                  })
                  void refetchCurrentStore()
                  return true
                }
                return await finalizeDineInPaid()
              } catch (e) {
                console.error('savePosOrder/updatePosOrder:', e)
                await appAlert(tr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
                return false
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
            onNonDineOrderComplete={async (payload) => {
              if (posCartBackendBusyRef.current) {
                await alertPaymentBackendBusy()
                return false
              }
              posCartBackendBusyRef.current = true
              setPosCartBackendBusy(true)
              const posSaveClientKey = newPosOrderClientRequestId()
              try {
                if (isPosDemo) {
                  if (payload.orderType === 'delivery') {
                    setSelectedDeliveryTargetId(null)
                    setSelectedDeliveryTargetLabel('')
                    setDeliveryApp(null)
                    setDeliveryOrderNo('')
                  } else if (payload.orderType === 'takeout') {
                    setSelectedTakeoutTargetId(null)
                    setSelectedTakeoutTargetLabel('')
                  }
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return true
                }
                if (!(await ensureBusinessOpenForOrder())) return false
                /** `await` 사이에 카트가 비면 터미널 보정이 불가 → 링크포스/결제 대기 전에 스냅샷 */
                const payloadItemsNormalized = reconcilePayloadItemsWithTerminalCart(payload.items, terminalCartLines)
                const paymentSumForTakeoutAddCheck =
                  Math.max(0, Number(payload.payment?.paymentCash ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentCard ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentQr ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentOther ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentDeliveryApp ?? 0))
                const existingTakeoutId = Number(pendingTakeoutOrderId ?? 0)
                const isTakeoutAddOrder =
                  payload.orderType === 'takeout' &&
                  Number.isFinite(existingTakeoutId) &&
                  existingTakeoutId > 0 &&
                  paymentSumForTakeoutAddCheck <= 0.0001
                if (isTakeoutAddOrder) {
                  const rows = await getPosOrders({
                    orderId: existingTakeoutId,
                    storeCode: currentStoreId,
                    limit: 1,
                  })
                  const hit = Array.isArray(rows) ? rows[0] : null
                  const hitType = normalizePosOrderTypeKey(hit?.orderType)
                  const hitStatus = String(hit?.status ?? '').trim().toLowerCase()
                  const hitPaySum = hit ? posOrderPaymentSum(hit) : 0
                  const hitItems = Array.isArray(hit?.items) ? hit!.items! : []
                  const openForTakeoutAdd =
                    Boolean(hit?.id) &&
                    hitType === 'takeout' &&
                    hitItems.length > 0 &&
                    !isPosOrderPaidLikeStatus(hitStatus) &&
                    hitStatus !== 'completed' &&
                    hitStatus !== 'cancelled' &&
                    hitStatus !== 'canceled' &&
                    hitStatus !== 'refunded' &&
                    hitPaySum <= 0.0001
                  if (!openForTakeoutAdd) {
                    setPendingTakeoutOrderId(null)
                    await appAlert(t('posOrderSaveFailed') || '주문 저장에 실패했습니다.')
                    return false
                  }
                  const existingUiItems: OrderItem[] = hitItems.map((it, idx) => ({
                    id: String(it.id ?? `line-${idx}`),
                    name: String(it.name ?? ''),
                    quantity: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
                    price: Number(it.price ?? 0) || 0,
                    ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
                    ...(String(
                      (it as { menuId?: string }).menuId ??
                        it.menuId1 ??
                        (it as { menu_id1?: string }).menu_id1 ??
                        ''
                    ).trim()
                      ? {
                          menuId: String(
                            (it as { menuId?: string }).menuId ??
                              it.menuId1 ??
                              (it as { menu_id1?: string }).menu_id1 ??
                              ''
                          ).trim(),
                        }
                      : {}),
                    ...(String(it.promoId ?? '').trim() ? { promoId: String(it.promoId).trim() } : {}),
                    ...(String(it.promoCode ?? '').trim() ? { promoCode: String(it.promoCode).trim() } : {}),
                    ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
                    ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
                    ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
                  }))
                  const orderLabelFromDb =
                    String(hit!.tableName ?? '').trim() ||
                    String(payload.orderLabel ?? '').trim() ||
                    (t('posOrderTypeTakeout') || '포장')
                  const incomingItems = cartLinesToPosOrderItems(payloadItemsNormalized)
                  const existingItemsBeforeAdd = orderUiItemsToPosOrderItems(existingUiItems)
                  const posItemsForSave = mergeDineInAddonCartPosItemsWithExisting(
                    existingItemsBeforeAdd,
                    incomingItems
                  )
                  if (isMainPosDevice) {
                    mainPosSelfDineInUpdateSuppressUntilRef.current.set(
                      existingTakeoutId,
                      Date.now() + DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS
                    )
                  }
                  const updateRes = await updatePosOrder({
                    id: existingTakeoutId,
                    terminalStoreCode: currentStoreId,
                    items: posItemsForSave,
                    tableName: orderLabelFromDb,
                    memo: String(hit!.memo ?? payload.memo ?? '').trim() || undefined,
                    discountAmt: Math.max(0, Number(hit!.discountAmt ?? payload.discountAmt ?? 0) || 0),
                    discountReason: String(hit!.discountReason ?? payload.discountReason ?? '').trim(),
                    serviceAmt: Math.max(0, Number(hit!.serviceAmt ?? payload.serviceAmt ?? 0) || 0),
                    serviceReason: String(hit!.serviceReason ?? payload.serviceReason ?? '').trim(),
                    memberId: hit!.memberId ?? payload.memberId,
                    memberNo: hit!.memberNo ?? payload.memberNo,
                    ...posOrderCouponFieldsFromPayload({
                      ...payload,
                      couponCode: hit!.couponCode ?? payload.couponCode,
                      couponDiscountAmt: Math.max(
                        0,
                        Number(hit!.couponDiscountAmt ?? payload.couponDiscountAmt ?? 0) || 0
                      ),
                    }),
                    pointUsed: Math.max(0, Math.trunc(Number(hit!.pointUsed ?? payload.pointUsed ?? 0) || 0)),
                    paymentCash: 0,
                    paymentCard: 0,
                    paymentQr: 0,
                    paymentOther: 0,
                    paymentDeliveryApp: 0,
                    deliveryPaymentChannel: null,
                    pricingAdjustments,
                  })
                  if (!updateRes.success) {
                    await appAlert(
                      localizeApiMessage(updateRes.message, t, t('msg_save_fail') || '저장 실패', lang)
                    )
                    return false
                  }
                  const savedOrderNo = String(hit!.orderNo ?? '').trim()
                  type ReceiptPrintLine = {
                    id: string
                    name: string
                    price: number
                    qty: number
                    note?: string
                    isAddon?: boolean
                  }
                  const mapPosItemToReceiptLine = (
                    it: (typeof posItemsForSave)[number],
                    addon: boolean
                  ): ReceiptPrintLine => ({
                    id: String(it.id ?? ''),
                    name: String(it.name ?? ''),
                    price: Number(it.price ?? 0),
                    qty: resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown }),
                    ...(String((it as { note?: string }).note ?? '').trim()
                      ? { note: String((it as { note?: string }).note).trim() }
                      : {}),
                    ...(addon ? { isAddon: true as const } : {}),
                  })
                  const receiptPrintItems: ReceiptPrintLine[] = posItemsForSave.map((it) => {
                    const id = normalizeCartLineIdForSave(it.id)
                    const prev = existingUiItems.find((e) => normalizeCartLineIdForSave(e.id) === id)
                    const qNow = resolveCartLineQuantityForSave(it as { quantity?: unknown; qty?: unknown })
                    const qPrev = prev
                      ? resolveCartLineQuantityForSave(prev as { quantity?: unknown; qty?: unknown })
                      : 0
                    const addon = !prev || qNow > qPrev
                    return mapPosItemToReceiptLine(it, addon)
                  })
                  const mergeSubtotal = receiptPrintItems.reduce((s, i) => s + i.price * i.qty, 0)
                  const discountAmt = Math.max(0, Number(hit!.discountAmt ?? payload.discountAmt ?? 0) || 0)
                  const pricing = computePosPricing({
                    subtotal: mergeSubtotal,
                    discountAmt,
                    cardPaymentAmount: 0,
                    adjustments: pricingAdjustments,
                  })
                  const kitchenCartLines = resolveDineInKitchenLinesForAddSubmit(
                    posItemsForSave,
                    existingItemsBeforeAdd,
                    {
                      formatNote: formatLineNoteForPrint,
                    }
                  )
                  const storeAutoPrint = isOmniPaymentFastPath
                    ? readStoreAutoPrintFlagsSync()
                    : await resolveStoreAutoPrintFlags(currentStoreId)
                  const shouldAutoPrintReceipt = storeAutoPrint.receiptOnAddOrder
                  const autoPrintKitchenForSubmit = storeAutoPrint.kitchenOnOrder
                  const receiptPayloadSubmit = {
                    orderNo: savedOrderNo,
                    storeCode: currentStoreId,
                    orderType: t('posOrderTypeTakeout') || '포장',
                    tableName: orderLabelFromDb,
                    memo: String(hit!.memo ?? payload.memo ?? '').trim() || undefined,
                    items: receiptPrintItems,
                    subtotal: mergeSubtotal,
                    discountAmt,
                    couponDiscountAmt: Math.max(
                      0,
                      Number(hit!.couponDiscountAmt ?? payload.couponDiscountAmt ?? 0) || 0
                    ),
                    discountReason: String(hit!.discountReason ?? payload.discountReason ?? '').trim() || undefined,
                    total: pricing.finalTotal,
                    vatFeeAmt: pricing.vatFeeAmt,
                    vatFeeMode: pricing.vatFeeMode,
                    ...receiptTaxDisplayFieldsFromPricing(pricing),
                    serviceFeeAmt: pricing.serviceFeeAmt,
                    serviceFeeMode: pricing.serviceFeeMode,
                    cardFeeAmt: pricing.cardFeeAmt,
                    cardFeeMode: pricing.cardFeeMode,
                    otherFeeAmt: pricing.otherFeeAmt,
                    otherFeeMode: pricing.otherFeeMode,
                    _autoPrintDedupeKey: `order:${existingTakeoutId}:takeout:add:${buildDineInAddKitchenPrintDedupeSuffix(kitchenCartLines, { formatNote: formatLineNoteForPrint })}`,
                  }
                  const kitchenDelayAfterReceiptMs =
                    typeof window !== 'undefined' && window.cmPosShell
                      ? resolveAfterReceiptToKitchenDelayMs()
                      : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
                  if (isMainPosDevice) {
                    if (shouldAutoPrintReceipt) {
                      logPosPrintDebug('takeout_add_receipt_autoprint_dispatch', {
                        orderId: existingTakeoutId,
                        orderNo: savedOrderNo,
                        receiptItems: receiptPrintItems.length,
                      })
                      void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true)
                    }
                    if (autoPrintKitchenForSubmit && kitchenCartLines.length > 0) {
                      const scheduleKitchen = () => {
                        dispatchDineInAddonKitchenPrint({
                          kitchenCartLines,
                          dedupeKey: buildDineInAddKitchenAutoPrintDedupeKey(
                            existingTakeoutId,
                            kitchenCartLines,
                            { formatNote: formatLineNoteForPrint }
                          ),
                          orderNo: savedOrderNo,
                          storeCode: currentStoreId,
                          tableName: orderLabelFromDb,
                          memo: String(hit!.memo ?? payload.memo ?? '').trim() || undefined,
                          logEvent: 'takeout_add_kitchen_autoprint_dispatch',
                          orderTypeKey: 'takeout',
                        })
                      }
                      setTimeout(
                        scheduleKitchen,
                        shouldAutoPrintReceipt ? kitchenDelayAfterReceiptMs : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
                      )
                    }
                    if (!shouldAutoPrintReceipt && !autoPrintKitchenForSubmit) {
                      setReceiptData({
                        ...receiptPayloadSubmit,
                        receiptAutoPrintContext: 'add_order',
                      })
                    }
                  }
                  const barLabel = translateTakeoutOrderDisplayLabel(orderLabelFromDb, t, {
                    fallbackOrderId: existingTakeoutId,
                  })
                  setPendingTakeoutOrderId(null)
                  setPendingReceiptOrderNo(null)
                  setSelectedTakeoutTargetId(`takeout-order-${existingTakeoutId}`)
                  setSelectedTakeoutTargetLabel(barLabel)
                  clearCartFromTerminal()
                  await refetchCurrentStore()
                  return true
                }
                const linkpos = await runLinkposPaymentIfNeeded(payload.payment)
                if (!linkpos.ok) return false
                const kbankQr = await runKbankQrPaymentIfNeeded(payload.payment, {
                  orderType: payload.orderType,
                  orderLabel: payload.orderLabel,
                })
                const kbankQrPending = !kbankQr.ok && (kbankQr as { qrPending?: boolean }).qrPending === true
                if (!kbankQr.ok && !kbankQrPending) return false
                const kbankPartnerTxnId = String(
                  (kbankQr as { partnerTransactionId?: string }).partnerTransactionId || ''
                ).trim()
                const memoWithKbank = posOrderMemoForPaymentSave(payload.memo, payload.splitReceipts, kbankQr)
                const paymentSumBeforeSave =
                  Math.max(0, Number(payload.payment?.paymentCash ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentCard ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentQr ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentOther ?? 0)) +
                  Math.max(0, Number(payload.payment?.paymentDeliveryApp ?? 0))
                /** QR 대기 중에는 아직 미결제 → '주문 접수(미결제)'로 저장하고 승인 시 마감 */
                const hasPayment = paymentSumBeforeSave > 0.0001 && !kbankQrPending
                const res = await savePosOrderWithOffline({
                  storeCode: currentStoreId,
                  createdBy: auth?.user ?? '',
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  discountAmt: payload.discountAmt ?? 0,
                  discountReason: payload.discountReason ?? '',
                  serviceAmt: payload.serviceAmt ?? 0,
                  serviceReason: payload.serviceReason ?? '',
                  memberId: payload.memberId,
                  memberNo: payload.memberNo,
                  ...posOrderCouponFieldsFromPayload(payload),
                  pointUsed: payload.pointUsed,
                  localOrderNo: posSaveClientKey,
                  items: cartLinesToPosOrderItems(payloadItemsNormalized),
                  ...(payload.orderType === 'delivery' && deliveryApp
                    ? { deliveryAppCode: String(deliveryApp) }
                    : {}),
                  ...posOrderPaymentFieldsFromSnapshot(payload.payment ?? null),
                  linkposPayment: linkpos.linkposPayment,
                  kbankPartnerTransactionId: String(kbankQr.partnerTransactionId || '') || null,
                  pricingAdjustments,
                  ...(hasPayment ? { closeStatus: 'paid' as const } : {}),
                })
                if (!res.success) {
                  const msg = localizeApiMessage(
                    (res as { message?: string }).message,
                    t,
                    t('posOrderSaveFailed') || '주문 저장에 실패했습니다.',
                    lang
                  )
                  await appAlert(msg)
                  return false
                }
                if (hasPayment || kbankQrPending) {
                  capturePaymentReceiptMember(res, {
                    memberId: payload.memberId,
                    memberNo: payload.memberNo,
                    memberTierCode: payload.memberTierCode,
                  })
                }
                const orderNo = (res as { orderNo?: string }).orderNo ?? ''
                const newOrderId = (res as { orderId?: number }).orderId ?? null
                const queued = Boolean((res as { queued?: boolean }).queued)
                const queuedWithoutServerId = queued && !(newOrderId != null && newOrderId > 0)
                await notifyQueuedSave(orderNo, queued)
                const stampPayload = (res as {
                  stamp?: { stamped?: boolean; displayStamps?: number; cardSlots?: number; cardCompleted?: boolean }
                }).stamp
                if (stampPayload?.stamped && payload.memberId) {
                  const stampMsg =
                    (t('posStampEarned') || '스탬프 적립: {current}/{total}').replace(
                      '{current}',
                      String(stampPayload.displayStamps ?? stampPayload.cardSlots ?? '')
                    ).replace('{total}', String(stampPayload.cardSlots ?? '')) +
                    (stampPayload.cardCompleted ? ` · ${t('posStampCardComplete') || '카드 완성'}` : '')
                  void appAlert(stampMsg)
                }
                let queuedLocalOrderNo: string | null =
                  queued && orderNo.startsWith('LOCAL-') ? orderNo : null
                const markQueuedLocalPrintedIfNeeded = () => {
                  if (!queuedLocalOrderNo) return
                  registerLocallyPrintedQueuedOrderNo(queuedLocalOrderNo)
                  queuedLocalOrderNo = null
                }
                let suppressReceiptModalAutoPrint = !isMainPosDevice
                if (newOrderId != null && newOrderId > 0) {
                  if (seenOrderIdsRef.current.has(newOrderId)) suppressReceiptModalAutoPrint = true
                  seenOrderIdsRef.current.add(newOrderId)
                  bumpLastSeenOrderId(newOrderId)
                }
                const subtotal = payloadItemsNormalized.reduce((s, i) => s + i.price * (i.quantity || 1), 0)
                const discountAmt = payload.discountAmt ?? 0
                const pricing = computePosPricing({ subtotal, discountAmt, cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment), adjustments: pricingAdjustments })
                await tryOpenDrawerOnOrderComplete(payload.payment, {
                  skipAutoOpen: Boolean(payload.splitReceipts?.length),
                })
                if (queuedWithoutServerId) {
                  upsertOptimisticOrder({
                    storeCode: currentStoreId,
                    orderNo,
                    orderType: payload.orderType,
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    status: hasPayment ? 'paid' : 'pending',
                    total: pricing.finalTotal,
                    items: payloadItemsNormalized.map((it) => ({
                      id: String(it.id ?? ''),
                      name: String(it.name ?? ''),
                      quantity: resolveCartLineQuantityForSave(it),
                      price: Number(it.price ?? 0),
                      ...(String((it as { menuId?: string }).menuId ?? '').trim()
                        ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                        : {}),
                      ...(String((it as { optionId?: string }).optionId ?? '').trim()
                        ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                        : {}),
                      ...(String((it as { note?: string }).note ?? '').trim()
                        ? { note: String((it as { note?: string }).note).trim() }
                        : {}),
                    })),
                  })
                }
                const receiptItems = cartLinesToPosOrderItems(payloadItemsNormalized)
                const buildNonDineCheckoutPaymentReceipt = (): ReceiptModalData =>
                  buildCheckoutPaymentReceiptModalData({
                    orderNo,
                    storeCode: currentStoreId,
                    orderType: payload.orderType,
                    tableName: payload.orderLabel,
                    memo: memoWithKbank,
                    items: receiptItems,
                    discountAmt: payload.discountAmt,
                    couponDiscountAmt: payload.couponDiscountAmt,
                    discountReason: payload.discountReason,
                    appliedCoupons: payload.appliedCoupons,
                    cardPaymentAmount: resolveCardPaymentAmountForPricing(payload.payment),
                    paymentSum: paymentSumBeforeSave,
                    storedTotal: pricing.finalTotal,
                    adjustments: pricingAdjustments,
                    paymentFields: payload.payment
                      ? receiptPaymentFieldsFromSnapshot(payload.payment)
                      : undefined,
                    deliveryAppCode:
                      payload.orderType === 'delivery' && String(deliveryApp ?? '').trim()
                        ? String(deliveryApp).trim().toLowerCase()
                        : undefined,
                    suppressReceiptModalAutoPrint,
                    serverOrderId: newOrderId ?? undefined,
                  })
                const receiptPayloadSubmit = {
                  orderNo,
                  storeCode: currentStoreId,
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  items: receiptItems,
                  subtotal,
                  discountAmt,
                  couponDiscountAmt: payload.couponDiscountAmt ?? 0,
                  ...posOrderTierDiscountFieldsFromPayload(payload),
                  discountReason: String(payload.discountReason ?? '').trim() || undefined,
                  total: pricing.finalTotal,
                  vatFeeAmt: pricing.vatFeeAmt,
                  vatFeeMode: pricing.vatFeeMode,
                  ...receiptTaxDisplayFieldsFromPricing(pricing),
                  serviceFeeAmt: pricing.serviceFeeAmt,
                  serviceFeeMode: pricing.serviceFeeMode,
                  cardFeeAmt: pricing.cardFeeAmt,
                  cardFeeMode: pricing.cardFeeMode,
                  otherFeeAmt: pricing.otherFeeAmt,
                  otherFeeMode: pricing.otherFeeMode,
                  ...(payload.orderType === 'delivery' && String(deliveryApp ?? '').trim()
                    ? { deliveryAppCode: String(deliveryApp).trim().toLowerCase() }
                    : {}),
                  ...(hasPayment && payload.payment
                    ? receiptPaymentFieldsFromSnapshot(payload.payment)
                    : {}),
                  ...(newOrderId != null && newOrderId > 0
                    ? { _autoPrintDedupeKey: `order:${newOrderId}:hall:auto` }
                    : { _autoPrintDedupeKey: `submit:hall:${orderNo}` }),
                }
                const runKitchenAfterNonDineSubmit = () => {
                  const kitchenPrintKey =
                    newOrderId != null && newOrderId > 0
                      ? `order:${newOrderId}:kitchen`
                      : `submit:${orderNo}:${payload.orderLabel || ''}:${payload.orderType}`
                  if (!reserveKitchenAutoPrintKey(kitchenPrintKey)) return
                  const itemsForKitchen = payloadItemsNormalized.map((i) => {
                    const line = i as {
                      menuId?: string
                      menuId1?: string
                      menu_id1?: string
                      menuId2?: string
                      note?: string
                      promoId?: string
                      promoCode?: string
                      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
                    }
                    const menuId = String(
                      line.menuId ?? line.menuId1 ?? line.menu_id1 ?? line.menuId2 ?? ''
                    ).trim()
                    const note = String(line.note ?? '').trim()
                    const promoId = String(line.promoId ?? '').trim()
                    const promoCode = String(line.promoCode ?? '').trim()
                    return {
                      id: i.id,
                      name: i.name,
                      price: i.price,
                      qty: resolveCartLineQuantityForSave(i as { quantity?: unknown; qty?: unknown }),
                      ...(menuId ? { menuId } : {}),
                      ...(note ? { note } : {}),
                      ...(promoId ? { promoId } : {}),
                      ...(promoCode ? { promoCode } : {}),
                      ...(Array.isArray(line.promoItems) ? { promoItems: enrichPromoItemsWithOptionName(line.promoItems) } : {}),
                    }
                  })
                  getPrinterSettingsForStore(currentStoreId)
                    .then(async (settings) => {
                      const ki = kitchenSlipPrintI18n(settings, lang)
                      const menusForPrint = await resolveMenusForKitchenPrint(
                        itemsForKitchen as Array<Record<string, unknown>>,
                        currentStoreId
                      )
                      const optionNameByCodeForPrint = await resolveOptionNameByCodeForKitchenPrint(
                        itemsForKitchen as Array<Record<string, unknown>>,
                        menusForPrint
                      )
                      const slips = buildKitchenSlipGroups(
                        kitchenItemsWithResolvedPromo(itemsForKitchen as Record<string, unknown>[]) as typeof itemsForKitchen,
                        buildKitchenSlipGroupOpts(settings, menusForPrint, ki.kLabels)
                      )
                      if (!slips.length) return
                      const slipDesign = resolveKitchenSlipDesign(settings)
                      const memoLine = buildPosCustomerMemoLineForPrint(memoWithKbank, ki.t, ki.lang)
                      const tablePartR = payload.orderLabel
                        ? ' · ' + (ki.t('posTable') || '테이블') + ': ' + translateReceiptTableDisplayName(payload.orderLabel, ki.t)
                        : ''
                      const orderTypeLabel = kitchenSlipOrderTypeLabel(
                        {
                          orderType: payload.orderType,
                          tableName: payload.orderLabel,
                          orderNo,
                          memo: memoWithKbank,
                          items: itemsForKitchen,
                        },
                        ki
                      )
                      const printOne = (idx: number) => {
                        if (idx >= slips.length) return
                        const slip = slips[idx]
                        const html = buildKitchenSlipDocumentHtml({
                          label: slip.label,
                          orderNo,
                          storeCode: currentStoreId,
                          orderTypeLabel,
                          tablePart: tablePartR,
                          dateStr: formatPosDateTimeMedium(new Date(), ki.lang),
                          items: kitchenSlipItemsForPrint(
                            slip.items,
                            kitchenItemsWithResolvedPromo(
                              itemsForKitchen as Record<string, unknown>[]
                            ) as KitchenSlipRoutingItem[],
                            ki,
                            menusForPrint,
                            optionNameByCodeForPrint
                          ),
                          memoLine: memoLine || null,
                          escapeHtml,
                          design: slipDesign,
          printerSettings: settings,
                          optionNameByCode: optionNameByCodeForPrint,
                          printColorAdjust: 'exact',
                        })
                        printPosHtmlDocument(html, {
                          title: slip.label,
                          printDelayMs: 0,
                          focusIframeBeforePrint: false,
                          printRole: 'kitchen',
                          kitchenStation: slip.station,
                          escPosCutOverride: resolveEscPosCutOverride(settings, { printRole: 'kitchen' }),
                          onPrintUnavailable: () => {
                            void appAlert(t('posPrintUnavailable'))
                          },
                          onAfterCleanup: () => {
                            if (idx + 1 < slips.length) {
                              setTimeout(() => printOne(idx + 1), resolveBetweenKitchenSlipsDelayMs())
                            }
                          },
                        })
                      }
                      setTimeout(() => printOne(0), 0)
                    })
                    .catch((e) => console.error('Kitchen slip print(non-dine):', e))
                }

                const storeAutoPrintNonDine = isOmniPaymentFastPath
                  ? readStoreAutoPrintFlagsSync()
                  : await resolveStoreAutoPrintFlags(currentStoreId)
                const autoPrintReceiptNonDine = storeAutoPrintNonDine.receiptOnOrder
                const autoPrintReceiptOnPaymentNonDine = storeAutoPrintNonDine.receiptOnPayment
                const autoPrintKitchenNonDine = storeAutoPrintNonDine.kitchenOnOrder
                const kitchenDelayAfterReceiptMs =
                  typeof window !== 'undefined' && window.cmPosShell
                    ? resolveAfterReceiptToKitchenDelayMs()
                    : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS

                if (!hasPayment && isMainPosDevice && !suppressReceiptModalAutoPrint) {
                  if (autoPrintReceiptNonDine && autoPrintKitchenNonDine && payloadItemsNormalized.length > 0) {
                    markQueuedLocalPrintedIfNeeded()
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true, runKitchenAfterNonDineSubmit)
                  } else if (autoPrintReceiptNonDine) {
                    markQueuedLocalPrintedIfNeeded()
                    void printReceiptNow(receiptPayloadSubmit, null, false, undefined, true)
                  } else if (autoPrintKitchenNonDine && payloadItemsNormalized.length > 0) {
                    markQueuedLocalPrintedIfNeeded()
                    setTimeout(runKitchenAfterNonDineSubmit, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
                  } else {
                    setReceiptData({
                      ...receiptPayloadSubmit,
                      receiptAutoPrintContext: 'order',
                      suppressReceiptModalAutoPrint: false,
                    })
                  }
                } else {
                  if (hasPayment) {
                    const splitBatch = makeSplitPaymentReceiptBatch(
                      {
                        orderNo: receiptPayloadSubmit.orderNo,
                        storeCode: receiptPayloadSubmit.storeCode,
                        orderType: receiptPayloadSubmit.orderType,
                        tableName: receiptPayloadSubmit.tableName,
                        memo: receiptPayloadSubmit.memo,
                        discountReason: payload.discountReason,
                        vatFeeMode: receiptPayloadSubmit.vatFeeMode,
                      },
                      payload.splitReceipts,
                      suppressReceiptModalAutoPrint,
                      newOrderId
                    )
                    dispatchCheckoutPaymentReceipt({
                      receiptPayload: buildNonDineCheckoutPaymentReceipt(),
                      splitBatch,
                      orderId: newOrderId,
                    })
                    /** 주문+동시결제: 로컬 저장 직후 seenOrderIds로 Realtime 주방 인쇄가 막히므로 여기서 출력 */
                    if (
                      isMainPosDevice &&
                      !suppressReceiptModalAutoPrint &&
                      autoPrintKitchenNonDine &&
                      payloadItemsNormalized.length > 0
                    ) {
                      markQueuedLocalPrintedIfNeeded()
                      setTimeout(
                        runKitchenAfterNonDineSubmit,
                        autoPrintReceiptOnPaymentNonDine
                          ? kitchenDelayAfterReceiptMs
                          : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
                      )
                    }
                  } else {
                    setReceiptData({
                      ...receiptPayloadSubmit,
                      receiptAutoPrintContext: 'order',
                      suppressReceiptModalAutoPrint,
                    })
                  }
                }
                const refreshNonDineArgs = {
                  orderType: payload.orderType,
                  tableName: payload.orderLabel,
                  memo: memoWithKbank,
                  status: hasPayment ? ('paid' as const) : ('pending' as const),
                  orderNo,
                  serverOrderId: newOrderId,
                  total: pricing.finalTotal,
                  items: payloadItemsNormalized.map((it) => ({
                    id: String(it.id ?? ''),
                    name: String(it.name ?? ''),
                    quantity: resolveCartLineQuantityForSave(it),
                    price: Number(it.price ?? 0),
                    ...(String((it as { menuId?: string }).menuId ?? '').trim()
                      ? { menuId: String((it as { menuId?: string }).menuId).trim() }
                      : {}),
                    ...(String((it as { optionId?: string }).optionId ?? '').trim()
                      ? { optionId: String((it as { optionId?: string }).optionId).trim() }
                      : {}),
                    ...(String((it as { note?: string }).note ?? '').trim()
                      ? { note: String((it as { note?: string }).note).trim() }
                      : {}),
                  })),
                  queuedWithoutServerId,
                }
                if (isOmniPaymentFastPath) {
                  void refreshStoreListAfterOrderSave(refreshNonDineArgs)
                } else {
                  await refreshStoreListAfterOrderSave(refreshNonDineArgs)
                }
                /** 배달·포장「주문」만 저장 시: 목록에서 다시 누르지 않도록 방금 저장한 건 자동 선택 */
                if (payload.orderType === 'delivery') {
                  if (!hasPayment && newOrderId != null && newOrderId > 0) {
                    if (deliveryListMode === 'completed') {
                      setDeliveryListMode('in_progress')
                    }
                    setSelectedDeliveryTargetId(`delivery-order-${newOrderId}`)
                    const lbl =
                      String(payload.orderLabel || '').trim() ||
                      (t('posOrderTypeDelivery') || '배달')
                    setSelectedDeliveryTargetLabel(lbl)
                    const app = detectDeliveryApp(lbl)
                    if (app) setDeliveryApp(app.code)
                    setDeliveryOrderNo(detectDeliveryOrderNo(lbl))
                  } else {
                    setSelectedDeliveryTargetId(null)
                    setSelectedDeliveryTargetLabel('')
                    setDeliveryApp(null)
                    setDeliveryOrderNo('')
                  }
                } else if (payload.orderType === 'takeout') {
                  if (!hasPayment && newOrderId != null && newOrderId > 0) {
                    if (takeoutListMode === 'completed') {
                      setTakeoutListMode('in_progress')
                    }
                    setSelectedTakeoutTargetId(`takeout-order-${newOrderId}`)
                    setSelectedTakeoutTargetLabel(
                      String(payload.orderLabel || '').trim() ||
                        (t('posOrderTypeTakeout') || '포장')
                    )
                  } else {
                    setSelectedTakeoutTargetId(null)
                    setSelectedTakeoutTargetLabel('')
                  }
                }
                if (hasPayment) schedulePostPaymentCustomerQr()
                /** QR 대기 결제: 승인되면 주문을 paid로 마감하고 결제 영수증 발행 */
                if (kbankQrPending && kbankPartnerTxnId) {
                  registerPendingKbankFinalize(kbankPartnerTxnId, () => {
                    void (async () => {
                      if (newOrderId != null && newOrderId > 0) {
                        await applyOrderStatusWithRetry({ id: newOrderId, status: 'paid' })
                      }
                      const splitBatch = makeSplitPaymentReceiptBatch(
                        {
                          orderNo: receiptPayloadSubmit.orderNo,
                          storeCode: receiptPayloadSubmit.storeCode,
                          orderType: receiptPayloadSubmit.orderType,
                          tableName: receiptPayloadSubmit.tableName,
                          memo: receiptPayloadSubmit.memo,
                          discountReason: payload.discountReason,
                          vatFeeMode: receiptPayloadSubmit.vatFeeMode,
                        },
                        payload.splitReceipts,
                        suppressReceiptModalAutoPrint,
                        newOrderId
                      )
                      dispatchCheckoutPaymentReceipt({
                        receiptPayload: buildNonDineCheckoutPaymentReceipt(),
                        splitBatch,
                        orderId: newOrderId,
                      })
                      schedulePostPaymentCustomerQr()
                      await refetchCurrentStore()
                    })()
                  })
                }
                return true
              } catch (e) {
                console.error('savePosOrder(non-dine):', e)
                await appAlert(tr(t, 'posUnexpectedErrorDetail', { detail: String(e) }))
                return false
              } finally {
                posCartBackendBusyRef.current = false
                setPosCartBackendBusy(false)
              }
            }}
          />
  )
  const effectiveAutoPrint = readStoreAutoPrintFlagsSync()
  const effectiveAutoPrintReceiptOnOrder = effectiveAutoPrint.receiptOnOrder
  const effectiveAutoPrintReceiptOnAddOrder = effectiveAutoPrint.receiptOnAddOrder
  const effectiveAutoPrintReceiptOnPayment = effectiveAutoPrint.receiptOnPayment
  const effectiveAutoPrintKitchenSlipOnOrder = effectiveAutoPrint.kitchenOnOrder

  return (
    <PosTourProvider isDemo={isPosDemo} scenarioId={tourScenarioId}>
      <PosTourTerminalManualNextGates
        dineInGuestCount={tourCartGuestCount}
        activeTab={activeTab}
        mainDeviceTouched={tourMainDeviceTouched}
        onMainDeviceTourStepEnter={() => setTourMainDeviceTouched(false)}
      />
      <PosTerminalTourController
        activeTab={activeTab}
        selectedTableId={selectedTableId}
        servingTableId={servingTableId}
        cartLineCount={terminalCartLines.length}
        selectedDeliveryTargetId={selectedDeliveryTargetId}
        selectedTakeoutTargetId={selectedTakeoutTargetId}
        paymentModalOpen={tourPaymentModalOpen}
        paymentTab={tourPaymentTab}
        paymentCardAmount={tourPaymentCardAmount}
        paymentQrAmount={tourPaymentQrAmount}
        paymentDeliveryAppAmount={tourPaymentDeliveryAppAmount}
        paymentOtherAmount={tourPaymentOtherAmount}
        needTaxInvoice={tourTaxInvoiceEnabled}
        paymentCompletedCount={tourPaymentCompletedCount}
        mainDeviceModeChanged={tourMainDeviceTouched}
        servingItemChecked={tourServingItemChecked}
        servingOrderReady={tourServingOrder?.status === 'ready'}
        liveMenuSearchOpen={liveSearchOpen}
      />
      <PosTourOverlay />
      <div className="flex h-full min-h-0 flex-col">
        {isPosDemo && (
          <div
            className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            {t('posDemoBanner')}
          </div>
        )}
        <div className="bg-background flex h-full min-h-0 flex-1 flex-col">
      <POSHeader
        dataTour={isPosDemo ? 'pos-tour-header' : undefined}
        stores={stores}
        currentStoreId={currentStoreId}
        onStoreChange={() => {}}
        onRefresh={refetchCurrentStore}
        todayCompleted={todayCompleted}
        totalSales={totalSales}
        showBackButton
        canChangeStore={false}
        canAccessAdmin={false}
        isMainPosDevice={isMainPosDevice}
        onMainPosDeviceChange={(v) => {
          setTourMainDeviceTouched(true)
          setIsMainPosDevice(v)
        }}
        mainDeviceRoleLocked={mainDeviceMeta.roleLocked}
      />
      <OfflineBanner onSyncComplete={refetchCurrentStore} queueScope="pos_runtime_critical" />
      {kitchenAutoprintNotice ? (
        <div
          role="status"
          className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex items-start gap-2"
        >
          <span className="flex-1 min-w-0 leading-snug">{kitchenAutoprintNotice.text}</span>
          <button
            type="button"
            className="shrink-0 rounded px-1.5 py-0.5 text-amber-900/80 hover:bg-amber-100"
            onClick={() => setKitchenAutoprintNotice(null)}
            aria-label={t('posDialogClose') || '닫기'}
          >
            ×
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          'flex-1 flex min-h-0 min-w-0',
          isNarrowViewport
            ? shouldFullscreenOrderDetailOnNarrow
              ? 'flex-col overflow-hidden'
              : 'flex-col overflow-y-auto'
            : 'flex-row overflow-hidden'
        )}
      >
        <div
          className={cn(
            'min-w-0 flex flex-col',
            isNarrowViewport
              ? shouldFullscreenOrderDetailOnNarrow
                ? 'hidden'
                : 'min-h-0 shrink-0'
              : 'flex-1 min-h-0 overflow-hidden'
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const next = v as 'tables' | 'delivery' | 'takeout'
              if (next !== activeTab) {
                if (terminalCartLines.length > 0) {
                  writePosCartItemsCache(
                    buildTerminalCartSessionKeyForTab(activeTab),
                    terminalCartLines as OrderItem[]
                  )
                }
                const prevTableId = selectedTableId
                clearCartFromTerminal()
                setPendingDineInOrderId(null)
                pendingDineInOrderTableRef.current = ''
                if (next === 'tables') {
                  setSelectedTableId(null)
                  setServingTableId(null)
                } else if (next === 'delivery') {
                  setSelectedDeliveryTargetId(null)
                  setSelectedDeliveryTargetLabel('')
                  setDeliveryApp(null)
                  setDeliveryOrderNo('')
                } else if (next === 'takeout') {
                  setSelectedTakeoutTargetId(null)
                  setSelectedTakeoutTargetLabel('')
                }
                setActiveTab(next)
                if (next === 'tables' && prevTableId) {
                  const dineInKey = getPosCartSessionKey({
                    currentStoreId,
                    orderType: 'dine-in',
                    selectedTableId: prevTableId,
                    deliveryApp: null,
                    deliveryOrderNo: null,
                    takeoutLabel: null,
                  })
                  const restoredDineIn = readPosCartItemsCache(dineInKey)
                  if (restoredDineIn.length > 0) {
                    setSelectedTableId(prevTableId)
                    setTerminalCartLines(restoredDineIn as OrderItem[])
                    return
                  }
                }
                const restored = readPosCartItemsCache(buildTerminalCartSessionKeyForTab(next))
                if (restored.length > 0) {
                  setTerminalCartLines(restored as OrderItem[])
                }
                return
              }
              setActiveTab(next)
            }}
            className="flex-1 min-w-0 flex flex-col min-h-0"
          >
            <div className={cn(
              "border-b border-border bg-card px-2 sm:px-4 shrink-0",
              isNarrowViewport && "sticky top-0 z-10"
            )}>
              <div className="flex h-12 min-[640px]:h-10 min-h-[44px] min-w-0 flex-nowrap items-center justify-between gap-1 min-[640px]:gap-2">
                {/* 좁은 화면에서 오른쪽 필터와 한 줄에 두면 탭이 flex로 압축되어 사라진 것처럼 보일 수 있음 → 가로 스크롤 */}
                <div className="min-h-[44px] min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsList
                    className="inline-flex h-12 min-[640px]:h-10 min-h-[44px] w-max min-w-0 flex-nowrap bg-transparent p-0"
                    data-tour="pos-tour-tabs-all"
                  >
                  <TabsTrigger
                    value="tables"
                    data-tour="pos-tour-tab-tables"
                    title={t('posTableStatus')}
                    aria-label={t('posTableStatus')}
                    className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <LayoutGrid className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posTableStatus')}</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="delivery"
                    data-tour="pos-tour-tab-delivery"
                    title={
                      deferredIncomingDeliveryCount > 0
                        ? (t('posIncomingDeliveryDeferredTabHint') || '배달 ({{count}}건 결제 중 대기)').replace(
                            '{{count}}',
                            String(deferredIncomingDeliveryCount)
                          )
                        : t('posOrderTypeDelivery') || '배달'
                    }
                    aria-label={
                      deferredIncomingDeliveryCount > 0
                        ? (t('posIncomingDeliveryDeferredTabHint') || '배달 ({{count}}건 결제 중 대기)').replace(
                            '{{count}}',
                            String(deferredIncomingDeliveryCount)
                          )
                        : t('posOrderTypeDelivery') || '배달'
                    }
                    className="relative shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <Bike className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeDelivery') || '배달'}</span>
                    {deferredIncomingDeliveryCount > 0 ? (
                      <span className="absolute -top-1 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                        {deferredIncomingDeliveryCount > 9 ? '9+' : deferredIncomingDeliveryCount}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="takeout"
                    data-tour="pos-tour-tab-takeout"
                    title={t('posOrderTypeTakeout') || '포장'}
                    aria-label={t('posOrderTypeTakeout') || '포장'}
                    className="shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1 min-[640px]:gap-2 px-3 min-[640px]:px-4 min-h-[44px] touch-manipulation"
                  >
                    <Package className="w-4 h-4 shrink-0" />
                    <span className="hidden min-[640px]:inline">{t('posOrderTypeTakeout') || '포장'}</span>
                  </TabsTrigger>
                  </TabsList>
                </div>
                {/* 오른쪽 영역: 탭별 필터(준비중/결제완료/전체) + 실시간 메뉴 검색 — 배달/포장/테이블 동일 UI, 밑줄 정렬 */}
                <div
                  className="flex shrink-0 items-center gap-1 min-[640px]:gap-2 justify-end self-stretch min-h-0 min-[640px]:w-44"
                  data-tour="pos-tour-toolbar-filters"
                >
                  {activeTab === 'tables' && (
                    <Select
                      value={tableListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => setTableListMode(v)}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === 'delivery' && (
                    <Select
                      value={deliveryListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all') => {
                        setDeliveryListMode(v)
                        setSelectedDeliveryTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === 'takeout' && (
                    <Select
                      value={takeoutListMode}
                      onValueChange={(v: 'in_progress' | 'completed' | 'all' | 'member_portal') => {
                        setTakeoutListMode(v)
                        setSelectedTakeoutTargetId(null)
                      }}
                    >
                      <SelectTrigger className="h-9 w-20 min-[640px]:h-8 min-[640px]:w-28 shrink-0 touch-manipulation rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">{t('posFilterPreparing')}</SelectItem>
                        <SelectItem value="completed">{t('posFilterComplete')}</SelectItem>
                        <SelectItem value="member_portal">{t('posFilterMemberPortal') || '회원앱'}</SelectItem>
                        <SelectItem value="all">{t('posStatusAll')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 min-[640px]:h-8 gap-1.5 px-2 min-[640px]:px-3 touch-manipulation shrink-0 rounded-md"
                    onClick={() => setLiveSearchOpen(true)}
                    title={t('posLiveMenuSearch') || '실시간 메뉴 검색'}
                    data-tour={isPosDemo ? 'pos-tour-live-menu-search' : undefined}
                  >
                    <Search className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden min-[500px]:inline">{t('posLiveMenuSearch') || '실시간 메뉴 검색'}</span>
                  </Button>
                </div>
              </div>
            </div>
            {activeTab === 'delivery' && (
              <div className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0">
                <div
                  className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap"
                  data-tour={isPosDemo ? 'pos-tour-delivery-order-draft' : undefined}
                >
                {effectiveDeliveryApps.map((app) => (
                  <Button
                    key={app.id}
                    variant={deliveryApp === app.id ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => setDeliveryApp(app.id)}
                  >
                    {app.name}
                  </Button>
                ))}
                <div
                  className="flex min-w-0 flex-wrap items-center gap-2 min-[640px]:gap-2"
                >
                  <span className="text-sm font-medium text-muted-foreground shrink-0">
                    {t('posDeliveryOrderNo') || '주문 번호'}
                  </span>
                  <Input
                    type="text"
                    placeholder={t('posDeliveryOrderNoPh') || '배달 플랫폼 주문번호'}
                    value={deliveryOrderNo}
                    onChange={(e) => setDeliveryOrderNo(e.target.value)}
                    onFocus={scrollIntoViewOnFocus}
                    className="h-8 w-32 max-w-full text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => {
                      if (!deliveryApp) return
                      const orderNo = deliveryOrderNo.trim()
                      if (!orderNo) return
                      setSelectedDeliveryTargetId('delivery-draft')
                      const appLabelEn = effectiveDeliveryApps.find((a) => a.id === deliveryApp)?.name ?? deliveryApp
                      setSelectedDeliveryTargetLabel(`${appLabelEn} #${orderNo}`)
                    }}
                    disabled={!deliveryApp || !deliveryOrderNo.trim()}
                  >
                    + {t('posNewOrder') || '새 주문'}
                  </Button>
                </div>
                {grabDeliveryHintVisible ? (
                  <p className="text-xs text-muted-foreground">
                    {t('posGrabManualDeliveryHint') ||
                      'Grab: 자동 수신 주문은 배달 목록에서 선택하세요. GF 번호는 재사용될 수 있습니다.'}
                  </p>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    if (selectedDeliveryOrder) {
                      const label = String(selectedDeliveryOrder.customerName || '').trim() || ''
                      const no = detectDeliveryOrderNo(label)
                      setDeliveryEditOrderNoValue(no)
                      setDeliveryEditOrderNoOpen(true)
                    }
                  }}
                  disabled={!selectedDeliveryOrder}
                >
                  {t('posEditOrderNo') || '수정'}
                </Button>
                </div>
              </div>
            )}
            {activeTab === 'takeout' && (
              <div
                className="px-2 min-[640px]:px-4 py-2 border-b border-border bg-card flex flex-col gap-2 shrink-0"
                data-tour="pos-tour-takeout-toolbar"
              >
                <div
                  className="flex items-center gap-2 min-[640px]:gap-3 flex-wrap"
                  data-tour={isPosDemo ? 'pos-tour-takeout-slots' : undefined}
                >
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((slotNo) => (
                    <Button
                      key={slotNo}
                      variant={takeoutMode === 'slot' && takeoutSlot === String(slotNo) ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setTakeoutMode('slot')
                        setTakeoutSlot(String(slotNo))
                        void requestTakeoutFreshDraft(formatTakeoutSlotLabel(String(slotNo)))
                      }}
                    >
                      {formatTakeoutSlotLabel(String(slotNo))}
                    </Button>
                  ))}
                  <span className="text-sm font-medium text-muted-foreground ml-2">{t('posTakeoutMemberName') || '회원 이름'}</span>
                  <Input
                    type="text"
                    placeholder={t('posTakeoutMemberNamePh') || '회원 이름 입력'}
                    value={takeoutMemberName}
                    onChange={(e) => {
                      const v = e.target.value
                      setTakeoutMemberName(v)
                      setTakeoutMode(v.trim() ? 'member' : 'slot')
                      setPendingTakeoutOrderId(null)
                    }}
                    onFocus={(e) => {
                      scrollIntoViewOnFocus(e)
                      if (takeoutMemberName.trim()) setTakeoutMode('member')
                    }}
                    list="takeout-member-history"
                    className="h-8 w-32 max-w-full text-sm"
                  />
                  <datalist id="takeout-member-history">
                    {filteredTakeoutMembers.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <Button
                    size="sm"
                    className="h-8"
                    data-tour="pos-tour-takeout-new"
                    onClick={() => {
                      void requestTakeoutFreshDraft(baseTakeoutLabel)
                    }}
                  >
                    + {t('posNewOrder') || '새 주문'}
                  </Button>
                </div>
              </div>
            )}

            {/* 테이블 현황 탭: 테이블 선택 전 = 플로어 뷰, 선택 후 = 메뉴 화면. 장바구니는 우측(넓음)/하단(좁음) 패널에 단일로 표시 */}
            <TabsContent value="tables" className="flex-1 m-0 p-4 min-h-0 min-w-0 flex flex-col">
              {selectedTableId ? (
                <div
                  className={cn(
                    'flex-1 min-h-0 overflow-hidden',
                    !isNarrowViewport && 'min-h-[260px]'
                  )}
                >
                  <PosBusinessOpenGateBlock
                    blocked={businessOpenBlocked}
                    loading={businessOpenGate.loading}
                    businessDateYmd={businessOpenGate.businessDateYmd}
                    blockReason={businessOpenGate.blockReason}
                    prevBusinessDateYmd={businessOpenGate.prevBusinessDateYmd}
                    className="h-full"
                  >
                    <PosTerminalMenuScreen
                      mode="pos-order"
                      storeCode={currentStoreId}
                      parentCatalog={terminalParentCatalog}
                      selectedTableName={
                        selectedTable?.name
                          ? translateReceiptTableDisplayName(selectedTable.name, t)
                          : String(selectedTableId ?? '')
                      }
                      onBack={() => {
                        setSelectedTableId(null)
                        clearCartFromTerminal()
                        setPendingDineInOrderId(null)
                        pendingDineInOrderTableRef.current = ''
                      }}
                      hideTableContextBar
                      onAddItem={handleAddItemToCart}
                      orderType="dine-in"
                      showMenuDescriptions={showGuestMenuDescriptions}
                      touchMode={isNarrowViewport ? 'large' : 'default'}
                      containMenuHeight={isNarrowViewport}
                      className="h-full"
                    />
                  </PosBusinessOpenGateBlock>
                </div>
              ) : (
                <>
                  {loadingTables && (
                    <div className="h-full flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm min-h-[min(420px,50vh)]">
                      {t('loading')}
                    </div>
                  )}
                  {(!loadingTables && floorLayoutForView.length > 0) && (
                    <div
                      className="flex h-full min-h-[min(420px,50vh)] min-w-0 justify-center"
                      data-tour="pos-tour-floor"
                    >
                      <TableFloorWithW13dTimeTour
                        isPosDemo={isPosDemo}
                        layout={floorLayoutForView}
                        className="w-full max-w-[720px] h-full min-h-[min(420px,50vh)]"
                        displayScale={1}
                        tableListMode={tableListMode}
                        gridCols={30}
                        gridRows={20}
                        getTableStatus={(id, name) => {
                          const byId = currentStore?.tables.find((t) => t.id === id)
                          const byName =
                            byId ??
                            currentStore?.tables.find((t) => {
                              if (t.name !== name) return false
                              // 동일 이름 테이블이 층마다 있는 매장에서는 이름 fallback을 금지해
                              // 다른 층 점유가 잘못 표시되는 문제를 막는다.
                              const sameNameCount = (currentStore?.tables || []).filter((x) => x.name === name).length
                              return sameNameCount <= 1
                            })
                          const tbl = byName
                          const order =
                            demoDineInOrder?.tableId === id ? demoDineInOrder.order : tbl?.order
                          if (!order) {
                            const demoVisual = demoTableVisualStatusById.get(id)
                            if (demoVisual) {
                              return {
                                status: demoVisual.status,
                                createdAt: demoVisual.createdAt,
                                targetMin: demoVisual.status === 'preparing' ? 12 : 0,
                                guestCount: demoVisual.guestCount,
                              }
                            }
                            return null
                          }
                          const items = Array.isArray(order.items) ? order.items : []
                          const servedCount = items.filter((item) => Boolean(item.servedAt)).length
                          const allServed = items.length > 0 && servedCount >= items.length
                          const status: 'preparing' | 'partial_served' | 'completed' =
                            (order.status === 'completed' || (order.status === 'ready' && allServed))
                              ? 'completed'
                              : servedCount > 0
                                ? 'partial_served'
                                : 'preparing'
                          const getItemTarget = (item: { id?: string; name?: string }) => {
                            const rawId = String(item.id || '').trim()
                            const rawName = String(item.name || '').trim()
                            const normalizedId = rawId.replace(/^cart-existing-\d+-/, '')
                            const idKey = normalizedId.split('-')[0]
                            if (idKey && menuTargets.byId.has(idKey)) return menuTargets.byId.get(idKey) || 0
                            const mainName = rawName.replace(/\s*\(.+\)\s*$/, '').trim()
                            if (mainName && menuTargets.byName.has(mainName)) return menuTargets.byName.get(mainName) || 0
                            return 0
                          }
                          const targetMin = status === 'preparing'
                            ? Math.max(
                                0,
                                ...items.map((it) => getItemTarget({ id: String(it.id || ''), name: String(it.name || '') }))
                              )
                            : 0
                          const createdAt = order.createdAt
                            ? (order.createdAt instanceof Date
                                ? order.createdAt.toISOString()
                                : String(order.createdAt))
                            : undefined
                          const guestCount = Math.max(0, Math.trunc(Number(order.guestCount ?? 0) || 0))
                          return { status, createdAt, targetMin, guestCount: guestCount > 0 ? guestCount : undefined }
                        }}
                        selectedTableId={selectedTableId ?? servingTableId}
                        onTableSelect={handleTableSelect}
                        activeFloor={activeFloor}
                        onFloorChange={setActiveFloor}
                        floorLabels={currentFloorLabels}
                        t={t}
                        freshMaxMin={cookingRules.freshMaxMin}
                        warningMaxMin={cookingRules.warningMaxMin}
                        ruleMode={cookingRules.mode}
                        recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                        recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                        delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                        delaySoundEnabled={cookingRules.delaySoundEnabled}
                        delayAlertOverMin={cookingRules.delayAlertOverMin}
                      />
                    </div>
                  )}
                  {!loadingTables && floorLayoutForView.length === 0 && currentStore && (
                    <div className="h-full min-h-[280px] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm p-4 text-center">
                      {t('posTableLayoutEmpty') || '이 매장에 테이블이 없습니다. 관리자 > POS 설정 > 테이블 구성에서 배치해 주세요.'}
                    </div>
                  )}
                  {!loadingTables && !currentStore && stores.length === 0 && (
                    <div className="h-full min-h-[min(280px,35vh)] flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground text-sm">
                      {t('posTableLayoutEmpty') || '매장/테이블 배치를 관리자 페이지에서 설정해 주세요.'}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* 배달 탭: 새 주문(draft)일 때만 메뉴 화면, 기존 주문 선택 시 목록 유지 */}
            {/* min-h 고정 금지: 뷰포트보다 크면 부모 overflow-hidden에 하단이 잘려 메뉴 끝까지 스크롤 불가(배달·포장 메뉴). 주문 바 목록은 OrderBarList min-h 유지 */}
            <TabsContent value="delivery" className="flex-1 m-0 min-w-0 p-4 min-h-0 overflow-auto">
              {selectedDeliveryTargetId === 'delivery-draft' ? (
                <PosBusinessOpenGateBlock
                  blocked={businessOpenBlocked}
                  loading={businessOpenGate.loading}
                  businessDateYmd={businessOpenGate.businessDateYmd}
                  blockReason={businessOpenGate.blockReason}
                  prevBusinessDateYmd={businessOpenGate.prevBusinessDateYmd}
                  className="h-full"
                >
                  <PosTerminalMenuScreen
                    mode="pos-order"
                    storeCode={currentStoreId}
                    parentCatalog={terminalParentCatalog}
                    selectedTableName={selectedDeliveryTargetLabel || (t('posOrderTypeDelivery') || '배달')}
                    onBack={() => setSelectedDeliveryTargetId(null)}
                    backButtonLabel={t('posBack') || '뒤로가기'}
                    onAddItem={handleAddItemToCart}
                    orderType="delivery"
                    deliveryAppCode={deliveryApp || null}
                    touchMode={isNarrowViewport ? 'large' : 'default'}
                    containMenuHeight={isNarrowViewport}
                    className="h-full"
                  />
                </PosBusinessOpenGateBlock>
              ) : (
                <OrderBarList
                  items={currentDeliveryBarItems}
                  className="min-h-[600px]"
                  t={t}
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  usePackagingLabel
                  selectedId={selectedDeliveryTargetId}
                  onSelect={(id) => {
                    const selected = currentDeliveryBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedDeliveryTargetId && selectedDeliveryTargetId !== id) {
                      clearCartFromTerminal()
                    }
                    setSelectedDeliveryTargetId(id)
                    setSelectedDeliveryTargetLabel(selected.label || (t('posOrderTypeDelivery') || '배달'))
                    const app = detectDeliveryApp([selected.label, selected.rightLabel || ''].join(' '))
                    if (app) setDeliveryApp(app.code)
                    const parsedNo = detectDeliveryOrderNo([selected.label, selected.rightLabel || ''].join(' '))
                    setDeliveryOrderNo(parsedNo)
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>

            {/* 포장 탭 — 배달 TabsContent와 동일(고정 min-h 없음) */}
            <TabsContent value="takeout" className="flex-1 m-0 min-w-0 p-4 min-h-0 overflow-auto">
              {selectedTakeoutTargetId === 'takeout-draft' ? (
                <PosBusinessOpenGateBlock
                  blocked={businessOpenBlocked}
                  loading={businessOpenGate.loading}
                  businessDateYmd={businessOpenGate.businessDateYmd}
                  blockReason={businessOpenGate.blockReason}
                  prevBusinessDateYmd={businessOpenGate.prevBusinessDateYmd}
                  className="h-full"
                >
                  <PosTerminalMenuScreen
                    mode="pos-order"
                    storeCode={currentStoreId}
                    parentCatalog={terminalParentCatalog}
                    selectedTableName={`${t('posOrderTypeTakeout') || '포장'} · ${takeoutLabel}`}
                    onBack={() => {
                      const pendingOid = pendingTakeoutOrderId
                      if (pendingOid) {
                        setPendingTakeoutOrderId(null)
                        setPendingReceiptOrderNo(null)
                        clearCartFromTerminal()
                        setSelectedTakeoutTargetId(`takeout-order-${pendingOid}`)
                        return
                      }
                      setSelectedTakeoutTargetId(null)
                    }}
                    backButtonLabel={t('posBack') || '뒤로가기'}
                    onAddItem={handleAddItemToCart}
                    orderType="takeout"
                    touchMode={isNarrowViewport ? 'large' : 'default'}
                    containMenuHeight={isNarrowViewport}
                    className="h-full"
                  />
                </PosBusinessOpenGateBlock>
              ) : (
                <OrderBarList
                  items={currentTakeoutBarItems}
                  className="min-h-[600px]"
                  t={t}
                  touchMode={isNarrowViewport ? 'large' : 'default'}
                  usePackagingLabel
                  selectedId={selectedTakeoutTargetId}
                  onSelect={(id) => {
                    const selected = currentTakeoutBarItems.find((item) => item.id === id)
                    if (!selected) return
                    if (selectedTakeoutTargetId && selectedTakeoutTargetId !== id) {
                      clearCartFromTerminal()
                    }
                    setSelectedTakeoutTargetId(id)
                    setSelectedTakeoutTargetLabel(selected.label)
                  }}
                  freshMaxMin={cookingRules.freshMaxMin}
                  warningMaxMin={cookingRules.warningMaxMin}
                  ruleMode={cookingRules.mode}
                  recipeWarningDiffMin={cookingRules.recipeWarnDiff}
                  recipeUrgentDiffMin={cookingRules.recipeUrgentDiff}
                  delayBadgeEnabled={cookingRules.delayBadgeEnabled}
                  delayAlertOverMin={cookingRules.delayAlertOverMin}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
        {showSidePanel && (() => {
          const dineInTableOrderPanel = servingTable?.order ? (
            <TableOrderPanel
              tableName={servingTable.name}
              order={servingTable.order}
              storeCode={currentStoreId}
              menus={menus}
              allTables={currentStore?.tables ?? []}
              takeoutMergePeers={takeoutMergePeerTables}
              isDemo={isPosDemo}
              addOrderModeActive={isDineInAddOrderMode}
              onDemoOrderReplace={
                isPosDemo && demoDineInOrder?.tableId === servingTableId && servingTableId
                  ? (next) => setDemoDineInOrder({ tableId: servingTableId, order: next })
                  : undefined
              }
              onServed={refetchCurrentStore}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'dine_in', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'dine_in', detail)
                    }
              }
              onAfterTableTransfer={
                isPosDemo
                  ? undefined
                  : async (keepOrderId) => {
                      await runAfterTableTransferHallReprint(keepOrderId)
                    }
              }
              onBeforeTableMerge={
                isPosDemo
                  ? undefined
                  : (keepOrderId) => {
                      mainPosSelfDineInUpdateSuppressUntilRef.current.set(
                        keepOrderId,
                        Date.now() + 15_000
                      )
                    }
              }
              onBeforeTableMove={
                isPosDemo
                  ? undefined
                  : (orderId) => {
                      mainPosSelfDineInUpdateSuppressUntilRef.current.set(
                        orderId,
                        Date.now() + 15_000
                      )
                    }
              }
              onTableMovedFrom={
                isPosDemo ? undefined : (sourceTableName) => clearTableOrder(currentStoreId, sourceTableName)
              }
              onAddOrder={() => {
                if (!servingTableId) return
                clearCartFromTerminal()
                if (servingTable?.order?.id != null) {
                  const sid = Number(servingTable.order.id)
                  if (Number.isFinite(sid) && sid > 0) {
                    setPendingDineInOrderId(sid)
                    pendingDineInOrderTableRef.current = String(servingTable?.name ?? '').trim()
                  }
                }
                setSelectedTableId(servingTableId)
              }}
              onPay={() => {
                if (isPosDemo && demoDineInOrder?.tableId === servingTableId) {
                  void appAlert(t('posDemoTablePaySkipped') || '')
                  return
                }
                if (!servingTableId || !servingTable?.order) return
                setPendingDineInOrderId(Number(servingTable.order.id))
                pendingDineInOrderTableRef.current = String(servingTable?.name ?? '').trim()
                setPendingReceiptOrderNo(servingTable.order.orderNo ?? null)
                setPendingPayRequest({
                  tableName: servingTable.name,
                  existingOrderId: Number(servingTable.order.id),
                  items: servingTable.order.items.map((item) => {
                    const menuId = String(item.menuId ?? item.menuId1 ?? '').trim()
                    return {
                      id: item.id,
                      name: item.name,
                      price: item.price,
                      quantity: item.quantity,
                      ...(menuId ? { menuId } : {}),
                      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                    }
                  }),
                  orderNo: servingTable.order.orderNo,
                  orderDiscount: posOrderToCheckoutDiscountSnapshot({
                    ...servingTable.order,
                    items: servingTable.order.items,
                  }),
                  orderMember: posOrderToCheckoutMemberSnapshot(servingTable.order),
                  orderMemo: servingTable.order.memo,
                })
                setServingTableId(null)
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(servingTable?.order)}
              onLeaveTable={async () => {
                if (!servingTable?.order || !servingTable?.name) return
                clearTableOrder(currentStoreId, servingTable.name)
                setServingTableId(null)
                await refetchCurrentStore()
              }}
              onCancel={refetchCurrentStore}
              onOrderDismissed={dismissTerminalOrder}
              onClose={() => {
                setServingTableId(null)
                setDemoDineInOrder(null)
              }}
              t={t}
            />
          ) : null
          const panelContent = activeTab === 'delivery' && selectedDeliveryOrder ? (
            <DeliveryOrderPanel
              orderLabel={selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id)}
              menus={menus}
              menuOptions={menuOptions}
              promos={promosWithItems}
              deliveryApps={deliveryAppsFromApi}
              order={selectedDeliveryOrder}
              onPackaged={() => refetchStores({ scope: 'all' })}
              onAccepted={async (params) => {
                await runAutoPrintForAcceptedDeliveryOrder(params)
              }}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'delivery', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'delivery', detail)
                    }
              }
              onCancel={refetchCurrentStore}
              onOrderDismissed={dismissTerminalOrder}
              storeCode={currentStoreId}
              onPay={() => {
                if (!selectedDeliveryOrder) return
                setPendingDeliveryOrderId(Number(selectedDeliveryOrder.id))
                setPendingReceiptOrderNo(selectedDeliveryOrder.orderNo ?? null)
                setPendingDeliveryPayRequest({
                  tableName: selectedDeliveryTargetLabel || selectedDeliveryOrder.customerName || String(selectedDeliveryOrder.id),
                  items: selectedDeliveryOrder.items.map((item) => ({
                    id: item.id,
                    name: resolveOrderItemDisplayName({
                      id: item.id,
                      name: item.name,
                      menuId: item.menuId,
                    }),
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.menuId ? { menuId: item.menuId } : {}),
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedDeliveryOrder.orderNo,
                  orderDiscount: posOrderToCheckoutDiscountSnapshot({
                    ...selectedDeliveryOrder,
                    items: selectedDeliveryOrder.items,
                  }),
                  orderMember: posOrderToCheckoutMemberSnapshot(selectedDeliveryOrder),
                  orderMemo: selectedDeliveryOrder.memo,
                })
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(selectedDeliveryOrder)}
              onClose={() => {
                setSelectedDeliveryTargetId(null)
                setSelectedDeliveryTargetLabel('')
                setDeliveryApp(null)
                setDeliveryOrderNo('')
              }}
              t={t}
            />
          ) : activeTab === 'tables' && servingTable?.order ? (
            isDineInAddOrderMode ? (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="min-h-0 flex-1 overflow-hidden">
                  {renderTerminalCartPanel('side-panel')}
                </div>
                <div
                  className={cn(
                    'min-h-0 overflow-hidden border-t border-border',
                    isNarrowViewport ? 'max-h-[46%] shrink-0' : 'flex-1'
                  )}
                >
                  {dineInTableOrderPanel}
                </div>
              </div>
            ) : (
              dineInTableOrderPanel
            )
          ) : activeTab === 'takeout' && selectedTakeoutOrder ? (
            <TakeoutOrderPanel
              orderLabel={resolveTakeoutOrderBarLabel(selectedTakeoutOrder)}
              order={selectedTakeoutOrder}
              storeCode={currentStoreId}
              menus={menus}
              onPackaged={() => refetchStores({ scope: 'all' })}
              onAfterPartialLineRemoved={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterPartialLineCancelPrints(orderId, 'takeout', detail)
                    }
              }
              onAfterFullOrderKitchenReprint={
                isPosDemo
                  ? undefined
                  : async (orderId, detail) => {
                      await runAfterFullOrderCancelKitchenPrints(orderId, 'takeout', detail)
                    }
              }
              onCancel={refetchCurrentStore}
              onOrderDismissed={dismissTerminalOrder}
              onAddOrder={() => {
                if (!selectedTakeoutOrder) return
                if (isPosOrderPaidLikeStatus(String(selectedTakeoutOrder.status ?? ''))) return
                if (orderPaymentsSum(selectedTakeoutOrder) > 0.005) return
                enterTakeoutAddOrderMode(selectedTakeoutOrder)
              }}
              onPay={() => {
                if (!selectedTakeoutOrder) return
                setPendingTakeoutOrderId(Number(selectedTakeoutOrder.id))
                setPendingReceiptOrderNo(selectedTakeoutOrder.orderNo ?? null)
                setPendingTakeoutPayRequest({
                  tableName: resolveTakeoutOrderBarLabel(selectedTakeoutOrder),
                  items: selectedTakeoutOrder.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    ...(item.menuId ? { menuId: item.menuId } : {}),
                    ...(item.note?.trim() ? { note: item.note.trim() } : {}),
                  })),
                  orderNo: selectedTakeoutOrder.orderNo,
                  orderDiscount: posOrderToCheckoutDiscountSnapshot({
                    ...selectedTakeoutOrder,
                    items: selectedTakeoutOrder.items,
                  }),
                  orderMember: posOrderToCheckoutMemberSnapshot(selectedTakeoutOrder),
                  orderMemo: selectedTakeoutOrder.memo,
                })
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              onOpenTaxInvoice={() => openTaxInvoiceEditorForOrder(selectedTakeoutOrder)}
              onClose={() => {
                setSelectedTakeoutTargetId(null)
                setSelectedTakeoutTargetLabel('')
              }}
              t={t}
            />
          ) : renderTerminalCartPanel('side-panel');
          return (
            <div
              className={cn(
                'flex-shrink-0 overflow-hidden flex flex-col border-border bg-card',
                isNarrowViewport
                  ? shouldFullscreenOrderDetailOnNarrow
                    ? 'flex-1 min-h-0 border-t'
                    : isDineInAddOrderMode
                      ? 'flex-1 min-h-0 border-t'
                      : 'border-t min-h-[180px] max-h-[50vh]'
                  : 'w-72 border-l min-h-0'
              )}
            >
              {panelContent}
            </div>
          )
        })()}
      </div>
      <PosTerminalDialogs
        t={t}
        tPrint={tPrint}
        isPosDemo={isPosDemo}
        taxInvoice={{
          targetOrder: taxInvoiceTargetOrder,
          onDismiss: () => {
            setTaxInvoiceTargetOrder(null)
            setTaxInvoiceSaving(false)
            setTaxSearchLoading(false)
            setTaxSearchRows([])
            setTaxSearchMessage('')
          },
          saving: taxInvoiceSaving,
          searchField: taxSearchField,
          onSearchFieldChange: setTaxSearchField,
          searchKeyword: taxSearchKeyword,
          onSearchKeywordChange: setTaxSearchKeyword,
          searchLoading: taxSearchLoading,
          searchRows: taxSearchRows,
          searchMessage: taxSearchMessage,
          onSearch: handleTaxRecipientSearch,
          onApplyProfile: applyTaxInvoiceProfile,
          branchRequired: taxBranchRequired,
          formErrors: taxFormErrors,
          customerType: tiCustomerType,
          onCustomerTypeChange: setTiCustomerType,
          memberNo: tiMemberNo,
          onMemberNoChange: setTiMemberNo,
          name: tiName,
          onNameChange: setTiName,
          taxId: tiTaxId,
          onTaxIdChange: setTiTaxId,
          branchNo: tiBranchNo,
          onBranchNoChange: setTiBranchNo,
          phone: tiPhone,
          onPhoneChange: setTiPhone,
          email: tiEmail,
          onEmailChange: setTiEmail,
          address: tiAddress,
          onAddressChange: setTiAddress,
          onSave: handleSaveTaxInvoiceForOrder,
        }}
        kbankOutcome={{
          state: kbankOutcomeState,
          onOpenChange: (open) => {
            if (!open) setKbankOutcomeState(null)
          },
          onViewAllOrders: () => {
            setActiveTab('tables')
            setSelectedDeliveryTargetId(null)
            setSelectedDeliveryTargetLabel('')
            setSelectedTakeoutTargetId(null)
            setSelectedTakeoutTargetLabel('')
          },
          onCreateNewQr: () => {
            clearKbankQrSession()
          },
        }}
        kbankStaffMonitor={{
          visible: showKbankStaffMonitor,
          tourAttr: isPosDemo ? 'pos-tour-kbank-qr-preview' : undefined,
          liveQrPayload: liveKbankQrPayload,
          callbackState: kbankCallbackState,
          effectiveQrAmount: effectiveStaffKbankQrAmount,
          effectiveQrType: effectiveCustomerDisplayQrType,
          qrTypeLabel: staffKbankQrTypeLabel,
          sentQrTypeCode: kbankSentQrTypeCode,
          linkposQrBridgeStatus: linkposQrBridgeStatus,
          generateAuditText: kbankGenerateAuditText,
          effectiveStaffQrPayload: effectiveStaffKbankQrPayload,
          opsTxnUid: kbankOpsTxnUid,
          opsOrigTxnUid: kbankOpsOrigTxnUid,
          opsTxnNo: kbankOpsTxnNo,
          onOpsTxnNoChange: setKbankOpsTxnNo,
          opsTerminalId: kbankOpsTerminalId,
          onOpsTerminalIdChange: setKbankOpsTerminalId,
          opsBusy: kbankOpsBusy,
          opsLastResult: kbankOpsLastResult,
          apiPausedUntilMs: kbankApiPausedUntilMs,
          isPilotStore: isKbankPilotStore,
          onFollowupAction: runKbankFollowupAction,
          onClearSession: clearKbankQrSession,
        }}
        liveMenuSearch={{
          open: liveSearchOpen,
          onOpenChange: setLiveSearchOpen,
          storeCode: currentStoreId,
          onServedUpdated: refetchCurrentStore,
        }}
        postPaymentCashChange={{
          amountBaht: postPaymentCashChangeBaht,
          onDismiss: () => setPostPaymentCashChangeBaht(null),
        }}
        receipt={{
          data: receiptData,
          onOpenChange: (open) => {
            if (open) return
            if (receiptData?.suppressReceiptModalAutoPrint) {
              setReceiptData(null)
              return
            }
            flushNextReceiptQueue()
          },
          onSuppressDismiss: () => setReceiptData(null),
          onAutoPrintComplete: flushNextReceiptQueue,
          menus,
          orderTypeLabels: {
            dine_in: tPrint('posOrderTypeDineIn') ?? '매장',
            takeout: tPrint('posOrderTypeTakeout') ?? '포장',
            delivery: tPrint('posOrderTypeDelivery') ?? '배달',
          },
          autoPrintReceiptOnOrder: effectiveAutoPrintReceiptOnOrder,
          autoPrintReceiptOnAddOrder: effectiveAutoPrintReceiptOnAddOrder,
          autoPrintReceiptOnPayment: effectiveAutoPrintReceiptOnPayment,
          autoPrintKitchenSlipOnOrder: effectiveAutoPrintKitchenSlipOnOrder,
          receiptBizName,
          receiptBizTaxId,
          receiptBizAbn,
          receiptBizOwner,
          receiptBizAddress,
          receiptBizPhone,
          receiptDesignStyle,
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
          printerSettingsRef: posPrinterSettingsRef,
          kitchenPromoLineEnrich: posReceiptLineOpts,
          onPaymentVoidClick: () => void runKbankFollowupAction('void'),
          paymentVoidEnabled: Boolean(
            isKbankPilotStore &&
              receiptData?.receiptAutoPrintContext === 'payment' &&
              String(kbankOpsTxnUid || '').trim()
          ),
          paymentVoidBusy: kbankOpsBusy,
        }}
        deliveryEditOrderNo={{
          open: deliveryEditOrderNoOpen,
          onOpenChange: setDeliveryEditOrderNoOpen,
          order: selectedDeliveryOrder,
          value: deliveryEditOrderNoValue,
          onValueChange: setDeliveryEditOrderNoValue,
          onSaved: async (newTableName) => {
            setSelectedDeliveryTargetLabel(newTableName)
            await refetchCurrentStore()
          },
          deliveryApps: deliveryAppsFromApi,
        }}
      />
        </div>
      </div>
    </PosTourProvider>
  )
}
