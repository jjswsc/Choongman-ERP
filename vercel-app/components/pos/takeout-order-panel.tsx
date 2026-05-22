'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import {
  getPosPackagingChecklistByOrder,
  markPosOrderItemServed,
  type PosMenu,
  type PosOrderPackagingChecklistGroup,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, ChevronDown, ChevronUp, Clock, FileText } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import {
  translatePosMenuLineForReceipt,
  translateTakeoutOrderDisplayLabel,
} from '@/lib/pos-print-translate'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { buildPosSetChildKey, listPosSetChildKeys, readPosSetChildrenState } from '@/lib/pos-set-children-state'
import { canStartPosLinePartialCancel } from '@/lib/pos-order-line-update'
import { orderItemLineQty } from '@/lib/pos-order-line-cancel'
import {
  alertPosLineCancelBlocked,
  executePosOrderLineCancel,
} from '@/lib/pos-order-line-cancel-execute'
import { kitchenRoutingItemFromOrderItem, type PosKitchenReprintPayload } from '@/lib/pos-kitchen-slip-routing'
import { PosLineCancelQtyDialog } from '@/components/pos/pos-line-cancel-qty-dialog'

export interface TakeoutOrderPanelProps {
  orderLabel: string
  order: Order | null
  menus?: PosMenu[]
  onPackaged?: () => void
  onPay?: () => void
  onOpenTaxInvoice?: () => void
  /** 주문 취소 시 */
  onCancel?: () => void
  /** 일부 취소 직후 홀·주방 재인쇄(터미널) */
  onAfterPartialLineRemoved?: (orderId: number, detail?: PosKitchenReprintPayload) => void | Promise<void>
  /** 전체 취소 직후 주방 취소 전표 */
  onAfterFullOrderKitchenReprint?: (orderId: number, detail: PosKitchenReprintPayload) => void | Promise<void>
  onClose?: () => void
  t?: (key: string) => string
}

export function TakeoutOrderPanel({
  orderLabel,
  order,
  menus: menusFromProps = [],
  onPackaged,
  onPay,
  onOpenTaxInvoice,
  onCancel,
  onAfterPartialLineRemoved,
  onAfterFullOrderKitchenReprint,
  onClose,
  t = (k) => k,
}: TakeoutOrderPanelProps) {
  const { lang } = useLang()
  const ti = useT(lang)
  const normalizedStatus = String(order?.status ?? '').trim().toLowerCase()
  const isCompleted = normalizedStatus === 'completed'
  const isPaid = normalizedStatus === 'paid' || normalizedStatus === 'completed'
  const hasTaxInvoice = Boolean(parsePosOrderMemo(order?.memo).taxInvoice)
  const [itemPackaged, setItemPackaged] = useState<Record<string, boolean>>({})
  const [itemChildPackaged, setItemChildPackaged] = useState<Record<string, boolean>>({})
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistSubmitting, setChecklistSubmitting] = useState(false)
  const [checklistGroups, setChecklistGroups] = useState<PosOrderPackagingChecklistGroup[]>([])

  useEffect(() => {
    if (!order?.items?.length) {
      setItemPackaged({})
      setItemChildPackaged({})
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
      setItemChildPackaged((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          const childKeys = listPosSetChildKeys(Array.isArray(it.promoItems) ? it.promoItems : [])
          if (!childKeys.length) return
          const childState = readPosSetChildrenState(it.setChildrenState)
          childKeys.forEach((key) => {
            const raw = childState[key]
            const done = Boolean(String(raw?.packedAt ?? raw?.servedAt ?? (it.servedAt ? '1' : '')).trim())
            next[`${it.id}::${key}`] = done
          })
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
    const mapKey = `${itemId}::${childKey}`
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

  const activeItems = order?.items?.filter((it) => !itemCancelled[it.id]) ?? []
  const packagedCount = activeItems.filter((it) => itemPackaged[it.id]).length
  const allPackaged = activeItems.length > 0 ? packagedCount >= activeItems.length : false

  /** `paid`는 결제 완료·회계 반영 전 단계 — `completed`와 동일하게 취소 UI 비표시 */
  const canCancel =
    order &&
    !['completed', 'cancelled', 'paid', 'refunded'].includes(normalizedStatus)
  const [cancelling, setCancelling] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)
  const [cancelQtyDialogOpen, setCancelQtyDialogOpen] = useState(false)

  useEffect(() => {
    if (!order?.items?.length) {
      setSelectedLineItemId(null)
      return
    }
    setSelectedLineItemId((prev) => (prev && order.items.some((i) => i.id === prev && !i.cancelledAt) ? prev : null))
  }, [order?.id, order?.items])

  const cancelQtyTargetItem = useMemo(
    () => (selectedLineItemId && order ? order.items.find((it) => it.id === selectedLineItemId) ?? null : null),
    [order, selectedLineItemId]
  )

  const applyLineCancel = async (itemId: string, cancelQty: number, confirmBeforeApply: boolean) => {
    if (!order) return
    const target = order.items.find((it) => it.id === itemId)
    if (!target) return
    const label = translatePosMenuLineForReceipt(target.name, ti)
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

  const handleCancelOrder = async () => {
    if (!order || !await appConfirm(t('posCancelConfirm') || '이 주문을 취소하시겠습니까?')) return
    setCancelling(true)
    try {
      const oid = Number(order.id)
      await updatePosOrderStatus({ id: oid, status: 'cancelled' })
      if (order.items.length > 0) {
        const kitchenLines = order.items.map((it) =>
          kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(it.name, ti))
        )
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

  const handlePackComplete = async () => {
    if (!order || order.status === 'completed' || order.status === 'ready') return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    const completeReady = async () => {
      try {
        await updatePosOrderStatus({ id, status: 'ready' })
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

  return (
    <>
      <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold truncate">
          {translateTakeoutOrderDisplayLabel(orderLabel, t)}
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
            </>
          ) : order.status === 'ready' ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('posDeliveryPackagingComplete') || '포장 완료'}</span>
              </div>
              <ScrollArea className="flex-1 min-h-0 rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const cancelled = itemCancelled[item.id]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const mainDisp = translatePosMenuLineForReceipt(mainName, ti)
                    const optionDisp = optionPart ? translatePosMenuLineForReceipt(optionPart, ti) : null
                    const fullDisp = translatePosMenuLineForReceipt(item.name, ti)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'cursor-default py-2 px-2 rounded-lg border border-border/50 transition-shadow',
                          cancelled && 'bg-rose-50/80 border-rose-300/60 dark:bg-rose-950/20 dark:border-rose-700/40',
                          !cancelled && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
                          selectedLineItemId === item.id &&
                            !cancelled &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => {
                          if (cancelled) return
                          setSelectedLineItemId(null)
                        }}
                      >
                        <button
                          type="button"
                          className="w-full truncate rounded-sm px-0.5 text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 -mx-0.5"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (cancelled) return
                            setSelectedLineItemId((prev) => (prev === item.id ? null : item.id))
                          }}
                          title={fullDisp}
                        >
                          {mainDisp}
                        </button>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {optionDisp && <span className="mr-1">{optionDisp}</span>}
                          x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                        </p>
                        {cancelled && (
                          <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                            {t('posLineCancelled') || '취소 처리됨'}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
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
                      onClick={() => {
                        void handlePartialCancel()
                      }}
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
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0 rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const packaged = itemPackaged[item.id]
                    const cancelled = itemCancelled[item.id]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const mainDisp = translatePosMenuLineForReceipt(mainName, ti)
                    const optionDisp = optionPart ? translatePosMenuLineForReceipt(optionPart, ti) : null
                    const fullDisp = translatePosMenuLineForReceipt(item.name, ti)
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
                              title={fullDisp}
                            >
                              {mainDisp}
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
                            {optionDisp && <span className="mr-1">{optionDisp}</span>}
                            x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                          </p>
                          {expandedItemId === item.id && (
                            <div className="mt-1 space-y-1.5">
                              <p className="text-xs text-muted-foreground whitespace-normal break-words">
                                {fullDisp}
                              </p>
                              {Array.isArray(item.promoItems) && item.promoItems.length > 0 && (
                                <div className="w-full max-w-full overflow-hidden space-y-1 rounded-md border border-border/50 bg-background/70 p-1.5">
                                  {item.promoItems.flatMap((line, idx) => {
                                    const qty = Math.max(1, Math.trunc(Number(line.quantity ?? 1) || 1))
                                    const menuId = String(line.menuId ?? '').trim()
                                    const rawMenu = menuId
                                      ? resolvePosOrderItemMenuDisplayName({ id: menuId, name: menuId, menuId }, menusFromProps)
                                      : `Set ${idx + 1}`
                                    const rawOpt = String(line.optionId ?? '').trim()
                                    const childLabel = rawOpt ? `${rawMenu} (${rawOpt})` : rawMenu
                                    return Array.from({ length: qty }).map((_, n) => {
                                      const childKey = buildPosSetChildKey(line, idx, n)
                                      const mapKey = `${item.id}::${childKey}`
                                      const childDone = Boolean(itemChildPackaged[mapKey])
                                      return (
                                        <button
                                          key={`${item.id}-${childKey}`}
                                          type="button"
                                          className={cn(
                                            'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded pl-2 pr-0.5 py-1.5 text-left text-base font-medium transition-colors',
                                            childDone
                                              ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void toggleSetChildPackaged(item.id, childKey)
                                          }}
                                          disabled={savingItemId === item.id || removingItemId !== null || cancelled}
                                        >
                                          <span className="truncate pr-1">{translatePosMenuLineForReceipt(childLabel, ti)}</span>
                                          {childDone ? <Check className="h-5 w-5 shrink-0" /> : <CheckCircle className="h-5 w-5 shrink-0" />}
                                        </button>
                                      )
                                    })
                                  })}
                                </div>
                              )}
                            </div>
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

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={handlePackComplete} className="h-11 text-base font-semibold" disabled={!allPackaged}>
                  {allPackaged
                    ? (t('posDeliveryPackagingComplete') || '포장 완료')
                    : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${activeItems.length || order.items.length})`}
                </Button>
                <Button className="h-11 text-base font-semibold" onClick={() => onPay?.()}>
                  {isPaid
                    ? (t('posPaymentComplete') || '결제 완료')
                    : (t('posTablePayInStore') || '매장 결제')}
                </Button>
              </div>
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
            console.info('[packaging-checklist] takeout confirmed', {
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
        displayName={
          cancelQtyTargetItem ? translatePosMenuLineForReceipt(cancelQtyTargetItem.name, ti) : ''
        }
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

