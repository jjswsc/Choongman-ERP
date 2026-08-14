'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { usePosMainDevice } from '@/hooks/use-pos-main-device'
import { usePosStore } from '@/hooks/use-pos-store'
import { useStoreList } from '@/lib/use-store-list'
import {
  getPosMenus,
  getPosMenuOptions,
  getPosPromosWithItems,
  getPosOrders,
  getPosPrinterSettings,
  type PosMenu,
  type PosMenuOption,
  type PosOrder,
  type PosPrinterSettings,
  type PosPromoWithItems,
} from '@/lib/api-client'
import { buildPosStoreCodeMatchVariants, posStoreCodeMatchesVariants } from '@/lib/pos-store-code-match-variants'
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
  resolveMainPosHeadPollSchedule,
  resolveMainPosPollIntervalMs,
  shouldUseMainPosHeavyOrderScanFallback,
} from '@/lib/pos-main-poll-interval'
import { detectMainPosHeadPollChanges } from '@/lib/pos-main-head-poll'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { consumeSuppressMainPosAutoPrintForQueuedSync } from '@/lib/offline/pos-queued-sync-print-suppress'
import {
  coercePosOrderIdFromRealtime,
  isPosPrintDebugEnabledInBrowser,
  KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS,
  MAIN_POS_META_SCAN_INTERVAL_MS,
  posGuestCountSpread,
  storeAutoPrintFlagsFromSettings,
  DINE_IN_LOCAL_SUBMIT_PRINT_SUPPRESS_MS,
  type StoreAutoPrintFlags,
} from '@/lib/pos-terminal-auto-print'
import { isPosMainDeviceSyncOwnedByLayout } from '@/lib/pos-main-device-sync-owner'
import {
  shouldSyncHostSkipDineInAddonMetaScan,
  shouldSyncHostSkipLocalKitchenAutoprint,
  shouldSyncHostKitchenFallbackForTerminalOrder,
  isPosTerminalLocalAutoprintActive,
  isPosTerminalOrderSubmitInFlight,
} from '@/lib/pos-terminal-local-autoprint-ui'
import {
  bumpLastSeenOrderId,
  claimMainPosPaymentReceiptAutoprint,
  clearPosMainDeviceSyncStateOnNonMain,
  dineInRemoteItemQtySnapshotRef,
  grabCancelWatchSeededRef,
  grabCancelWatchSnapshotRef,
  promptedGrabCustomerCancelIdsRef,
  hasInitializedMainPosPollRef,
  lastMetaScanAtRef,
  lastRealtimeOrderEventAtRef,
  lastSeenOrderIdRef,
  lastTriggerMainPosPollAtRef,
  mainPosPollInFlightRef,
  mainPosSelfDineInUpdateSuppressUntilRef,
  paymentReceiptScanSeededRef,
  pendingEmptyItemsOrderIdsRef,
  prevStoreForPollRef,
  printedHallDiscountReprintKeysRef,
  printedPaymentReceiptIdsRef,
  realtimeChannelHealthyRef,
  realtimeChannelStateRef,
  resetPosMainDeviceSyncStateForStore,
  resetPosMainDeviceSessionStartedAt,
  shouldTreatAsMainPosIncomingOrder,
  seenOrderIdsRef,
  triggerMainPosPollNowRef,
} from '@/lib/pos-main-device-sync-state'
import {
  hasIncomingDeliveryUiHandler,
  notifyIncomingDeliveryUi,
} from '@/lib/pos-main-device-incoming-delivery-ui'
import type { IncomingDeliveryFocusParams } from '@/lib/pos-main-device-sync-types'
import {
  backgroundAcceptGrabAndAutoprint,
  printHallReceiptPayload,
  printKitchenForOrder,
  printPaymentReceiptForOrder,
  printPaymentReceiptTaxReprintForOrder,
  runKitchenAutoprintForOrder,
  type HallReceiptPrintPayload,
  type PosMainDeviceAutoprintCtx,
  prepareOrderItemsForKitchenPrint,
} from '@/lib/pos-main-device-autoprint'
import { inferPosOrderTypeFromRow, resolvePosOrderTypeReceiptLabel } from '@/lib/pos-sales-order-type-filter'
import { isApiInboundDeliveryOrderMemo } from '@/lib/pos-delivery-platform'
import { isMemberPortalPaymentPendingOrder } from '@/lib/member-portal-payment-pending'
import { shouldReprintPaymentReceiptForTaxInvoiceMemoChange } from '@/lib/pos-tax-invoice'
import {
  hallOrderReceiptPayloadFromOrderFields,
  hallOrderReceiptPayloadFromPosOrder,
  type PosOrderReceiptLineOptions,
} from '@/lib/pos-payment-receipt-from-order'
import {
  isPosDineInTableNameOnlyUpdate,
  isPosOrderItemsJsonPackagingOnlyUpdate,
  posOrderRealtimePricingFieldsChanged,
  shouldAutoprintPaymentReceiptOnRealtimeUpdate,
} from '@/lib/pos-dine-in-realtime-update'
import {
  isPosOrderPaidLikeStatus,
  posOrderPaymentSum,
  posOrderRowPaymentSum,
} from '@/lib/pos-payment-receipt-from-order'
import { buildGrabPosCatalog, formatGrabLineNoteForKitchenPrint } from '@/lib/grab-pos-order-enrich'
import { kitchenSlipPrintI18n, resolveKitchenSlipOrderTypeLabel } from '@/lib/pos-kitchen-slip-print-i18n'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { computePosPricing, receiptTaxDisplayFieldsFromPricing, normalizeFeeStackMode, normalizeFeeStackOrder, normalizePaymentTotalRoundingMode, type PosPricingAdjustments } from '@/lib/pos-pricing'
import {
  buildDineInAddKitchenAutoPrintDedupeKey,
  buildDineInAddKitchenPrintDedupeSuffix,
  buildDineInQtySnapshotMap,
  buildKitchenCartLinesFromSnapshotDelta,
  collectDineInSnapshotIncreasedKeys,
  resolveDineInKitchenSnapshotItemKey,
} from '@/lib/pos-kitchen-dine-in-delta'
import {
  inferPrevQtySnapshotExcludingRecentQrGuestLines,
  shouldSkipHallAutoprintForQrGuestAddon,
} from '@/lib/qr-table-types'
import { syncGrabCancelWatchSnapshot, applyGrabCancelWatchRealtimeRow } from '@/lib/pos-grab-cancel-watch'
import {
  hasGrabCancelUiHandler,
  notifyGrabCancelUi,
  type GrabCancelUiParams,
} from '@/lib/pos-main-device-grab-cancel-ui'
import { playPosIncomingOrderBeep } from '@/lib/pos-incoming-order-sound'
import { appAlert } from '@/lib/app-message'
import { consumePosSelfInitiatedGrabCancel } from '@/lib/pos-grab-cancel-alert-suppress'
import {
  hasRecentPosAutoPrintKey,
  releasePosAutoPrintKeys,
  reservePosAutoPrintKeys,
} from '@/lib/pos-auto-print-dedupe'
import { POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS, resolveAfterReceiptToKitchenDelayMs } from '@/lib/pos-print-html'
import { coercePosReceiptLineDiscountAmt } from '@/lib/pos-receipt-line-discount'

type RealtimeParsedPosOrderItem = {
  id: string
  name: string
  price: number
  qty: number
  note?: string
  menuId?: string
  optionCode?: string
  source?: string
  addedAt?: string
  promoItems?: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
}

function parseRealtimePosOrderRowItemsJson(
  row: Record<string, unknown>,
  resolveDisplayName: (item: {
    id?: string
    name?: string
    menuId?: string
    promoId?: string
    promoCode?: string
  }) => string,
  enrichPromoItems: (
    list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]
  ) => typeof list
): { ok: true; items: RealtimeParsedPosOrderItem[] } | { ok: false } {
  try {
    const raw = row.items_json
    const arr = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : []
    const items = (Array.isArray(arr) ? arr : []).map(
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
        optionCode1?: string
        option_code1?: string
        optionCode?: string
        promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
        source?: string
        addedAt?: string
      }) => {
        const note = String(it.note ?? '').trim()
        const menuId = String(it.menuId1 ?? it.menu_id1 ?? it.menuId ?? '').trim()
        const optionCode = String(it.optionCode1 ?? it.option_code1 ?? it.optionCode ?? '').trim()
        const displayName = resolveDisplayName({
          id: String(it.id ?? ''),
          name: String(it.name ?? ''),
          menuId,
        })
        const source = String(it.source ?? '').trim()
        const addedAt = String(it.addedAt ?? '').trim()
        return {
          id: String(it.id ?? ''),
          name: displayName,
          price: Number(it.price ?? 0),
          qty: Math.max(1, Number(it.qty ?? it.quantity ?? 1) || 1),
          ...(menuId ? { menuId } : {}),
          ...(optionCode ? { optionCode } : {}),
          ...(note ? { note } : {}),
          ...(source ? { source } : {}),
          ...(addedAt ? { addedAt } : {}),
          ...(Array.isArray(it.promoItems) ? { promoItems: enrichPromoItems(it.promoItems) } : {}),
        }
      }
    )
    return { ok: true, items }
  } catch {
    return { ok: false }
  }
}

function buildDineInQtySnapshot(
  items: Array<{ id?: string; name?: string; qty?: number; note?: string; menuId?: string; optionCode?: string }>,
  formatNote: (note?: string | null) => string
): Map<string, number> {
  return buildDineInQtySnapshotMap(items, (it) =>
    resolveDineInKitchenSnapshotItemKey(it, { formatNote })
  )
}

export function usePosMainDeviceSyncHost(): void {
  const { auth } = useAuth()
  const storeCode = String(auth?.store ?? '').trim()
  const posTerminalUser = String(auth?.user ?? '').trim()
  const [isMainPosDevice] = usePosMainDevice(storeCode || null)
  const { lang } = useLang()
  const t = useT(lang)
  const { refetchStores, clearTableOrder } = usePosStore()
  const { legacyToCanonical, storeLabels, posStores } = useStoreList()

  const [menus, setMenus] = useState<PosMenu[]>([])
  const [menuOptions, setMenuOptions] = useState<PosMenuOption[]>([])
  const [promos, setPromos] = useState<PosPromoWithItems[]>([])
  const [printerSettings, setPrinterSettings] = useState<PosPrinterSettings | null>(null)
  const [autoPrint, setAutoPrint] = useState<StoreAutoPrintFlags>({
    receiptOnOrder: false,
    receiptOnAddOrder: false,
    receiptOnPayment: false,
    kitchenOnOrder: false,
  })
  const [pricingAdjustments, setPricingAdjustments] = useState<PosPricingAdjustments>({
    vatRate: 7,
    vatMode: 'included',
    serviceRate: 0,
    serviceMode: 'separate',
    cardRate: 0,
    cardMode: 'separate',
    cardBaseMode: 'card_only',
    otherRate: 0,
    otherMode: 'separate',
    feeStackMode: 'parallel',
    feeStackOrder: ['service', 'vat', 'other'],
    paymentTotalRoundingMode: 'round',
  })
  const [receiptPrintLang, setReceiptPrintLang] = useState('')
  const [realtimeResubscribeTick, setRealtimeResubscribeTick] = useState(0)

  const mainPosPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const realtimeResubscribeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRealtimeResubscribeAtRef = useRef(0)
  const prevMainPosStoreCodeRef = useRef<string | null>(null)

  const skipLocalKitchenAutoprintForOrder = useCallback(
    (orderId: number, row?: Record<string, unknown>) => {
      const memo = String(row?.memo ?? '')
      const isApiInbound =
        String(row?.order_type ?? '').trim().toLowerCase() === 'delivery' &&
        isApiInboundDeliveryOrderMemo(memo)
      return shouldSyncHostSkipLocalKitchenAutoprint({
        orderId,
        createdBy: String(row?.created_by ?? ''),
        currentUser: posTerminalUser,
        isApiInboundDelivery: isApiInbound,
        suppressUntilMs: mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId) ?? null,
      })
    },
    [posTerminalUser]
  )

  const currentStoreCodeVariants = useMemo(() => {
    if (!storeCode) return [] as string[]
    return buildPosStoreCodeMatchVariants({
      storeCode,
      catalogStoreCodes: posStores,
      legacyToCanonical,
      storeLabels,
    })
  }, [storeCode, posStores, legacyToCanonical, storeLabels])

  const isCurrentStoreOrder = useCallback(
    (rawStoreCode: unknown) => posStoreCodeMatchesVariants(rawStoreCode, currentStoreCodeVariants),
    [currentStoreCodeVariants]
  )

  const printLang = String(receiptPrintLang || lang || 'ko').trim() || 'ko'
  const tPrint = useT(printLang)

  const optionNameByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of menuOptions) {
      const code = String(o.optionCode ?? '').trim()
      const name = String(o.name ?? '').trim()
      if (code && name) map.set(code, name)
    }
    return map
  }, [menuOptions])

  const optionNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of menuOptions) {
      const id = String(o.id ?? '').trim()
      const name = String(o.name ?? '').trim()
      if (id && name) map.set(id, name)
    }
    return map
  }, [menuOptions])

  const promoCatalogById = useMemo(() => new Map(promos.map((p) => [String(p.id), p])), [promos])

  const posReceiptLineOpts: PosOrderReceiptLineOptions = useMemo(
    () => ({ promoCatalogById, menus, optionNameByCode, optionNameById }),
    [promoCatalogById, menus, optionNameByCode, optionNameById]
  )

  const grabCatalogForPrint = useMemo(
    () =>
      buildGrabPosCatalog(
        menus.map((m) => ({ id: m.id, name: m.name, code: m.code })),
        menuOptions.map((o) => ({ name: o.name, optionCode: o.optionCode })),
        promos
      ),
    [menus, menuOptions, promos]
  )

  const formatLineNoteForPrint = useCallback(
    (rawNote?: string | null): string => formatGrabLineNoteForKitchenPrint(rawNote, optionNameByCode),
    [optionNameByCode]
  )

  const buildDineInQtySnapshotForStore = useCallback(
    (
      items: Array<{ id?: string; name?: string; qty?: number; note?: string; menuId?: string; optionCode?: string }>
    ) => buildDineInQtySnapshot(items, formatLineNoteForPrint),
    [formatLineNoteForPrint]
  )

  const enrichPromoItemsWithOptionName = useCallback(
    (list: { menuId: string; optionId: string | null; optionCode?: string | null; quantity: number }[]) =>
      list.map((p) => ({
        ...p,
        ...((p.optionCode && optionNameByCode.get(String(p.optionCode)))
          ? { optionName: optionNameByCode.get(String(p.optionCode)) }
          : {}),
        ...((p.optionId && optionNameById.get(String(p.optionId)))
          ? { optionName: optionNameById.get(String(p.optionId)) }
          : {}),
      })),
    [optionNameByCode, optionNameById]
  )

  const resolveOrderItemDisplayName = useCallback(
    (item: { id?: string; name?: string; menuId?: string; promoId?: string; promoCode?: string }) =>
      resolvePosOrderItemMenuDisplayName(
        {
          id: String(item.id ?? ''),
          name: String(item.name ?? '').trim(),
          ...(String(item.menuId ?? '').trim() ? { menuId: String(item.menuId).trim() } : {}),
          ...(String(item.promoId ?? '').trim() ? { promoId: String(item.promoId).trim() } : {}),
          ...(String(item.promoCode ?? '').trim() ? { promoCode: String(item.promoCode).trim() } : {}),
        },
        menus,
        promos
      ),
    [menus, promos]
  )

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
          itemDeliveryAppCodes: ctx.items?.map((it) => (it as { deliveryAppCode?: string }).deliveryAppCode),
        },
        ki,
        []
      ),
    []
  )

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
      return reservePosAutoPrintKeys(storeCode, keys, ttlMs)
    },
    [storeCode, normalizeKitchenAutoPrintDedupeKeys]
  )

  const releaseKitchenAutoPrintKey = useCallback(
    (rawKeyOrKeys: string | string[]) => {
      const keys = normalizeKitchenAutoPrintDedupeKeys(rawKeyOrKeys)
      if (!keys.length) return
      releasePosAutoPrintKeys(storeCode, keys)
    },
    [storeCode, normalizeKitchenAutoPrintDedupeKeys]
  )

  const logPosPrintDebug = useCallback(
    (event: string, detail?: Record<string, unknown>) => {
      if (!isPosPrintDebugEnabledInBrowser()) return
      try {
        console.info('[POS_PRINT_DEBUG]', event, {
          storeCode,
          isMainPosDevice,
          ...(detail || {}),
        })
      } catch {
        /* ignore */
      }
    },
    [storeCode, isMainPosDevice]
  )

  const notifyGrabCancelFromHost = useCallback(
    (params: GrabCancelUiParams) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (consumePosSelfInitiatedGrabCancel(orderId)) return
      // 터미널 UI 핸들러가 dedupe·알림음·탭 전환·팝업을 담당
      if (hasGrabCancelUiHandler()) {
        notifyGrabCancelUi(params)
        return
      }
      if (promptedGrabCustomerCancelIdsRef.current.has(orderId)) return
      promptedGrabCustomerCancelIdsRef.current.add(orderId)
      playPosIncomingOrderBeep()
      if (typeof window !== 'undefined') {
        window.setTimeout(() => playPosIncomingOrderBeep(), 420)
      }
      refetchStores({ scope: 'all' })
      const label =
        String(params.tableName ?? '').trim() ||
        (params.orderNo ? `POS #${params.orderNo}` : `Order #${orderId}`)
      const msg = (t('posGrabCustomerCancelledAlert') || '고객이 Grab에서 주문을 취소했습니다.\n\n{{label}}').replace(
        '{{label}}',
        label
      )
      void appAlert(msg)
    },
    [refetchStores, t]
  )

  const autoprintCtx = useMemo((): PosMainDeviceAutoprintCtx | null => {
    if (!storeCode) return null
    return {
      storeCode,
      lang,
      printLang,
      t,
      tPrint,
      menus,
      menuOptions,
      promos,
      pricingAdjustments,
      posReceiptLineOpts,
      printerSettings,
      autoPrint,
      optionNameByCode,
      grabCatalogForPrint,
      kitchenSlipOrderTypeLabel,
      formatLineNoteForPrint,
      logPosPrintDebug,
      reserveKitchenAutoPrintKey,
      releaseKitchenAutoPrintKey,
      onRefetchStores: (scope) => refetchStores({ scope: scope ?? 'all' }),
    }
  }, [
    storeCode,
    lang,
    printLang,
    t,
    tPrint,
    menus,
    menuOptions,
    promos,
    pricingAdjustments,
    posReceiptLineOpts,
    printerSettings,
    autoPrint,
    optionNameByCode,
    grabCatalogForPrint,
    kitchenSlipOrderTypeLabel,
    logPosPrintDebug,
    reserveKitchenAutoPrintKey,
    releaseKitchenAutoPrintKey,
    refetchStores,
  ])

  const autoprintCtxRef = useRef(autoprintCtx)
  autoprintCtxRef.current = autoprintCtx

  const shouldTreatAsIncomingOrder = shouldTreatAsMainPosIncomingOrder

  const shouldSkipDineInRemoteAddAutoprint = useCallback(
    (
      orderId: number,
      storeCodeForSkip: string,
      prevQtyById: Map<string, number>,
      newQtyById: Map<string, number>,
      changedKeys: Iterable<string>
    ): boolean => {
      const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId)
      if (suppressUntil != null && Date.now() < suppressUntil) return true
      const store = String(storeCodeForSkip || storeCode || '').trim()
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
    [storeCode, logPosPrintDebug]
  )

  const handleIncomingDelivery = useCallback(
    (params: IncomingDeliveryFocusParams) => {
      const orderId = Number(params.orderId)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (String(params.orderType ?? '').trim().toLowerCase() !== 'delivery') return
      const status = String(params.status ?? '').trim().toLowerCase()
      if (status === 'cancelled' || status === 'refunded') return

      notifyIncomingDeliveryUi(params)

      const isPendingApiInbound =
        status === 'pending' && isApiInboundDeliveryOrderMemo(String(params.memo ?? ''))
      if (isPendingApiInbound && !hasIncomingDeliveryUiHandler() && autoprintCtx) {
        void backgroundAcceptGrabAndAutoprint(params, autoprintCtx)
      }
    },
    [autoprintCtx]
  )

  const printPaymentReceiptIfEnabled = useCallback(async (order: PosOrder) => {
    const ctx = autoprintCtxRef.current
    if (!ctx || !autoPrint.receiptOnPayment) return
    try {
      await printPaymentReceiptForOrder(order, ctx)
    } catch {
      /* ref 유지 */
    }
  }, [autoPrint.receiptOnPayment])

  const dispatchPaymentReceiptFromOrder = useCallback(
    async (order: PosOrder) => {
      const ctx = autoprintCtxRef.current
      if (!ctx) return
      const orderId = Number(order.id)
      if (!Number.isFinite(orderId) || orderId <= 0) return
      if (!autoPrint.receiptOnPayment) return
      const storeForClaim = String(ctx.storeCode || order.storeCode || storeCode || '').trim()
      if (!claimMainPosPaymentReceiptAutoprint(orderId, storeForClaim)) return
      await printPaymentReceiptIfEnabled(order)
    },
    [autoPrint.receiptOnPayment, storeCode, printPaymentReceiptIfEnabled]
  )

  const runAutoprintForNewOrder = useCallback(
    (
      orderId: number,
      hallPayload: HallReceiptPrintPayload,
      orderForKitchen: PosOrder | null,
      flow: string,
      deferAutoprint: boolean
    ) => {
      if (!autoprintCtx || deferAutoprint) {
        if (deferAutoprint) {
          logPosPrintDebug(`${flow}_deferred_autoprint`, { orderId })
        }
        return
      }
      logPosPrintDebug(`${flow}_autoprint_start`, {
        orderId,
        autoPrintReceiptOnOrder: autoPrint.receiptOnOrder,
        autoPrintKitchenSlipOnOrder: autoPrint.kitchenOnOrder,
      })
      const runKitchen = () => {
        if (!orderForKitchen || !autoPrint.kitchenOnOrder) return
        runKitchenAutoprintForOrder(orderForKitchen, autoprintCtx, flow)
      }
      if (autoPrint.receiptOnOrder && autoPrint.kitchenOnOrder) {
        void printHallReceiptPayload(hallPayload, autoprintCtx, { onAfterDirectPrint: runKitchen })
      } else if (autoPrint.receiptOnOrder) {
        void printHallReceiptPayload(hallPayload, autoprintCtx)
      } else if (autoPrint.kitchenOnOrder) {
        setTimeout(runKitchen, KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS)
      }
    },
    [autoprintCtx, autoPrint, logPosPrintDebug]
  )

  const seedPaymentReceiptIdsForStore = useCallback(async (code: string) => {
    if (paymentReceiptScanSeededRef.current || !code) return
    try {
      const today = getPosBusinessDateStr()
      const paidLikeRows = await getPosOrders({
        startStr: today,
        endStr: today,
        posBizDayScope: true,
        storeCode: code,
        statusPaidLike: true,
        limit: 800,
        orderBy: 'id.desc',
        pollMinimal: true,
      })
      for (const order of paidLikeRows) {
        const oid = Number(order.id)
        if (!Number.isFinite(oid) || oid <= 0) continue
        if (!isPosOrderPaidLikeStatus(String(order.status ?? ''))) continue
        if (posOrderPaymentSum(order) <= 0) continue
        if (!(order.items || []).length) continue
        printedPaymentReceiptIdsRef.current.add(oid)
      }
      paymentReceiptScanSeededRef.current = true
    } catch {
      /* seed retry on next poll */
    }
  }, [])

  useEffect(() => {
    if (!isMainPosDevice || !storeCode) return
    const storeChanged = prevMainPosStoreCodeRef.current !== storeCode
    prevMainPosStoreCodeRef.current = storeCode
    if (storeChanged) {
      resetPosMainDeviceSessionStartedAt()
      seenOrderIdsRef.current.clear()
      printedPaymentReceiptIdsRef.current.clear()
      paymentReceiptScanSeededRef.current = false
      dineInRemoteItemQtySnapshotRef.current.clear()
      mainPosSelfDineInUpdateSuppressUntilRef.current.clear()
      resetPosMainDeviceSyncStateForStore(storeCode)
      void seedPaymentReceiptIdsForStore(storeCode)
    }

    let cancelled = false
    void Promise.all([
      getPosMenus({ storeCode }),
      getPosMenuOptions({ fresh: true, forCodeMap: true }),
      getPosPromosWithItems(),
      getPosPrinterSettings({ storeCode }),
    ])
      .then(([menuList, options, promoList, settings]) => {
        if (cancelled) return
        setMenus(Array.isArray(menuList) ? menuList : [])
        setMenuOptions(Array.isArray(options) ? options : [])
        setPromos(Array.isArray(promoList) ? promoList : [])
        setPrinterSettings(settings)
        setAutoPrint(storeAutoPrintFlagsFromSettings(settings))
        setReceiptPrintLang(String(settings.receiptPrintLang ?? '').trim())
        setPricingAdjustments({
          vatRate: Math.max(0, Number(settings.vatRate ?? 7)),
          vatMode: settings.vatMode === 'separate' ? 'separate' : 'included',
          serviceRate: Math.max(0, Number(settings.serviceRate ?? 0)),
          serviceMode: settings.serviceMode === 'included' ? 'included' : 'separate',
          cardRate: Math.max(0, Number(settings.cardRate ?? 0)),
          cardMode: settings.cardMode === 'included' ? 'included' : 'separate',
          cardBaseMode:
            settings.cardBaseMode === 'card_plus_vat'
              ? 'card_plus_vat'
              : settings.cardBaseMode === 'card_plus_vat_service'
                ? 'card_plus_vat_service'
                : 'card_only',
          otherRate: Math.max(0, Number(settings.otherRate ?? 0)),
          otherMode: settings.otherMode === 'included' ? 'included' : 'separate',
          feeStackMode: normalizeFeeStackMode(settings.feeStackMode),
          feeStackOrder: normalizeFeeStackOrder(settings.feeStackOrder),
          paymentTotalRoundingMode: normalizePaymentTotalRoundingMode(settings.paymentTotalRoundingMode),
        })
      })
      .catch(() => {
        if (!cancelled) {
          setMenus([])
          setMenuOptions([])
          setPromos([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [isMainPosDevice, storeCode, seedPaymentReceiptIdsForStore])

  const recomputeRealtimeChannelHealthy = useCallback(() => {
    realtimeChannelHealthyRef.current = isMainPosRealtimeInsertChannelHealthy(realtimeChannelStateRef.current)
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

  const makeRealtimeStatusHandler = useCallback(
    (channelKey: string) => (status: PosRealtimeSubscribeStatus, err?: Error) => {
      realtimeChannelStateRef.current.set(channelKey, status)
      recomputeRealtimeChannelHealthy()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        logPosPrintDebug('realtime_channel_degraded', { channelKey, status, message: err?.message })
        const primaryInsertKey = mainPosPrimaryInsertChannelKey(storeCode)
        if (channelKey !== primaryInsertKey) return
        triggerMainPosPollNowRef.current?.()
        scheduleRealtimeResubscribe()
      }
    },
    [storeCode, logPosPrintDebug, recomputeRealtimeChannelHealthy, scheduleRealtimeResubscribe]
  )

  // Realtime INSERT — mirror terminal main-device insert handler
  useEffect(() => {
    if (!isMainPosDevice || !storeCode || !autoprintCtx) return

    const onInsert = (payload: { new?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!shouldTreatAsIncomingOrder(orderId, row.created_at)) {
        logPosPrintDebug('realtime_insert_skip_not_incoming', { orderId, createdAt: String(row.created_at ?? '') })
        return
      }
      if (!isCurrentStoreOrder(row.store_code)) return
      if (consumeSuppressMainPosAutoPrintForQueuedSync(orderId)) {
        seenOrderIdsRef.current.add(orderId)
        bumpLastSeenOrderId(storeCode, orderId)
        return
      }
      if (seenOrderIdsRef.current.has(orderId)) return
      const parsedItems = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
      if (!parsedItems.ok) return
      const items = parsedItems.items
      if (items.length === 0) {
        pendingEmptyItemsOrderIdsRef.current.add(orderId)
        triggerMainPosPollNowRef.current?.()
        return
      }
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      /** 터미널 savePosOrder 진행 중 — seenOrderIds 선등록 시 터미널 주방 인쇄가 skipLocalAutoPrint에 막힘 */
      if (isPosTerminalLocalAutoprintActive() && isPosTerminalOrderSubmitInFlight()) {
        const inferredOrderTypeForSnap = inferPosOrderTypeFromRow({
          order_type: String(row.order_type ?? ''),
          memo: String(row.memo ?? ''),
          table_name: String(row.table_name ?? ''),
          delivery_payment_channel: String(row.delivery_payment_channel ?? ''),
          items_json: row.items_json,
        })
        if (inferredOrderTypeForSnap === 'dine_in') {
          const snap = buildDineInQtySnapshotForStore(items)
          if (snap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, snap)
        }
        logPosPrintDebug('realtime_insert_defer_terminal_submit', { orderId })
        return
      }
      seenOrderIdsRef.current.add(orderId)
      bumpLastSeenOrderId(storeCode, orderId)

      const inferredOrderType = inferPosOrderTypeFromRow({
        order_type: String(row.order_type ?? ''),
        memo: String(row.memo ?? ''),
        table_name: String(row.table_name ?? ''),
        delivery_payment_channel: String(row.delivery_payment_channel ?? ''),
        items_json: row.items_json,
      })

      handleIncomingDelivery({
        orderId,
        orderType: inferredOrderType,
        deliveryAppCode: String(row.delivery_app_code ?? ''),
        status: String(row.status ?? ''),
        createdAt: String(row.created_at ?? ''),
        storeCode: String(row.store_code ?? ''),
        memo: String(row.memo ?? ''),
      })

      refetchStores({
        scope: skipLocalKitchenAutoprintForOrder(orderId, row) ? 'current' : 'all',
      })

      if (inferredOrderType === 'dine_in') {
        const snap = buildDineInQtySnapshotForStore(items)
        if (snap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, snap)
      }

      const rowStore = String(row.store_code ?? storeCode)
      const isPendingDelivery =
        inferredOrderType === 'delivery' && String(row.status ?? '').trim().toLowerCase() === 'pending'
      const shouldWaitForDeliveryAccept = isPendingDelivery && isApiInboundDeliveryOrderMemo(String(row.memo ?? ''))
      const shouldWaitForMemberPortalPrepay = isMemberPortalPaymentPendingOrder({
        memo: String(row.memo ?? ''),
        status: String(row.status ?? ''),
        payment_qr: Number(row.payment_qr ?? 0),
        created_by: String(row.created_by ?? ''),
      })
      const shouldDeferAutoprint = shouldWaitForDeliveryAccept || shouldWaitForMemberPortalPrepay

      const receiptPayload: HallReceiptPrintPayload = {
        ...hallOrderReceiptPayloadFromOrderFields(
          {
            orderNo: String(row.order_no ?? ''),
            storeCode: rowStore,
            orderType: resolvePosOrderTypeReceiptLabel(inferredOrderType, t),
            tableName: String(row.table_name ?? ''),
            memo: String(row.memo ?? ''),
            items,
            subtotal: Number(row.subtotal ?? 0),
            discountAmt: Number(row.discount_amt ?? 0),
            couponDiscountAmt: Number(row.coupon_discount_amt ?? 0),
            discountReason: String(row.discount_reason ?? '').trim() || undefined,
            total: Number(row.total ?? 0),
            ...posGuestCountSpread(row.guest_count),
          },
          pricingAdjustments
        ),
        _autoPrintDedupeKey: `order:${orderId}:hall:auto`,
      }

      const orderForKitchen = {
        id: orderId,
        orderNo: String(row.order_no ?? ''),
        storeCode: rowStore,
        orderType: inferredOrderType,
        tableName: String(row.table_name ?? ''),
        memo: String(row.memo ?? ''),
        items: items as PosOrder['items'],
        guestCount: Number(row.guest_count ?? 0) || undefined,
      } as PosOrder

      if (!skipLocalKitchenAutoprintForOrder(orderId, row)) {
        runAutoprintForNewOrder(orderId, receiptPayload, orderForKitchen, 'realtime_insert', shouldDeferAutoprint)
      } else if (
        shouldSyncHostKitchenFallbackForTerminalOrder(orderId, storeCode, autoPrint.kitchenOnOrder)
      ) {
        runKitchenAutoprintForOrder(orderForKitchen, autoprintCtx, 'realtime_insert_terminal_kitchen_fallback')
      }

      if (autoPrint.receiptOnPayment) {
        const st = String(row.status ?? '').toLowerCase()
        const paySum = posOrderRowPaymentSum(row)
        const rowStore = String(row.store_code ?? storeCode).trim()
        if (
          isPosOrderPaidLikeStatus(st) &&
          paySum > 0 &&
          claimMainPosPaymentReceiptAutoprint(orderId, rowStore)
        ) {
          void getPosOrders({ orderId, storeCode })
            .then((list) => {
              const order = list[0]
              if (!order?.items?.length) return
              if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) return
              return printPaymentReceiptIfEnabled(order)
            })
            .catch(() => {
              /* ignore */
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
      const parsed = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
      if (!parsed.ok || parsed.items.length === 0) return
      pendingEmptyItemsOrderIdsRef.current.delete(orderId)
      triggerMainPosPollNowRef.current?.()
    }

    realtimeChannelStateRef.current.clear()
    realtimeChannelHealthyRef.current = false
    const channels = currentStoreCodeVariants.flatMap((code) => {
      const trimmed = String(code || '').trim()
      if (!trimmed) return []
      const list = []
      const chInsert = subscribePosOrdersInsert(onInsert, {
        store: trimmed,
        ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        onStatus: makeRealtimeStatusHandler(`insert:${trimmed}`),
      })
      if (chInsert) list.push(chInsert)
      const chUpdate = subscribePosOrdersUpdate(onUpdatePendingItems, {
        store: trimmed,
        ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        onStatus: makeRealtimeStatusHandler(`insert-items:${trimmed}`),
      })
      if (chUpdate) list.push(chUpdate)
      return list
    })

    return () => {
      channels.forEach((ch) => ch?.unsubscribe())
      if (realtimeResubscribeTimerRef.current) {
        clearTimeout(realtimeResubscribeTimerRef.current)
        realtimeResubscribeTimerRef.current = null
      }
    }
  }, [
    isMainPosDevice,
    storeCode,
    autoprintCtx,
    currentStoreCodeVariants,
    realtimeResubscribeTick,
    autoPrint,
    pricingAdjustments,
    t,
    refetchStores,
    logPosPrintDebug,
    shouldTreatAsIncomingOrder,
    isCurrentStoreOrder,
    makeRealtimeStatusHandler,
    resolveOrderItemDisplayName,
    enrichPromoItemsWithOptionName,
    handleIncomingDelivery,
    runAutoprintForNewOrder,
    dispatchPaymentReceiptFromOrder,
    auth?.tenantId,
    printPaymentReceiptIfEnabled,
    skipLocalKitchenAutoprintForOrder,
    buildDineInQtySnapshotForStore,
  ])

  // Realtime UPDATE — 홀 UI 갱신은 항상, 자동인쇄만 설정에 따름 (인쇄 OFF여도 태블릿/QR 메뉴 즉시 반영)
  useEffect(() => {
    if (!isMainPosDevice || !storeCode || !autoprintCtx) return
    const wantPayment = autoPrint.receiptOnPayment
    const wantRemoteDineInAdd = autoPrint.receiptOnAddOrder || autoPrint.receiptOnOrder || autoPrint.kitchenOnOrder

    const onUpdate = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return

      const oldRow = payload.old as Record<string, unknown> | undefined
      const inferredOrderType = inferPosOrderTypeFromRow({
        order_type: String(row.order_type ?? ''),
        memo: String(row.memo ?? ''),
        table_name: String(row.table_name ?? ''),
        delivery_payment_channel: String(row.delivery_payment_channel ?? ''),
        items_json: row.items_json,
      })
      const packagingOnlyUpdate = oldRow != null && isPosOrderItemsJsonPackagingOnlyUpdate(oldRow, row)

      if (
        !packagingOnlyUpdate &&
        autoPrint.receiptOnOrder &&
        seenOrderIdsRef.current.has(orderId) &&
        inferredOrderType === 'delivery' &&
        posOrderRowPaymentSum(row) <= 0 &&
        !isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        oldRow
      ) {
        const newDisc = Math.max(0, Number(row.discount_amt ?? 0) || 0)
        const newCoupon = Math.max(0, Number(row.coupon_discount_amt ?? 0) || 0)
        const newTotal = Math.max(0, Number(row.total ?? 0) || 0)
        const oldTotal = Math.max(0, Number(oldRow.total ?? 0) || 0)
        if (
          posOrderRealtimePricingFieldsChanged(oldRow, row) &&
          (newDisc > 0.01 || newCoupon > 0.01 || (oldTotal > newTotal + 0.01 && newTotal > 0.005))
        ) {
          const reprintKey = `order:${orderId}:hall-disc:${Math.round(newDisc * 100)}:${Math.round(newCoupon * 100)}:${Math.round(newTotal * 100)}`
          if (!printedHallDiscountReprintKeysRef.current.has(reprintKey)) {
            printedHallDiscountReprintKeysRef.current.add(reprintKey)
            const parsedDisc = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
            if (parsedDisc.ok && parsedDisc.items.length > 0) {
              const hallPayload: HallReceiptPrintPayload = {
                ...hallOrderReceiptPayloadFromOrderFields(
                  {
                    orderNo: String(row.order_no ?? ''),
                    storeCode: String(row.store_code ?? storeCode),
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
              void printHallReceiptPayload(hallPayload, autoprintCtx)
            }
          }
        }
      }

      if (
        oldRow &&
        isMemberPortalPaymentPendingOrder({
          memo: String(oldRow.memo ?? ''),
          status: String(oldRow.status ?? ''),
          payment_qr: Number(oldRow.payment_qr ?? 0),
          created_by: String(oldRow.created_by ?? ''),
        }) &&
        isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) > 0 &&
        reserveKitchenAutoPrintKey(`mp-prepay-paid:${orderId}`)
      ) {
        logPosPrintDebug('realtime_update_member_portal_prepay_paid', { orderId })
        playPosIncomingOrderBeep()
        refetchStores({ scope: 'all' })
        void getPosOrders({ orderId, storeCode })
          .then(async (list) => {
            const order = list[0]
            if (!order?.items?.length) return
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) return
            if (!autoprintCtx) return
            if (autoPrint.kitchenOnOrder) {
              await printKitchenForOrder(order, autoprintCtx)
            }
            if (autoPrint.receiptOnOrder) {
              const hallPayload = hallOrderReceiptPayloadFromPosOrder(order, pricingAdjustments, {
                ...posReceiptLineOpts,
                orderTypeLabel: resolvePosOrderTypeReceiptLabel(String(order.orderType ?? ''), t),
                storeCodeFallback: storeCode,
              })
              await printHallReceiptPayload(
                { ...hallPayload, _autoPrintDedupeKey: `order:${orderId}:hall:mp-prepay` },
                autoprintCtx
              )
            }
          })
          .catch((e) => console.error('member portal prepay paid autoprint:', e))
      }

      if (
        wantPayment &&
        !packagingOnlyUpdate &&
        shouldAutoprintPaymentReceiptOnRealtimeUpdate(oldRow, row) &&
        claimMainPosPaymentReceiptAutoprint(orderId, String(row.store_code ?? storeCode).trim())
      ) {
        void getPosOrders({ orderId, storeCode })
          .then((list) => {
            const order = list[0]
            if (!order?.items?.length) return
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) return
            return printPaymentReceiptIfEnabled(order)
          })
          .catch(() => {
            /* ignore */
          })
      }

      if (
        wantPayment &&
        oldRow &&
        isPosOrderPaidLikeStatus(String(row.status ?? '')) &&
        posOrderRowPaymentSum(row) > 0 &&
        shouldReprintPaymentReceiptForTaxInvoiceMemoChange(
          String(oldRow.memo ?? ''),
          String(row.memo ?? '')
        )
      ) {
        void getPosOrders({ orderId, storeCode })
          .then(async (list) => {
            const order = list[0]
            if (!order?.items?.length) return
            if (!isPosOrderPaidLikeStatus(order.status) || posOrderPaymentSum(order) <= 0) return
            if (!autoprintCtx) return
            await printPaymentReceiptTaxReprintForOrder(order, autoprintCtx)
          })
          .catch((e) => console.error('tax invoice payment receipt reprint:', e))
      }

      if (packagingOnlyUpdate || inferredOrderType !== 'dine_in') return
      if (posOrderRowPaymentSum(row) > 0) return
      if (isPosOrderPaidLikeStatus(String(row.status ?? ''))) return
      const st = String(row.status ?? '').trim().toLowerCase()
      if (st === 'completed' || st === 'cancelled' || st === 'canceled') return
      if (oldRow && isPosDineInTableNameOnlyUpdate(oldRow, row)) {
        const parsedTableMove = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
        if (parsedTableMove.ok && parsedTableMove.items.length > 0) {
          const sid = buildDineInQtySnapshotForStore(parsedTableMove.items)
          if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
        }
        const oldTableName = String(oldRow.table_name ?? '').trim()
        if (oldTableName) clearTableOrder(storeCode, oldTableName)
        refetchStores({ scope: 'all' })
        return
      }

      const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(orderId)
      if (suppressUntil != null && Date.now() < suppressUntil) {
        const parsedSelf = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
        if (parsedSelf.ok && parsedSelf.items.length > 0) {
          const sid = buildDineInQtySnapshotForStore(parsedSelf.items)
          if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
        }
        return
      }
      if (suppressUntil != null) mainPosSelfDineInUpdateSuppressUntilRef.current.delete(orderId)

      if (skipLocalKitchenAutoprintForOrder(orderId, row)) {
        const parsedLocal = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
        if (parsedLocal.ok && parsedLocal.items.length > 0) {
          const sid = buildDineInQtySnapshotForStore(parsedLocal.items)
          if (sid.size > 0) dineInRemoteItemQtySnapshotRef.current.set(orderId, sid)
        }
        refetchStores({ scope: 'current' })
        return
      }

      const parsed = parseRealtimePosOrderRowItemsJson(row, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
      if (!parsed.ok || parsed.items.length === 0) {
        triggerMainPosPollNowRef.current?.({ force: true })
        return
      }
      const items = parsed.items
      let prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(orderId)
      const newQtyById = buildDineInQtySnapshotForStore(items)
      if (newQtyById.size === 0) return
      if (!prevQtyById && oldRow) {
        const parsedOld = parseRealtimePosOrderRowItemsJson(oldRow, resolveOrderItemDisplayName, enrichPromoItemsWithOptionName)
        if (parsedOld.ok && parsedOld.items.length > 0) {
          prevQtyById = buildDineInQtySnapshotForStore(parsedOld.items)
        }
      }
      if (!prevQtyById) {
        prevQtyById =
          inferPrevQtySnapshotExcludingRecentQrGuestLines({
            items,
            newQtyById,
            resolveKey: (it) => resolveDineInKitchenSnapshotItemKey(it, { formatNote: formatLineNoteForPrint }),
          }) ?? undefined
      }
      if (!prevQtyById) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        refetchStores({ scope: 'current' })
        triggerMainPosPollNowRef.current?.({ force: true })
        return
      }
      const changedSet = collectDineInSnapshotIncreasedKeys(prevQtyById, newQtyById)
      if (changedSet.size === 0) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }
      const storeCodeForSkip = String(row.store_code ?? storeCode)
      if (shouldSkipDineInRemoteAddAutoprint(orderId, storeCodeForSkip, prevQtyById, newQtyById, changedSet)) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }
      refetchStores({
        scope: skipLocalKitchenAutoprintForOrder(orderId, row) ? 'current' : 'all',
      })
      if (!wantRemoteDineInAdd) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }
      const shouldAutoPrintReceipt = autoPrint.receiptOnAddOrder || autoPrint.receiptOnOrder
      if (!shouldAutoPrintReceipt && !autoPrint.kitchenOnOrder) {
        dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
        return
      }
      const cartLikeNew = items.map((it) => ({
        id: resolveDineInKitchenSnapshotItemKey(it),
        name: it.name,
        price: it.price,
        quantity: it.qty,
        qty: it.qty,
        ...(it.note ? { note: formatLineNoteForPrint(it.note) } : {}),
        ...(it.menuId ? { menuId: it.menuId } : {}),
        ...(it.source ? { source: it.source } : {}),
        ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
      }))
      const kitchenCartLines = buildKitchenCartLinesFromSnapshotDelta(
        cartLikeNew,
        prevQtyById,
        newQtyById,
        (line) => resolveDineInKitchenSnapshotItemKey(line)
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
        ...(changedSet.has(resolveDineInKitchenSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
      }))
      const hallAddonLinesRemote = receiptPrintItemsRemote.filter((it) => it.isAddon === true)
      const skipQrGuestHall = shouldSkipHallAutoprintForQrGuestAddon(
        hallAddonLinesRemote.length > 0 ? hallAddonLinesRemote : kitchenCartLines
      )
      const printHallAddon = shouldAutoPrintReceipt && !skipQrGuestHall
      const receiptPayloadRemote: HallReceiptPrintPayload = {
        orderNo: String(row.order_no ?? ''),
        storeCode: storeCodeForSkip,
        orderType: t('posOrderTypeDineIn') || '매장',
        tableName: String(row.table_name ?? ''),
        memo: String(row.memo ?? ''),
        items: receiptPrintItemsRemote,
        subtotal: mergeSubtotal,
        discountAmt,
        couponDiscountAmt,
        discountReason: String(row.discount_reason ?? '').trim() || undefined,
        total: pricing.finalTotal,
        _autoPrintDedupeKey: `order:${orderId}:hall:add:${buildDineInAddKitchenPrintDedupeSuffix(kitchenCartLines)}`,
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
      dineInRemoteItemQtySnapshotRef.current.set(orderId, newQtyById)
      if (printHallAddon) {
        void printHallReceiptPayload(receiptPayloadRemote, autoprintCtx)
      }
      if (autoPrint.kitchenOnOrder && kitchenCartLines.length > 0) {
        const kitchenDelayMs = printHallAddon
          ? typeof window !== 'undefined' && window.cmPosShell
            ? resolveAfterReceiptToKitchenDelayMs()
            : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
          : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
        setTimeout(() => {
          const kitchenDedupeKey = buildDineInAddKitchenAutoPrintDedupeKey(orderId, kitchenCartLines)
          if (!reserveKitchenAutoPrintKey(kitchenDedupeKey)) return
          const orderForKitchen = {
            id: orderId,
            orderNo: String(row.order_no ?? ''),
            storeCode: storeCodeForSkip,
            orderType: 'dine_in',
            tableName: String(row.table_name ?? ''),
            memo: String(row.memo ?? ''),
            items: kitchenCartLines as PosOrder['items'],
            guestCount: Number(row.guest_count ?? 0) || undefined,
          } as PosOrder
          void printKitchenForOrder(orderForKitchen, autoprintCtx, {
            kitchenLines: kitchenCartLines as Array<Record<string, unknown>>,
            dedupeKey: kitchenDedupeKey,
          }).catch(() => releaseKitchenAutoPrintKey(kitchenDedupeKey))
        }, kitchenDelayMs)
      }
    }

    const channels = currentStoreCodeVariants
      .map((code) =>
        subscribePosOrdersUpdate(onUpdate, {
          store: code,
          ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        })
      )
      .filter(Boolean)

    return () => {
      channels.forEach((ch) => ch?.unsubscribe())
    }
  }, [
    isMainPosDevice,
    storeCode,
    autoprintCtx,
    currentStoreCodeVariants,
    autoPrint,
    pricingAdjustments,
    t,
    refetchStores,
    isCurrentStoreOrder,
    resolveOrderItemDisplayName,
    enrichPromoItemsWithOptionName,
    dispatchPaymentReceiptFromOrder,
    printPaymentReceiptIfEnabled,
    skipLocalKitchenAutoprintForOrder,
    auth?.tenantId,
    shouldSkipDineInRemoteAddAutoprint,
    reserveKitchenAutoPrintKey,
    releaseKitchenAutoPrintKey,
    clearTableOrder,
    formatLineNoteForPrint,
    buildDineInQtySnapshotForStore,
  ])

  // Main POS poll loop
  useEffect(() => {
    if (!isMainPosDevice || !storeCode || !autoprintCtx) {
      if (!isMainPosDevice) clearPosMainDeviceSyncStateOnNonMain()
      triggerMainPosPollNowRef.current = null
      return
    }

    if (prevStoreForPollRef.current !== storeCode) {
      resetPosMainDeviceSyncStateForStore(storeCode)
    }

    const today = getPosBusinessDateStr()
    const poll = async () => {
      if (mainPosPollInFlightRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      mainPosPollInFlightRef.current = true
      try {
        const runPaymentReceiptScan = async () => {
          await seedPaymentReceiptIdsForStore(storeCode)
          if (!autoPrint.receiptOnPayment) return
          if (
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
              storeCode,
              statusPaidLike: true,
              limit: 800,
              orderBy: 'id.desc',
              pollMinimal: true,
            })
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
                    const fullRows = await getPosOrders({ orderId: oid, storeCode })
                    const full = fullRows[0]
                    if (!full) return
                    await dispatchPaymentReceiptFromOrder(full)
                  } catch {
                    /* ignore */
                  }
                })()
              }, staggerMs)
              staggerMs += 900
            }
          } catch {
            /* ignore */
          }
        }

        const sinceId =
          hasInitializedMainPosPollRef.current && lastSeenOrderIdRef.current > 0
            ? lastSeenOrderIdRef.current
            : undefined
        const orders = await getPosOrders({
          startStr: today,
          endStr: today,
          posBizDayScope: true,
          storeCode,
          pollMinimal: true,
          ...(sinceId != null ? { sinceId } : {}),
        })

        if (!hasInitializedMainPosPollRef.current) {
          const maxId = orders.length ? Math.max(...orders.map((o) => o.id ?? 0)) : 0
          for (const o of orders) {
            const oid = Number(o.id)
            if (Number.isFinite(oid) && oid > 0) {
              seenOrderIdsRef.current.add(oid)
              if (String(o.orderType ?? '').trim().toLowerCase() === 'dine_in' && (o.items || []).length > 0) {
                const qtySnap = buildDineInQtySnapshotForStore(o.items || [])
                if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
              }
            }
          }
          const seededMax = Math.max(lastSeenOrderIdRef.current, maxId)
          bumpLastSeenOrderId(storeCode, seededMax)
          hasInitializedMainPosPollRef.current = true
          syncGrabCancelWatchSnapshot(orders, grabCancelWatchSnapshotRef.current, { seedOnly: true })
          grabCancelWatchSeededRef.current = true
          await runPaymentReceiptScan()
          return
        }

        let shouldRefresh = false
        for (const order of orders) {
          const oid = Number(order.id)
          if (!Number.isFinite(oid) || oid <= 0) continue
          if (!isCurrentStoreOrder(order.storeCode ?? '')) {
            bumpLastSeenOrderId(storeCode, oid)
            continue
          }
          if (!shouldTreatAsIncomingOrder(oid, order.createdAt)) {
            bumpLastSeenOrderId(storeCode, oid)
            continue
          }
          if (seenOrderIdsRef.current.has(oid)) {
            bumpLastSeenOrderId(storeCode, oid)
            continue
          }
          if (consumeSuppressMainPosAutoPrintForQueuedSync(oid)) {
            seenOrderIdsRef.current.add(oid)
            bumpLastSeenOrderId(storeCode, oid)
            continue
          }
          const items = prepareOrderItemsForKitchenPrint(order.items || [], autoprintCtx, order.deliveryAppCode)
          if (items.length === 0) continue
          seenOrderIdsRef.current.add(oid)
          bumpLastSeenOrderId(storeCode, oid)

          const inferredDeliveryCode =
            String(order.deliveryAppCode ?? '').trim() ||
            String((order.items || []).find((it) => String(it.deliveryAppCode ?? '').trim())?.deliveryAppCode ?? '').trim()

          handleIncomingDelivery({
            orderId: oid,
            orderType: String(order.orderType ?? ''),
            deliveryAppCode: inferredDeliveryCode,
            status: String(order.status ?? ''),
            createdAt: String(order.createdAt ?? ''),
            storeCode: String(order.storeCode ?? ''),
            memo: String(order.memo ?? ''),
          })
          shouldRefresh = true

          const receiptPayload = {
            ...hallOrderReceiptPayloadFromPosOrder(order, pricingAdjustments, {
              ...posReceiptLineOpts,
              orderTypeLabel: resolvePosOrderTypeReceiptLabel(order.orderType, t),
              storeCodeFallback: storeCode,
            }),
            _autoPrintDedupeKey: `order:${oid}:hall:auto`,
          }

          const isPendingDelivery =
            String(order.orderType ?? '').trim().toLowerCase() === 'delivery' &&
            String(order.status ?? '').trim().toLowerCase() === 'pending'
          const shouldWaitForDeliveryAccept = isPendingDelivery && isApiInboundDeliveryOrderMemo(String(order.memo ?? ''))
          const shouldWaitForMemberPortalPrepay = isMemberPortalPaymentPendingOrder({
            memo: String(order.memo ?? ''),
            status: String(order.status ?? ''),
            payment_qr: order.paymentQr,
            created_by: undefined,
          })
          const shouldDeferAutoprint = shouldWaitForDeliveryAccept || shouldWaitForMemberPortalPrepay

          if (!skipLocalKitchenAutoprintForOrder(oid, {
            memo: String(order.memo ?? ''),
            order_type: String(order.orderType ?? ''),
            created_by: String((order as { createdBy?: string }).createdBy ?? ''),
          })) {
            runAutoprintForNewOrder(oid, receiptPayload, order, 'poll', shouldDeferAutoprint)
          } else if (shouldSyncHostKitchenFallbackForTerminalOrder(oid, storeCode, autoPrint.kitchenOnOrder)) {
            runKitchenAutoprintForOrder(order, autoprintCtx, 'poll_terminal_kitchen_fallback')
          }

          if (String(order.orderType ?? '').trim().toLowerCase() === 'dine_in' && items.length > 0) {
            const qtySnap = buildDineInQtySnapshotForStore(items)
            if (qtySnap.size > 0) dineInRemoteItemQtySnapshotRef.current.set(oid, qtySnap)
          }
        }

        if (shouldRefresh) refetchStores({ scope: 'current' })

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
          const wantMetaDineInAddonReceipt = autoPrint.receiptOnAddOrder || autoPrint.receiptOnOrder
          const wantMetaDineInAddonKitchen = autoPrint.kitchenOnOrder
          const wantDineInAddonMetaScan =
            !shouldSyncHostSkipDineInAddonMetaScan() &&
            (wantMetaDineInAddonReceipt || wantMetaDineInAddonKitchen)
          if (needHeavyMetaScan || wantDineInAddonMetaScan) {
            try {
              const watchOrders = await getPosOrders({
                startStr: today,
                endStr: today,
                posBizDayScope: true,
                storeCode,
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
                  const items = (o.items || []).map((it) => {
                    const note = String(it.note ?? '').trim()
                    const menuId = String(it.menuId1 ?? '').trim()
                    const optionCode = String(it.optionCode1 ?? '').trim()
                    const displayName = resolveOrderItemDisplayName({
                      id: String(it.id ?? ''),
                      name: String(it.name ?? ''),
                      menuId,
                    })
                    const lineDiscountAmt = coercePosReceiptLineDiscountAmt(it)
                    const source = String((it as { source?: unknown }).source ?? '').trim()
                    return {
                      id: String(it.id ?? ''),
                      name: displayName,
                      price: Number(it.price ?? 0),
                      qty: Number(it.qty ?? it.quantity ?? 1),
                      ...(menuId ? { menuId } : {}),
                      ...(optionCode ? { optionCode } : {}),
                      ...(note ? { note: formatLineNoteForPrint(note) } : {}),
                      ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
                      ...(source ? { source } : {}),
                      ...(Array.isArray(it.promoItems)
                        ? { promoItems: enrichPromoItemsWithOptionName(it.promoItems) }
                        : {}),
                    }
                  })
                  if (!items.length) continue
                  const prevQtyById = dineInRemoteItemQtySnapshotRef.current.get(oid)
                  const newQtyById = buildDineInQtySnapshotForStore(items)
                  if (newQtyById.size === 0) continue
                  const suppressUntil = mainPosSelfDineInUpdateSuppressUntilRef.current.get(oid)
                  if (suppressUntil != null) {
                    if (Date.now() < suppressUntil) {
                      dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
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
                  const storeCodePoll = String(o.storeCode ?? storeCode)
                  const changedSet = new Set(changedIds)
                  if (
                    shouldSkipDineInRemoteAddAutoprint(oid, storeCodePoll, prevQtyById, newQtyById, changedSet)
                  ) {
                    dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                    continue
                  }
                  const cartLikeNew = items.map((it) => ({
                    id: resolveDineInKitchenSnapshotItemKey(it),
                    name: it.name,
                    price: it.price,
                    quantity: it.qty,
                    qty: it.qty,
                    ...(it.note ? { note: formatLineNoteForPrint(it.note) } : {}),
                    ...(it.menuId ? { menuId: it.menuId } : {}),
                    ...(it.source ? { source: it.source } : {}),
                    ...(Array.isArray(it.promoItems) ? { promoItems: it.promoItems } : {}),
                  }))
                  const kitchenCartLines = buildKitchenCartLinesFromSnapshotDelta(
                    cartLikeNew,
                    prevQtyById,
                    newQtyById,
                    (line) => resolveDineInKitchenSnapshotItemKey(line)
                  )
                  dineInRemoteItemQtySnapshotRef.current.set(oid, newQtyById)
                  refetchStores({ scope: 'all' })
                  const receiptPrintItemsRemote = items.map((it) => ({
                    ...it,
                    ...(changedSet.has(resolveDineInKitchenSnapshotItemKey(it)) ? { isAddon: true as const } : {}),
                  }))
                  const hallAddonLinesRemote = receiptPrintItemsRemote.filter((it) => it.isAddon === true)
                  const skipQrGuestHall = shouldSkipHallAutoprintForQrGuestAddon(
                    hallAddonLinesRemote.length > 0 ? hallAddonLinesRemote : kitchenCartLines
                  )
                  const printHallAddon = wantMetaDineInAddonReceipt && !skipQrGuestHall
                  const mergeSubtotal = items.reduce((s, i) => s + i.price * i.qty, 0)
                  const discountAmt = Number(o.discountAmt ?? 0)
                  const couponDiscountAmt = Number(o.couponDiscountAmt ?? 0)
                  const pricing = computePosPricing({
                    subtotal: mergeSubtotal,
                    discountAmt,
                    cardPaymentAmount: 0,
                    adjustments: pricingAdjustments,
                  })
                  const receiptPayloadRemote: HallReceiptPrintPayload = {
                    orderNo: String(o.orderNo ?? ''),
                    storeCode: storeCodePoll,
                    orderType: t('posOrderTypeDineIn') || '매장',
                    tableName: String(o.tableName ?? ''),
                    memo: String(o.memo ?? ''),
                    items: receiptPrintItemsRemote,
                    subtotal: mergeSubtotal,
                    discountAmt,
                    couponDiscountAmt,
                    discountReason: String(o.discountReason ?? '').trim() || undefined,
                    total: pricing.finalTotal,
                    _autoPrintDedupeKey: `order:${oid}:hall:add:${buildDineInAddKitchenPrintDedupeSuffix(kitchenCartLines)}`,
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
                  if (printHallAddon) {
                    void printHallReceiptPayload(receiptPayloadRemote, autoprintCtx)
                  }
                  if (wantMetaDineInAddonKitchen && kitchenCartLines.length > 0) {
                    const kitchenDelayMs = printHallAddon
                      ? typeof window !== 'undefined' && window.cmPosShell
                        ? resolveAfterReceiptToKitchenDelayMs()
                        : POS_THERMAL_AFTER_RECEIPT_TO_KITCHEN_MS
                      : KITCHEN_ONLY_AUTOPRINT_DISPATCH_DELAY_MS
                    setTimeout(() => {
                      const kitchenDedupeKey = buildDineInAddKitchenAutoPrintDedupeKey(oid, kitchenCartLines)
                      if (!reserveKitchenAutoPrintKey(kitchenDedupeKey)) return
                      const orderForKitchen = {
                        id: oid,
                        orderNo: String(o.orderNo ?? ''),
                        storeCode: storeCodePoll,
                        orderType: 'dine_in',
                        tableName: String(o.tableName ?? ''),
                        memo: String(o.memo ?? ''),
                        items: kitchenCartLines as PosOrder['items'],
                        guestCount: Number(o.guestCount ?? 0) || undefined,
                      } as PosOrder
                      void printKitchenForOrder(orderForKitchen, autoprintCtx, {
                        kitchenLines: kitchenCartLines as Array<Record<string, unknown>>,
                        dedupeKey: kitchenDedupeKey,
                      }).catch(() => releaseKitchenAutoPrintKey(kitchenDedupeKey))
                    }, kitchenDelayMs)
                  }
                }
              }
              if (needHeavyMetaScan || wantDineInAddonMetaScan) {
                const newlyCancelled = syncGrabCancelWatchSnapshot(watchOrders, grabCancelWatchSnapshotRef.current, {
                  seedOnly: !grabCancelWatchSeededRef.current,
                })
                grabCancelWatchSeededRef.current = true
                for (const orderId of newlyCancelled) {
                  const order = watchOrders.find((o) => Number(o.id) === orderId)
                  notifyGrabCancelFromHost({
                    orderId,
                    tableName: order?.tableName,
                    orderNo: order?.orderNo,
                  })
                }
              } else if (!grabCancelWatchSeededRef.current) {
                syncGrabCancelWatchSnapshot(watchOrders, grabCancelWatchSnapshotRef.current, { seedOnly: true })
                grabCancelWatchSeededRef.current = true
              }
            } catch {
              /* meta scan */
            }
          }
        }

        await runPaymentReceiptScan()
      } catch {
        /* poll errors */
      } finally {
        mainPosPollInFlightRef.current = false
      }
    }

    triggerMainPosPollNowRef.current = (opts) => {
      const now = Date.now()
      if (!opts?.force && now - lastTriggerMainPosPollAtRef.current < MAIN_POS_TRIGGER_POLL_MIN_MS) return
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
    storeCode,
    autoprintCtx,
    autoPrint,
    pricingAdjustments,
    posReceiptLineOpts,
    t,
    refetchStores,
    isCurrentStoreOrder,
    shouldTreatAsIncomingOrder,
    handleIncomingDelivery,
    runAutoprintForNewOrder,
    dispatchPaymentReceiptFromOrder,
    seedPaymentReceiptIdsForStore,
    skipLocalKitchenAutoprintForOrder,
    resolveOrderItemDisplayName,
    enrichPromoItemsWithOptionName,
    shouldSkipDineInRemoteAddAutoprint,
    reserveKitchenAutoPrintKey,
    releaseKitchenAutoPrintKey,
    notifyGrabCancelFromHost,
  ])

  /** items_json 없는 head 폴링 — Realtime 활발 시 미호출, 무음·장애 시 안전망 */
  useEffect(() => {
    if (!isMainPosDevice || !storeCode) return
    /** 터미널이 자체 head poll 할 때만 호스트는 쉼. 레이아웃 호스트가 담당하면 터미널이 열려도 여기서 돈다. */
    if (isPosTerminalLocalAutoprintActive() && !isPosMainDeviceSyncOwnedByLayout()) return
    let cancelled = false
    let timerId = 0
    let seeded = false
    const updatedAtByOrderId = new Map<number, string>()
    const today = getPosBusinessDateStr()

    const scheduleNext = () => {
      if (cancelled) return
      if (isPosTerminalLocalAutoprintActive() && !isPosMainDeviceSyncOwnedByLayout()) {
        timerId = window.setTimeout(() => scheduleNext(), 15_000)
        return
      }
      const { delayMs, fetch: shouldFetch } = resolveMainPosHeadPollSchedule({
        realtimeChannelHealthy: realtimeChannelHealthyRef.current,
        realtimeRecentlyActive: isMainPosRealtimeRecentlyActive(lastRealtimeOrderEventAtRef.current),
      })
      timerId = window.setTimeout(() => {
        void (async () => {
          try {
            if (!shouldFetch) return
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            if (isPosTerminalLocalAutoprintActive() && !isPosMainDeviceSyncOwnedByLayout()) return
            const heads = await getPosOrders({
              startStr: today,
              endStr: today,
              posBizDayScope: true,
              storeCode,
              pollHeads: true,
              limit: 300,
              orderBy: 'updated_at.desc',
            })
            const { hasNewOrder, hasUpdatedOpenOrder } = detectMainPosHeadPollChanges({
              heads,
              lastSeenOrderId: lastSeenOrderIdRef.current,
              updatedAtByOrderId,
              seedOnly: !seeded,
            })
            seeded = true
            if (hasNewOrder || hasUpdatedOpenOrder) {
              if (hasUpdatedOpenOrder) lastMetaScanAtRef.current = 0
              triggerMainPosPollNowRef.current?.()
              refetchStores({ scope: 'current' })
            }
          } catch {
            /* head poll */
          } finally {
            scheduleNext()
          }
        })()
      }, delayMs)
    }

    scheduleNext()
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [isMainPosDevice, storeCode, refetchStores])

  // Grab 고객 취소 — Realtime UPDATE (메인 POS 전역)
  useEffect(() => {
    if (!isMainPosDevice || !storeCode) return

    const handleUpdate = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const row = payload?.new as Record<string, unknown> | undefined
      if (!row) return
      const orderId = coercePosOrderIdFromRealtime(row.id)
      if (orderId == null) return
      lastRealtimeOrderEventAtRef.current = Date.now()
      if (!isCurrentStoreOrder(row.store_code)) return

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
      notifyGrabCancelFromHost({
        orderId,
        tableName: String(row.table_name ?? ''),
        orderNo: String(row.order_no ?? ''),
      })
    }

    const channels = currentStoreCodeVariants
      .map((code) =>
        subscribePosOrdersUpdate(handleUpdate, {
          store: code,
          ...(auth?.tenantId ? { tenantId: auth.tenantId } : {}),
        })
      )
      .filter(Boolean)

    return () => {
      channels.forEach((channel) => channel?.unsubscribe())
    }
  }, [isMainPosDevice, storeCode, currentStoreCodeVariants, isCurrentStoreOrder, notifyGrabCancelFromHost, auth?.tenantId])

  // Resume: visibility / online → resubscribe + poll
  useEffect(() => {
    if (!isMainPosDevice || !storeCode) return
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
  }, [isMainPosDevice, storeCode, logPosPrintDebug])
}
