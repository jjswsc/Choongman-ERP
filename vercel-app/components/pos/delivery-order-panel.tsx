'use client'
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import type {
  PosDeliveryApp,
  PosMenu,
  PosMenuOption,
  PosOrderPackagingChecklistGroup,
  PosPromoWithItems,
} from '@/lib/api-client'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import {
  buildOptionNameByCodeFromMenus,
  resolveGrabDeliveryLineNote,
  translateGrabRequestSummaryChunks,
} from '@/lib/grab-pos-order-enrich'
import {
  getPosPackagingChecklistByOrder,
  grabCancelOrderByStoreApi,
  grabMarkOrderReadyApi,
  markPosOrderItemServed,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { executePosFullOrderCancel } from '@/lib/pos-order-full-cancel-execute'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, Clock } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { extractGrabOrderIdFromMemo, extractGrabStateFromMemo } from '@/lib/grab-order-memo'
import { markPosSelfInitiatedGrabCancel } from '@/lib/pos-grab-cancel-alert-suppress'
import {
  grabStateToStageIndex,
  GRAB_DELIVERY_PROGRESS_STAGE_COUNT,
} from '@/lib/grab-delivery-progress'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import {
  PosOrderTaxInvoiceEntryRow,
  PosOrderTaxInvoiceStatusButton,
} from '@/components/pos/pos-tax-invoice-form-ui'
import { buildPosSetChildKey, listPosSetChildKeys, readPosSetChildrenState } from '@/lib/pos-set-children-state'
import { buildPosOrderLineKeys, getPosOrderLineByKey } from '@/lib/pos-order-line-keys'
import { canStartPosLinePartialCancel } from '@/lib/pos-order-line-update'
import { orderItemLineQty } from '@/lib/pos-order-line-cancel'
import {
  alertPosLineCancelBlocked,
  executePosOrderLineCancel,
} from '@/lib/pos-order-line-cancel-execute'
import {
  kitchenRoutingItemFromOrderItem,
  preparePosOrderItemsForKitchenSlip,
  type PosKitchenReprintPayload,
} from '@/lib/pos-kitchen-slip-routing'
import { PosLineCancelQtyDialog } from '@/components/pos/pos-line-cancel-qty-dialog'
import type { PosOrderReceiptLineOptions } from '@/lib/pos-payment-receipt-from-order'
import type { OrderItem } from '@/lib/pos-types'

export interface DeliveryOrderPanelProps {
  orderLabel: string
  order: Order | null
  /** 품목 `name`이 코드로만 온 경우(Grab 등) POS 메뉴명으로 복원 */
  menus?: PosMenu[]
  menuOptions?: PosMenuOption[]
  promos?: PosPromoWithItems[]
  deliveryApps?: PosDeliveryApp[]
  onPackaged?: () => void
  /** pending 주문 수락(รับออเดอร์) 직후 상위에서 후속 처리(예: 자동 인쇄) */
  onAccepted?: (params: {
    orderId: number
    storeCode?: string
    memo?: string
    deliveryAppCode?: string
  }) => void | Promise<void>
  onPay?: () => void
  onOpenTaxInvoice?: () => void
  /** 주문 취소 시 */
  onCancel?: () => void
  /** 전체 취소 성공 직후 — 터미널 목록·sessionStorage에서 즉시 제거 */
  onOrderDismissed?: (order: Order) => void
  /** 일부 취소 직후 홀·주방 재인쇄(터미널) */
  onAfterPartialLineRemoved?: (orderId: number, detail?: PosKitchenReprintPayload) => void | Promise<void>
  /** 전체 취소·거절 직후 주방 취소 전표 */
  onAfterFullOrderKitchenReprint?: (orderId: number, detail: PosKitchenReprintPayload) => void | Promise<void>
  onClose?: () => void
  storeCode?: string
  t?: (key: string) => string
}

export function DeliveryOrderPanel({
  orderLabel,
  order,
  menus: menusFromProps = [],
  menuOptions: menuOptionsFromProps = [],
  promos: promosFromProps = [],
  deliveryApps: _deliveryApps = [],
  onPackaged,
  onAccepted,
  onPay,
  onOpenTaxInvoice,
  onCancel,
  onOrderDismissed,
  onAfterPartialLineRemoved,
  onAfterFullOrderKitchenReprint,
  onClose,
  storeCode,
  t = (k) => k,
}: DeliveryOrderPanelProps) {
  const { lang } = useLang()
  const ti = useT(lang)
  const normalizedStatus = String(order?.status ?? '').trim().toLowerCase()
  const isCompleted = normalizedStatus === 'completed'
  const isPaid = normalizedStatus === 'paid' || normalizedStatus === 'completed'
  const hasTaxInvoice = Boolean(parsePosOrderMemo(order?.memo).taxInvoice)
  const [itemPackaged, setItemPackaged] = useState<Record<string, boolean>>({})
  const [itemChildPackaged, setItemChildPackaged] = useState<Record<string, boolean>>({})
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [optimisticGrabState, setOptimisticGrabState] = useState<string | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistSubmitting, setChecklistSubmitting] = useState(false)
  const [checklistGroups, setChecklistGroups] = useState<PosOrderPackagingChecklistGroup[]>([])

  const isGrabDeliveryOrder = Boolean(order && /grab_order:/i.test(String(order.memo ?? '')))

  const optionNameByCode = useMemo(
    () => buildOptionNameByCodeFromMenus(menusFromProps, menuOptionsFromProps),
    [menusFromProps, menuOptionsFromProps]
  )

  const parseItemMeta = useCallback(
    (rawNote?: string) => {
    const raw = String(rawNote || '').trim()
    if (!raw) return { optionSummary: '', optionChips: [] as string[], requestSummary: '' }
    if (isGrabDeliveryOrder || /optc:/i.test(raw)) {
      const meta = resolveGrabDeliveryLineNote(raw, optionNameByCode)
      return {
        ...meta,
        requestSummary: translateGrabRequestSummaryChunks(meta.requestSummary, ti),
      }
    }
    const note = normalizePosLineNote(raw, { keepOptionSummary: true })
    if (!note) return { optionSummary: '', optionChips: [] as string[], requestSummary: '' }
    const chunks = note
      .split('·')
      .map((s) => s.trim())
      .filter(Boolean)
    let optionSummary = ''
    const requests: string[] = []
    for (const chunk of chunks) {
      const m = /^mods:\s*(.+)$/i.exec(chunk)
      if (m?.[1]) {
        optionSummary = m[1].trim()
        continue
      }
      requests.push(chunk)
    }
    return {
      optionSummary,
      optionChips: optionSummary
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      requestSummary: requests.join(' · '),
    }
  },
    [isGrabDeliveryOrder, optionNameByCode, ti]
  )

  const menuNameById = useMemo(() => {
    const m = new Map<string, string>()
    menusFromProps.forEach((row) => {
      const id = String(row.id ?? '').trim()
      if (!id) return
      m.set(id, String(row.name ?? '').trim() || id)
    })
    return m
  }, [menusFromProps])

  const optionNameById = useMemo(() => {
    const m = new Map<string, string>()
    menuOptionsFromProps.forEach((opt) => {
      const id = String(opt.id ?? '').trim()
      const name = String(opt.name ?? '').trim()
      if (id && name) m.set(id, name)
    })
    return m
  }, [menuOptionsFromProps])

  const promoCatalogById = useMemo(() => {
    const m = new Map<string, PosPromoWithItems>()
    for (const p of promosFromProps) {
      const id = String(p?.id ?? '').trim()
      if (id) m.set(id, p)
    }
    return m
  }, [promosFromProps])

  const posReceiptLineOpts: PosOrderReceiptLineOptions = useMemo(
    () => ({ promoCatalogById, menus: menusFromProps }),
    [promoCatalogById, menusFromProps]
  )

  const enrichPromoItemsWithOptionName = useCallback(
    (list: NonNullable<OrderItem['promoItems']>) =>
      list.map((p) => ({
        ...p,
        ...(p.optionCode && optionNameByCode.get(String(p.optionCode).trim())
          ? { optionName: optionNameByCode.get(String(p.optionCode).trim()) }
          : {}),
        ...(p.optionId && optionNameById.get(String(p.optionId).trim())
          ? { optionName: optionNameById.get(String(p.optionId).trim()) }
          : {}),
      })),
    [optionNameByCode, optionNameById]
  )

  /** 주방 슬립과 동일: DB 스냅샷·카탈로그로 세트 구성 보강 */
  const displayItems = useMemo((): OrderItem[] => {
    if (!order?.items?.length) return []
    const routingRows = order.items.map((it) => {
      const raw = resolvePosOrderItemMenuDisplayName(
        { id: it.id, name: it.name, menuId: it.menuId, promoId: it.promoId, promoCode: it.promoCode },
        menusFromProps,
        promosFromProps
      )
      // translatePosMenuLineForReceipt는 _t 미사용 — useMemo에 ti 넣으면 매 렌더 재계산
      return kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(raw))
    })
    const prepared = preparePosOrderItemsForKitchenSlip(routingRows, {
      ...posReceiptLineOpts,
      menus: menusFromProps,
    })
    return order.items.map((orig, idx) => {
      const fromPrepared = prepared[idx]?.promoItems
      const promoItems =
        Array.isArray(fromPrepared) && fromPrepared.length > 0
          ? enrichPromoItemsWithOptionName(fromPrepared as NonNullable<OrderItem['promoItems']>)
          : Array.isArray(orig.promoItems) && orig.promoItems.length > 0
            ? enrichPromoItemsWithOptionName(orig.promoItems)
            : undefined
      return promoItems ? { ...orig, promoItems } : orig
    })
  }, [
    order?.items,
    menusFromProps,
    promosFromProps,
    posReceiptLineOpts,
    enrichPromoItemsWithOptionName,
  ])

  const childStateMapKey = (itemId: string, childKey: string) => `${itemId}::${childKey}`
  const resolveSetChildRows = (item: OrderItem) => {
    const rows: Array<{ key: string; label: string }> = []
    const parentQty = Math.max(1, Math.trunc(Number(item.quantity ?? 1) || 1))
    ;(item.promoItems ?? []).forEach((line, idx) => {
      const qty = Math.max(1, Math.trunc(Number(line.quantity ?? 1) || 1)) * parentQty
      const rawMenu =
        menuNameById.get(String(line.menuId ?? '').trim()) ||
        String(line.menuName ?? '').trim() ||
        String(line.menuId ?? '').trim() ||
        `Set ${idx + 1}`
      const optCode = String(line.optionCode ?? '').trim().toUpperCase()
      const optFromCode = optCode ? optionNameByCode.get(optCode) : ''
      const rawOpt =
        String(line.optionName ?? '').trim() ||
        optFromCode ||
        String(line.optionId ?? '').trim()
      const childLabel = rawOpt ? `${rawMenu} (${rawOpt})` : rawMenu
      for (let n = 0; n < qty; n += 1) rows.push({ key: buildPosSetChildKey(line, idx, n), label: childLabel })
    })
    return rows
  }

  const lineKeys = useMemo(() => buildPosOrderLineKeys(order?.items ?? []), [order?.items])

  useEffect(() => {
    if (!order?.items?.length) {
      setItemPackaged((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      setItemCancelled((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }
    const keys = buildPosOrderLineKeys(order.items)
    setItemPackaged((prev) => {
      let changed = false
      const next = { ...prev }
      for (let i = 0; i < order.items.length; i++) {
        const k = keys[i] ?? `line-${i}`
        const v = Boolean(order.items[i].servedAt)
        if (next[k] !== v) { next[k] = v; changed = true }
      }
      for (const k of Object.keys(prev)) {
        if (!keys.includes(k) && !k.startsWith('line-')) { delete next[k]; changed = true }
      }
      return changed ? next : prev
    })
    setItemCancelled((prev) => {
      let changed = false
      const next = { ...prev }
      for (let i = 0; i < order.items.length; i++) {
        const k = keys[i] ?? `line-${i}`
        const v = Boolean(order.items[i].cancelledAt)
        if (next[k] !== v) { next[k] = v; changed = true }
      }
      for (const k of Object.keys(prev)) {
        if (!keys.includes(k) && !k.startsWith('line-')) { delete next[k]; changed = true }
      }
      return changed ? next : prev
    })
  }, [order?.id, order?.items])

  useEffect(() => {
    if (!order?.items?.length) {
      setItemChildPackaged((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      return
    }
    const keys = buildPosOrderLineKeys(order.items)
    const enriched = displayItems.length ? displayItems : order.items
    setItemChildPackaged((prev) => {
      let changed = false
      const next = { ...prev }
      enriched.forEach((it, i) => {
        const lineKey = keys[i] ?? `line-${i}`
        const childKeys = listPosSetChildKeys(Array.isArray(it.promoItems) ? it.promoItems : [])
        if (!childKeys.length) return
        const childState = readPosSetChildrenState(it.setChildrenState)
        childKeys.forEach((key) => {
          const raw = childState[key]
          const done = Boolean(String(raw?.packedAt ?? raw?.servedAt ?? (it.servedAt ? '1' : '')).trim())
          const mapKey = childStateMapKey(lineKey, key)
          if (next[mapKey] !== done) { next[mapKey] = done; changed = true }
        })
      })
      for (const k of Object.keys(prev)) {
        if (!k.includes('::')) continue
        const itemId = k.split('::')[0]
        if (!keys.includes(itemId) && !itemId.startsWith('line-')) { delete next[k]; changed = true }
      }
      return changed ? next : prev
    })
  }, [order?.id, order?.items, displayItems])

  useEffect(() => {
    setOptimisticGrabState(null)
  }, [order?.id, order?.memo, order?.status])

  const toggleItemPackaged = async (itemId: string) => {
    if (!order) return
    if (itemCancelled[itemId]) return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : ti('posServedNeedsOrderId'))
      return
    }
    const nextPackaged = !itemPackaged[itemId]
    setSavingItemId(itemId)
    try {
      const res = await markPosOrderItemServed({
        id,
        itemId,
        served: nextPackaged,
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setItemPackaged((prev) => ({ ...prev, [itemId]: nextPackaged }))
      onPackaged?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setSavingItemId(null)
    }
  }

  const toggleSetChildPackaged = async (itemId: string, childKey: string) => {
    if (!order) return
    if (itemCancelled[itemId]) return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : ti('posServedNeedsOrderId'))
      return
    }
    const mapKey = childStateMapKey(itemId, childKey)
    const nextPackaged = !itemChildPackaged[mapKey]
    setSavingItemId(itemId)
    try {
      const res = await markPosOrderItemServed({
        id,
        itemId,
        childKey,
        mode: 'packed',
        served: nextPackaged,
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setItemChildPackaged((prev) => ({ ...prev, [mapKey]: nextPackaged }))
      const childServedCount = Number(res.childServedCount ?? -1)
      const childTotalCount = Number(res.childTotalCount ?? -1)
      if (childServedCount >= 0 && childTotalCount >= 0) {
        setItemPackaged((prev) => ({ ...prev, [itemId]: childServedCount >= childTotalCount }))
      }
      onPackaged?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setSavingItemId(null)
    }
  }

  const activeLineEntries =
    order?.items
      ?.map((it, i) => ({ it, lineKey: lineKeys[i] ?? `line-${i}` }))
      .filter(({ lineKey }) => !itemCancelled[lineKey]) ?? []
  const packagedCount = activeLineEntries.filter(({ lineKey }) => itemPackaged[lineKey]).length
  const allPackaged = activeLineEntries.length > 0 ? packagedCount >= activeLineEntries.length : false

  /** `paid`는 결제 완료·회계 반영 전 단계 — `completed`와 동일하게 취소 UI 비표시 */
  const canCancel =
    order &&
    !['completed', 'cancelled', 'paid', 'refunded'].includes(normalizedStatus)
  const [cancelling, setCancelling] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)
  const [cancelQtyDialogOpen, setCancelQtyDialogOpen] = useState(false)

  useEffect(() => {
    if (!order?.items?.length) {
      setSelectedLineItemId(null)
      return
    }
    const keys = buildPosOrderLineKeys(order.items)
    setSelectedLineItemId((prev) => {
      if (!prev) return null
      const idx = keys.indexOf(prev)
      if (idx < 0) return null
      const it = order.items[idx]
      return it && !it.cancelledAt ? prev : null
    })
  }, [order?.id, order?.items])

  const cancelQtyTargetItem = useMemo(
    () => (selectedLineItemId && order ? getPosOrderLineByKey(order.items, selectedLineItemId) : null),
    [order, selectedLineItemId]
  )

  const lineCancelDisplayLabel = useCallback(
    (it: OrderItem) => {
      const raw = resolvePosOrderItemMenuDisplayName(
        { id: it.id, name: it.name, menuId: it.menuId, promoId: it.promoId, promoCode: it.promoCode },
        menusFromProps,
        promosFromProps
      )
      return translatePosMenuLineForReceipt(raw, ti)
    },
    [menusFromProps, promosFromProps, ti]
  )

  const grabOrderId = order ? extractGrabOrderIdFromMemo(String(order.memo ?? '')) : ''

  const grabProgress = (() => {
    if (!order || !grabOrderId) return null as null | { cancelled: boolean; current: number }
    const memo = String(order.memo ?? '')
    const gs = optimisticGrabState || extractGrabStateFromMemo(memo)
    if (gs) {
      const si = grabStateToStageIndex(gs)
      if (si < 0) return { cancelled: true, current: 0 }
      return { cancelled: false, current: Math.min(GRAB_DELIVERY_PROGRESS_STAGE_COUNT - 1, Math.max(0, si)) }
    }
    const st = String(order.status ?? '').toLowerCase()
    if (st === 'pending') return { cancelled: false, current: 0 }
    if (st === 'preparing') return { cancelled: false, current: 1 }
    if (st === 'ready') return { cancelled: false, current: 4 }
    if (st === 'paid' || st === 'completed') return { cancelled: false, current: 5 }
    return { cancelled: false, current: 0 }
  })()

  const grabStageKeys = [
    'posGrabStageWaitConfirm',
    'posGrabStageAccepted',
    'posGrabStageDriverFound',
    'posGrabStageDriverArrived',
    'posGrabStageCollected',
    'posGrabStageDelivered',
  ] as const
  const isManualPending = String(order?.status ?? '').trim().toLowerCase() === 'pending'

  const handleCancelOrder = async () => {
    if (!order || !await appConfirm(t('posCancelConfirm') || '이 주문을 취소하시겠습니까?')) return
    setCancelling(true)
    try {
      const outcome = await executePosFullOrderCancel({
        order,
        storeCode: storeCode || '',
        onAlert: appAlert,
        onConfirm: appConfirm,
        onPrompt: appPrompt,
        failMessageFallback: t('processFail') || '처리 실패',
        i18n: {
          reasonPrompt: t('posCancelReasonPrompt') || '취소 사유를 입력하세요 (2자 이상, 메모에 기록됩니다)',
          reasonTooShort: t('posReceiptPayCorrectReasonShort') || '사유를 2자 이상 입력해 주세요.',
        },
      })
      if (!outcome.ok) return
      const oid = outcome.serverId ?? (posOrderHasServerId(order.id) ? Number(order.id) : 0)
      if (order.items.length > 0) {
        const kitchenLines = order.items.map((it) => {
          const raw = resolvePosOrderItemMenuDisplayName(
            { id: it.id, name: it.name, menuId: it.menuId, promoId: it.promoId, promoCode: it.promoCode },
            menusFromProps,
            promosFromProps
          )
          return kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(raw, ti))
        })
        await onAfterFullOrderKitchenReprint?.(oid, {
          removedKitchenLines: kitchenLines,
          orderNoForPrint: order.orderNo,
          tableName: order.tableName,
          memo: order.memo,
        })
      }
      onOrderDismissed?.(order)
      onCancel?.()
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setCancelling(false)
    }
  }

  const applyLineCancel = async (itemId: string, cancelQty: number, confirmBeforeApply: boolean) => {
    if (!order) return
    const target = getPosOrderLineByKey(order.items, itemId)
    if (!target) return
    const label = lineCancelDisplayLabel(target)
    setRemovingItemId(itemId)
    try {
      const result = await executePosOrderLineCancel({
        order,
        itemId,
        cancelQty,
        displayLabel: label,
        t,
        tDefault: ti,
        lang,
        confirmBeforeApply,
        storeCode: storeCode || '',
        onAfterPartialLineRemoved,
        onRefresh: () => {
          setSelectedLineItemId(null)
          onPackaged?.()
        },
      })
      if (result === 'ok') setCancelQtyDialogOpen(false)
    } finally {
      setRemovingItemId(null)
    }
  }

  const handlePartialCancel = async () => {
    if (!order) return
    if (!selectedLineItemId || !cancelQtyTargetItem) {
      await appAlert(t('posLineItemSelectFirst') || ti('posLineItemSelectFirst'))
      return
    }
    if (!canStartPosLinePartialCancel(order)) {
      await alertPosLineCancelBlocked(order, t, ti)
      return
    }
    const lineQty = orderItemLineQty(cancelQtyTargetItem)
    if (lineQty > 1) {
      setCancelQtyDialogOpen(true)
      return
    }
    await applyLineCancel(selectedLineItemId, 1, true)
  }

  const handlePackComplete = async () => {
    if (!order || order.status === 'completed' || order.status === 'ready') return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    const completeReady = async () => {
      try {
        await updatePosOrderStatus({ id, status: 'ready' })
        if (grabOrderId) {
          try {
            const markRes = await grabMarkOrderReadyApi({ orderID: grabOrderId, markStatus: 1 })
            if (!markRes.success) {
              console.error('grabMarkOrderReadyApi:', markRes.message || 'failed')
            }
          } catch (e) {
            console.error('grabMarkOrderReadyApi:', e)
          }
        }
        onPackaged?.()
      } catch (e) {
        console.error('updatePosOrderStatus:', e)
      }
    }
    try {
      const checklistRes = await getPosPackagingChecklistByOrder({ orderId: id })
      if (!checklistRes.success) {
        const go = await appConfirm(
          t('posPackagingChecklistFetchFailContinue') ||
            '체크리스트를 불러오지 못했습니다. 체크 없이 포장 완료를 진행할까요?'
        )
        if (!go) return
        await completeReady()
        return
      }
      if (!checklistRes.hasChecklist || !Array.isArray(checklistRes.groups) || checklistRes.groups.length === 0) {
        await completeReady()
        return
      }
      setChecklistGroups(checklistRes.groups)
      setChecklistOpen(true)
    } catch (e) {
      console.error('packaging checklist:', e)
    }
  }

  const handleManualAccept = async () => {
    if (!order) return
    setDeciding(true)
    try {
      const id = Number(order.id)
      if (grabOrderId) setOptimisticGrabState('ACCEPTED')
      if (!Number.isNaN(id)) {
        const res = await updatePosOrderStatus({
          id,
          status: 'cooking',
          ...(grabOrderId ? { grabState: 'ACCEPTED' } : {}),
        })
        if (!res.success) {
          throw new Error(res.message || (t('processFail') || '처리 실패'))
        }
        await onAccepted?.({
          orderId: id,
          storeCode,
          memo: order.memo,
          deliveryAppCode: order.deliveryAppCode,
        })
      }
      onPackaged?.()
    } catch (e) {
      setOptimisticGrabState(null)
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setDeciding(false)
    }
  }

  const handleManualReject = async () => {
    if (!order || !await appConfirm(t('posCancelConfirm') || '이 주문을 거절하시겠습니까?')) return
    setDeciding(true)
    try {
      if (grabOrderId) setOptimisticGrabState('CANCELLED')
      const id = Number(order.id)
      if (!Number.isNaN(id)) {
        markPosSelfInitiatedGrabCancel(id)
        await updatePosOrderStatus({ id, status: 'cancelled', ...(grabOrderId ? { grabState: 'CANCELLED' } : {}) })
      }
      if (grabOrderId) {
        await grabCancelOrderByStoreApi({
          orderID: grabOrderId,
          storeCode: storeCode || undefined,
          cancelCode: 1002,
        })
      }
      if (!Number.isNaN(id) && order.items.length > 0) {
        const kitchenLines = order.items.map((it) => {
          const raw = resolvePosOrderItemMenuDisplayName(
            { id: it.id, name: it.name, menuId: it.menuId, promoId: it.promoId, promoCode: it.promoCode },
            menusFromProps,
            promosFromProps
          )
          return kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(raw, ti))
        })
        await onAfterFullOrderKitchenReprint?.(id, {
          removedKitchenLines: kitchenLines,
          orderNoForPrint: order.orderNo,
          tableName: order.tableName,
          memo: order.memo,
        })
      }
      onCancel?.()
      onClose?.()
    } catch (e) {
      setOptimisticGrabState(null)
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setDeciding(false)
    }
  }

  return (
    <>
      <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold truncate">
          {orderLabel} {t('posOrderTypeDelivery') || '배달'}
        </h3>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
          {t('posBack') || '뒤로가기'}
        </Button>
      </div>

      {!order ? (
        <div className="p-3 text-sm text-muted-foreground">{t('posNoOrder') || '주문이 없습니다.'}</div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="w-4 h-4 shrink-0" />
            <span>{t('posOrderTime') || '주문 시각'}: {formatPosOrderMonthDayTime(order.createdAt, lang)}</span>
          </div>

          {grabProgress && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-2 space-y-1.5">
              <p className="text-[11px] font-medium text-foreground/90">{ti('posGrabDeliveryProgressTitle')}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">{ti('posGrabDeliveryProgressHint')}</p>
              {grabProgress.cancelled ? (
                <p className="text-xs font-medium text-destructive">{ti('posGrabStageCancelled')}</p>
              ) : (
                <div className="grid grid-cols-6 gap-0.5 pt-1">
                  {grabStageKeys.map((key, i) => {
                    const done = i < grabProgress.current
                    const active = i === grabProgress.current
                    return (
                      <div key={key} className="flex min-w-0 flex-col items-center gap-1">
                        <div
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            done && 'bg-emerald-500',
                            active && !done && 'bg-emerald-400 ring-2 ring-emerald-500/40',
                            !done && !active && 'bg-muted-foreground/25'
                          )}
                        />
                        <span
                          className={cn(
                            'text-[8px] leading-tight text-center line-clamp-3',
                            active ? 'font-semibold text-emerald-800 dark:text-emerald-200' : 'text-muted-foreground'
                          )}
                        >
                          {ti(key)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {isCompleted ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('posPaymentComplete') || '결제 완료'}</span>
                <PosOrderTaxInvoiceStatusButton
                  hasTaxInvoice={hasTaxInvoice}
                  onOpen={onOpenTaxInvoice}
                  t={(key, fallback) => t(key) || fallback || key}
                  className="ml-auto"
                />
              </div>
              <Button className="h-11 text-base font-semibold w-full" onClick={() => onPay?.()}>
                {isPaid
                  ? (t('posPaymentComplete') || '결제 완료')
                  : (t('posTablePayInStore') || '매장 결제')}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  {t('posOrderCancelFull') || t('posOrderCancel') || '전체 취소'}
                </Button>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0 rounded-md border">
                <ul className="p-2 space-y-2">
                  {(displayItems.length ? displayItems : order.items).map((item, itemIndex) => {
                    const lineKey = lineKeys[itemIndex] ?? `line-${itemIndex}`
                    const displayNameRaw = resolvePosOrderItemMenuDisplayName(
                      {
                        id: item.id,
                        name: item.name,
                        menuId: item.menuId,
                        promoId: item.promoId,
                        promoCode: item.promoCode,
                      },
                      menusFromProps,
                      promosFromProps
                    )
                    const displayName = translatePosMenuLineForReceipt(displayNameRaw, ti)
                    const packaged = itemPackaged[lineKey]
                    const cancelled = itemCancelled[lineKey]
                    const optMatch = displayName.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : displayName
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const meta = parseItemMeta(item.note)
                    const hasSetChildren = Array.isArray(item.promoItems) && item.promoItems.length > 0
                    return (
                      <li
                        key={lineKey}
                        className={cn(
                          'grid cursor-default grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 py-2 px-2 rounded-lg border border-border/50 transition-shadow',
                          cancelled && 'bg-rose-50/80 border-rose-300/60 dark:bg-rose-950/20 dark:border-rose-700/40',
                          packaged && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
                          selectedLineItemId === lineKey &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => {
                          if (cancelled) return
                          setSelectedLineItemId(null)
                        }}
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="w-full min-w-0 rounded-sm px-0.5 text-left text-sm font-medium leading-snug break-words hover:underline -mx-0.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (cancelled) return
                              setSelectedLineItemId((prev) => (prev === lineKey ? null : lineKey))
                            }}
                            title={displayName}
                          >
                            {mainName}
                          </button>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {optionPart && <span className="mr-1">{optionPart}</span>}
                            x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                          </p>
                          {meta.optionSummary && (
                            <div className="mt-1">
                              <p className="mb-1 text-[11px] leading-none text-emerald-700 dark:text-emerald-300">
                                {t('posOptionSummaryLabel') || '옵션'}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {meta.optionChips.map((chip, chipIdx) => (
                                  <span
                                    key={`${lineKey}-opt-${chipIdx}`}
                                    className="rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[11px] leading-relaxed text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-900/30 dark:text-emerald-200"
                                  >
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {meta.requestSummary && (
                            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                              {(t('posMenuDescriptionLabel') || '요청사항') + ': ' + meta.requestSummary}
                            </p>
                          )}
                          {cancelled && (
                            <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                              {t('posLineCancelled') || '취소 처리됨'}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={packaged ? 'default' : 'outline'}
                          className="shrink-0 self-start mt-0.5 h-9 w-9 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleItemPackaged(lineKey)
                          }}
                          disabled={savingItemId === lineKey || removingItemId !== null || cancelled}
                          aria-label={
                            packaged
                              ? (t('cancel') || '취소')
                              : (t('posDeliveryPackagingComplete') || '포장 완료')
                          }
                        >
                          {packaged ? <Check className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </Button>
                        {hasSetChildren && (
                          <div className="col-span-2 w-full overflow-hidden space-y-1 rounded-md border border-border/50 bg-background/70 p-1.5">
                            {resolveSetChildRows(item).map(({ key: childKey, label: childLabel }, idx) => {
                              const mapKey = childStateMapKey(lineKey, childKey)
                              const childDone = Boolean(itemChildPackaged[mapKey])
                              return (
                                <button
                                  key={`${lineKey}-${childKey}-${idx}`}
                                  type="button"
                                  className={cn(
                                    'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded pl-2 pr-0.5 py-1.5 text-left text-sm font-medium transition-colors',
                                    childDone
                                      ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void toggleSetChildPackaged(lineKey, childKey)
                                  }}
                                  disabled={savingItemId === lineKey || removingItemId !== null || cancelled}
                                >
                                  <span className="truncate pr-1 leading-snug">
                                    {translatePosMenuLineForReceipt(childLabel, ti)}
                                  </span>
                                  {childDone ? <Check className="h-5 w-5 shrink-0" /> : <CheckCircle className="h-5 w-5 shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>

              <div className="flex justify-between text-sm font-medium">
                <span>{t('posInputTotal') || '합계'}</span>
                <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
              </div>

              <PosOrderTaxInvoiceEntryRow
                hasTaxInvoice={hasTaxInvoice}
                onOpen={onOpenTaxInvoice}
                t={(key, fallback) => t(key) || fallback || key}
              />

              <Button onClick={handlePackComplete} className="w-full h-11 text-base font-semibold" disabled={!allPackaged}>
                {allPackaged
                  ? (t('posDeliveryPackagingComplete') || '포장 완료')
                  : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${activeLineEntries.length || order.items.length})`}
              </Button>

              {isManualPending && (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className="h-10" onClick={handleManualAccept} disabled={deciding}>
                    {t('posDeliveryOrderAccept') || '주문 수락'}
                  </Button>
                  <Button type="button" variant="destructive" className="h-10" onClick={handleManualReject} disabled={deciding}>
                    {t('posDeliveryOrderReject') || '주문 거절'}
                  </Button>
                </div>
              )}

              <Button className="h-11 text-base font-semibold w-full" onClick={() => onPay?.()}>
                {isPaid
                  ? (t('posPaymentComplete') || '결제 완료')
                  : (t('posTablePayInStore') || '매장 결제')}
              </Button>
              {canCancel && (
                <div className="space-y-1.5">
                  {canStartPosLinePartialCancel(order) && !selectedLineItemId ? (
                    <p className="text-center text-xs text-muted-foreground px-1">
                      {t('posLineItemSelectFirst') || ti('posLineItemSelectFirst')}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                      disabled={
                        cancelling ||
                        removingItemId !== null ||
                        !canStartPosLinePartialCancel(order) ||
                        !selectedLineItemId
                      }
                      onClick={() => { void handlePartialCancel() }}
                    >
                      {t('posOrderCancelPartial') || ti('posOrderCancelPartial')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="disabled:opacity-50"
                      disabled={cancelling || removingItemId !== null}
                      onClick={handleCancelOrder}
                    >
                      {t('posOrderCancelFull') || ti('posOrderCancelFull')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      </div>
      <PackagingChecklistDialog
        open={checklistOpen}
        onOpenChange={setChecklistOpen}
        groups={checklistGroups}
        submitting={checklistSubmitting}
        t={t}
        onConfirm={async ({ checkedItemIds, uncheckedRequiredCount, totalRequiredCount }) => {
          if (!order) return
          const id = Number(order.id)
          if (Number.isNaN(id)) return
          setChecklistSubmitting(true)
          try {
            await updatePosOrderStatus({ id, status: 'ready' })
            console.info('[packaging-checklist] delivery confirmed', {
              orderId: id,
              checkedCount: checkedItemIds.length,
              uncheckedRequiredCount,
              totalRequiredCount,
            })
            setChecklistOpen(false)
            onPackaged?.()
          } finally {
            setChecklistSubmitting(false)
          }
        }}
      />

      <PosLineCancelQtyDialog
        open={cancelQtyDialogOpen}
        onOpenChange={setCancelQtyDialogOpen}
        item={cancelQtyTargetItem}
        displayName={cancelQtyTargetItem ? lineCancelDisplayLabel(cancelQtyTargetItem) : ''}
        allItems={order?.items ?? []}
        submitting={removingItemId !== null}
        onConfirm={(cq) => {
          if (!selectedLineItemId) return
          void applyLineCancel(selectedLineItemId, cq, false)
        }}
      />
    </>
  )
}

