'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import type { PosDeliveryApp, PosMenu, PosOrderPackagingChecklistGroup } from '@/lib/api-client'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import {
  getPosPackagingChecklistByOrder,
  grabCancelOrderByStoreApi,
  grabMarkOrderReadyApi,
  markPosOrderItemServed,
  updatePosOrder,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, ChevronDown, ChevronUp, Clock, FileText } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { extractGrabOrderIdFromMemo, extractGrabStateFromMemo } from '@/lib/grab-order-memo'
import {
  grabStateToStageIndex,
  GRAB_DELIVERY_PROGRESS_STAGE_COUNT,
} from '@/lib/grab-delivery-progress'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
import { normalizePosLineNote } from '@/lib/pos-line-note'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import {
  buildUpdatePosOrderParamsFromOrder,
  canRemovePosOrderLine,
  orderItemsToPosOrderItems,
  orderPaymentsSum,
} from '@/lib/pos-order-line-update'
import {
  kitchenRoutingItemFromOrderItem,
  type PosKitchenReprintPayload,
} from '@/lib/pos-kitchen-slip-routing'

export interface DeliveryOrderPanelProps {
  orderLabel: string
  order: Order | null
  /** 품목 `name`이 코드로만 온 경우(Grab 등) POS 메뉴명으로 복원 */
  menus?: PosMenu[]
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
  deliveryApps: _deliveryApps = [],
  onPackaged,
  onAccepted,
  onPay,
  onOpenTaxInvoice,
  onCancel,
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
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [optimisticGrabState, setOptimisticGrabState] = useState<string | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistSubmitting, setChecklistSubmitting] = useState(false)
  const [checklistGroups, setChecklistGroups] = useState<PosOrderPackagingChecklistGroup[]>([])

  const parseItemMeta = (rawNote?: string) => {
    const note = normalizePosLineNote(String(rawNote || ''), { keepOptionSummary: true })
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
  }

  useEffect(() => {
    if (!order?.items?.length) {
      setItemPackaged({})
      setItemCancelled({})
      setExpandedItemId(null)
    } else {
      setItemPackaged((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          next[it.id] = Boolean(it.servedAt)
        })
        return next
      })
      setItemCancelled((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          next[it.id] = Boolean(it.cancelledAt)
        })
        return next
      })
    }
  }, [order?.id, order?.items])

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

  const activeItems = order?.items?.filter((it) => !itemCancelled[it.id]) ?? []
  const packagedCount = activeItems.filter((it) => itemPackaged[it.id]).length
  const allPackaged = activeItems.length > 0 ? packagedCount >= activeItems.length : false

  /** `paid`는 결제 완료·회계 반영 전 단계 — `completed`와 동일하게 취소 UI 비표시 */
  const canCancel =
    order &&
    !['completed', 'cancelled', 'paid', 'refunded'].includes(normalizedStatus)
  const [cancelling, setCancelling] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!order?.items?.length) {
      setSelectedLineItemId(null)
      return
    }
    setSelectedLineItemId((prev) => (prev && order.items.some((i) => i.id === prev && !i.cancelledAt) ? prev : null))
  }, [order?.id, order?.items])

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
      const oid = Number(order.id)
      await updatePosOrderStatus({ id: oid, status: 'cancelled' })
      if (order.items.length > 0) {
        const kitchenLines = order.items.map((it) => {
          const raw = resolvePosOrderItemMenuDisplayName({ id: it.id, name: it.name, menuId: it.menuId }, menusFromProps)
          return kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(raw, ti))
        })
        await onAfterFullOrderKitchenReprint?.(oid, {
          removedKitchenLines: kitchenLines,
          orderNoForPrint: order.orderNo,
          tableName: order.tableName,
          memo: order.memo,
        })
      }
      onCancel?.()
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setCancelling(false)
    }
  }

  const handleRemoveOrderLine = async (itemId: string) => {
    if (!order) return
    const target = order.items.find((it) => it.id === itemId)
    if (!target) return
    if (!canRemovePosOrderLine(order)) {
      if (order.items.length <= 1) {
        await appAlert(t('posLineItemCancelLastHint') || ti('posLineItemCancelLastHint'))
      } else if (orderPaymentsSum(order) > 0.005) {
        await appAlert(t('posLineItemCancelPaidBlocked') || ti('posLineItemCancelPaidBlocked'))
      }
      return
    }
    const labelRaw = resolvePosOrderItemMenuDisplayName(
      { id: target.id, name: target.name, menuId: target.menuId },
      menusFromProps
    )
    const label = translatePosMenuLineForReceipt(labelRaw, ti)
    const ask = i18nTr(ti, 'posLineItemCancelConfirm', { name: label })
    if (!await appConfirm(ask)) return
    const id = Number(order.id)
    if (Number.isNaN(id) || !posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : ti('posServedNeedsOrderId'))
      return
    }
    const nextOrderItems = order.items.filter((it) => it.id !== itemId)
    const nextPosItems = orderItemsToPosOrderItems(nextOrderItems)
    setRemovingItemId(itemId)
    try {
      const res = await updatePosOrder(buildUpdatePosOrderParamsFromOrder(order, nextPosItems))
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setSelectedLineItemId(null)
      const removedLine = kitchenRoutingItemFromOrderItem(target, label)
      await onAfterPartialLineRemoved?.(id, { removedKitchenLines: [removedLine] })
      onPackaged?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setRemovingItemId(null)
    }
  }

  const handlePartialCancel = async () => {
    if (!order) return
    if (!selectedLineItemId) {
      await appAlert(t('posLineItemSelectFirst') || ti('posLineItemSelectFirst'))
      return
    }
    await handleRemoveOrderLine(selectedLineItemId)
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
          const raw = resolvePosOrderItemMenuDisplayName({ id: it.id, name: it.name, menuId: it.menuId }, menusFromProps)
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
                <button
                  type="button"
                  onClick={() => onOpenTaxInvoice?.()}
                  disabled={!onOpenTaxInvoice}
                  className={cn(
                    'ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px]',
                    hasTaxInvoice
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200',
                    onOpenTaxInvoice ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                  )}
                >
                  {hasTaxInvoice ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  {hasTaxInvoice
                    ? (t('posReceiptTaxInvoiceIssued') || '세금계산서 발행')
                    : (t('posReceiptTaxInvoiceNotIssued') || '세금계산서 미발행')}
                </button>
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
              <ScrollArea className="flex-1 max-h-[320px] rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const displayNameRaw = resolvePosOrderItemMenuDisplayName(
                      { id: item.id, name: item.name, menuId: item.menuId },
                      menusFromProps
                    )
                    const displayName = translatePosMenuLineForReceipt(displayNameRaw, ti)
                    const packaged = itemPackaged[item.id]
                    const cancelled = itemCancelled[item.id]
                    const optMatch = displayName.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : displayName
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const meta = parseItemMeta(item.note)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'grid cursor-default grid-cols-[1fr_auto] items-start gap-2 py-2 px-2 rounded-lg border border-border/50 transition-shadow',
                          cancelled && 'bg-rose-50/80 border-rose-300/60 dark:bg-rose-950/20 dark:border-rose-700/40',
                          packaged && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
                          selectedLineItemId === item.id &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => {
                          if (cancelled) return
                          setSelectedLineItemId(null)
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-0.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate rounded-sm px-0.5 text-left text-sm font-medium hover:underline -mx-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (cancelled) return
                                setSelectedLineItemId((prev) => (prev === item.id ? null : item.id))
                              }}
                              title={displayName}
                            >
                              {mainName}
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              aria-label={t('posOrderLineExpandHint') || ti('posOrderLineExpandHint')}
                              title={t('posOrderLineExpandHint') || ti('posOrderLineExpandHint')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedItemId((prev) => (prev === item.id ? null : item.id))
                              }}
                            >
                              {expandedItemId === item.id ? (
                                <ChevronUp className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              )}
                            </Button>
                          </div>
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
                                    key={`${item.id}-opt-${chipIdx}`}
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
                          {expandedItemId === item.id && (
                            <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words">
                              {displayName}
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
                            void toggleItemPackaged(item.id)
                          }}
                          disabled={savingItemId === item.id || removingItemId !== null || cancelled}
                          aria-label={
                            packaged
                              ? (t('cancel') || '취소')
                              : (t('posDeliveryPackagingComplete') || '포장 완료')
                          }
                        >
                          {packaged ? <Check className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>

              <div className="flex justify-between text-sm font-medium">
                <span>{t('posInputTotal') || '합계'}</span>
                <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
              </div>

              <Button onClick={handlePackComplete} className="w-full h-11 text-base font-semibold" disabled={!allPackaged}>
                {allPackaged
                  ? (t('posDeliveryPackagingComplete') || '포장 완료')
                  : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${activeItems.length || order.items.length})`}
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
                  {canRemovePosOrderLine(order) && !selectedLineItemId ? (
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
                        !canRemovePosOrderLine(order) ||
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
    </>
  )
}

