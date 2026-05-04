'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import {
  getPosPackagingChecklistByOrder,
  markPosOrderItemServed,
  updatePosOrder,
  type PosOrderPackagingChecklistGroup,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, ChevronDown, ChevronUp, Clock, FileText, XCircle } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
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

export interface TakeoutOrderPanelProps {
  orderLabel: string
  order: Order | null
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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistSubmitting, setChecklistSubmitting] = useState(false)
  const [checklistGroups, setChecklistGroups] = useState<PosOrderPackagingChecklistGroup[]>([])

  useEffect(() => {
    if (!order?.items?.length) {
      setItemPackaged({})
      setExpandedItemId(null)
    } else {
      setItemPackaged((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          next[it.id] = Boolean(it.servedAt)
        })
        return next
      })
    }
  }, [order?.id, order?.items])

  const toggleItemPackaged = async (itemId: string) => {
    if (!order) return
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

  const packagedCount = order?.items?.filter((it) => itemPackaged[it.id]).length ?? 0
  const allPackaged = order?.items?.length ? packagedCount >= order.items.length : false

  /** `paid`는 결제 완료·회계 반영 전 단계 — `completed`와 동일하게 취소 UI 비표시 */
  const canCancel =
    order &&
    !['completed', 'cancelled', 'paid', 'refunded'].includes(normalizedStatus)
  const [cancelling, setCancelling] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!order?.items?.length) {
      setSelectedLineItemId(null)
      return
    }
    setSelectedLineItemId((prev) => (prev && order.items.some((i) => i.id === prev) ? prev : null))
  }, [order?.id, order?.items])

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
    const label = translatePosMenuLineForReceipt(target.name, ti)
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
          {orderLabel} {t('posOrderTypeTakeout') || '포장'}
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
              <Button className="h-11 text-base font-semibold w-full" onClick={() => onPay?.()}>
                {isPaid
                  ? (t('posPaymentComplete') || '결제 완료')
                  : (t('posTablePayInStore') || '매장 결제')}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancelFull') || t('posOrderCancel') || '전체 취소'}
                </Button>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[320px] rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const packaged = itemPackaged[item.id]
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
                          packaged && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
                          selectedLineItemId === item.id &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => setSelectedLineItemId(null)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start gap-0.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 truncate rounded-sm px-0.5 text-left text-sm font-medium hover:underline -mx-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
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
                            <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words">
                              {fullDisp}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={packaged ? 'default' : 'outline'}
                          className="shrink-0 h-9 w-9 p-0 self-start mt-0.5"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleItemPackaged(item.id)
                          }}
                          disabled={savingItemId === item.id || removingItemId !== null}
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
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {allPackaged
                    ? (t('posDeliveryPackagingComplete') || '포장 완료')
                    : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${order.items.length})`}
                </Button>
                <Button className="h-11 text-base font-semibold" onClick={() => onPay?.()}>
                  {isPaid
                    ? (t('posPaymentComplete') || '결제 완료')
                    : (t('posTablePayInStore') || '매장 결제')}
                </Button>
              </div>
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
                      <XCircle className="w-4 h-4 mr-1 inline" aria-hidden />
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
    </>
  )
}

