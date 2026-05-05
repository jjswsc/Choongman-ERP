'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Order, Table } from '@/lib/pos-types'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import {
  markPosOrderItemServed,
  posDineInTableMerge,
  posDineInTableMove,
  updatePosOrder,
  type PosOrderStatusUpdateResult,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  ArrowRightLeft,
  Combine,
  LayoutGrid,
  ArrowLeft,
} from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { buildPosStatusFailureMessage } from '@/lib/pos-status-feedback'
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

export interface TableOrderPanelProps {
  tableName: string
  order: Order | null
  /** 테이블 이동·합석용 (매장 전체 테이블 목록) */
  allTables?: Table[]
  /** 합석 대상에 넣을 포장 주문(가상 테이블 행). absorb는 항상 “현재 테이블 청구서”로만 허용. */
  takeoutMergePeers?: Table[]
  onServed?: () => void
  onAddOrder?: () => void
  onPay?: () => void
  onOpenTaxInvoice?: () => void
  /** 선불 결제 후 손님 퇴장 시 (테이블 초기화) */
  onLeaveTable?: () => void | Promise<void>
  /** 주문 취소 시 */
  onCancel?: () => void
  /** 일부 취소(updatePosOrder) 직후 — 터미널에서 홀·주방 재인쇄 */
  onAfterPartialLineRemoved?: (orderId: number, detail?: PosKitchenReprintPayload) => void | Promise<void>
  /** 전체 취소 직후 — 터미널에서 주방 취소 전표(줄 앞 `-`) */
  onAfterFullOrderKitchenReprint?: (orderId: number, detail: PosKitchenReprintPayload) => void | Promise<void>
  onClose?: () => void
  t?: (key: string) => string
  /** 데모: 서빙 API 없이 부모 state만 갱신 */
  isDemo?: boolean
  onDemoOrderReplace?: (order: Order) => void
}

export function TableOrderPanel({
  tableName,
  order,
  allTables = [],
  onServed,
  onAddOrder,
  onPay,
  onOpenTaxInvoice,
  onLeaveTable,
  onCancel,
  onAfterPartialLineRemoved,
  onAfterFullOrderKitchenReprint,
  onClose,
  t: tProp,
  isDemo,
  onDemoOrderReplace,
  takeoutMergePeers = [],
}: TableOrderPanelProps) {
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const serveActionLabel = t('posServeAction') || '서빙'
  const isPaidPrepaid = order?.status === 'paid'
  const hasTaxInvoice = Boolean(parsePosOrderMemo(order?.memo).taxInvoice)
  const mergeDisabledByPayment = isPaidPrepaid
  const [itemServed, setItemServed] = useState<Record<string, boolean>>({})
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!order?.items?.length) {
      setItemServed({})
      setItemCancelled({})
      setExpandedItemId(null)
    }
    else {
      setItemServed((prev) => {
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

  const toggleItemServed = async (itemId: string) => {
    if (!order) return
    if (itemCancelled[itemId]) return
    if (isDemo && onDemoOrderReplace) {
      const nextServed = !itemServed[itemId]
      const nextItems = order.items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              servedAt: nextServed ? new Date().toISOString() : null,
              servedBy: nextServed ? 'demo' : null,
            }
          : it
      )
      onDemoOrderReplace({ ...order, items: nextItems })
      return
    }
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : tDefault('posServedNeedsOrderId'))
      return
    }
    const nextServed = !itemServed[itemId]
    setSavingItemId(itemId)
    try {
      const res = await markPosOrderItemServed({
        id,
        itemId,
        served: nextServed,
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setItemServed((prev) => ({ ...prev, [itemId]: nextServed }))
      onServed?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setSavingItemId(null)
    }
  }

  const activeItems = order?.items?.filter((it) => !itemCancelled[it.id]) ?? []
  const servedCount = activeItems.filter((it) => itemServed[it.id]).length
  const allServed = activeItems.length > 0 ? servedCount >= activeItems.length : false
  const isServedReadyForPayment = order?.status === 'ready' && allServed

  const [cancelling, setCancelling] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [moveTargetName, setMoveTargetName] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [mergeDirection, setMergeDirection] = useState<'into_selected' | 'into_current'>('into_selected')
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  /** 일부 취소: 먼저 품목 줄을 눌러 선택 */
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)

  const canCancel = order && !['completed', 'cancelled'].includes(order.status ?? '')
  const currentNameNorm = String(tableName ?? '').trim()
  const emptyTableOptions = useMemo(
    () =>
      allTables.filter((t) => {
        const n = String(t.name ?? '').trim()
        return n && n !== currentNameNorm && !t.isOccupied
      }),
    [allTables, currentNameNorm]
  )
  const dineInMergePeers = useMemo(
    () =>
      allTables.filter((t) => {
        const n = String(t.name ?? '').trim()
        if (!n || n === currentNameNorm) return false
        const o = t.order
        if (!t.isOccupied || !o || o.type !== 'dine-in') return false
        if (String(o.id) === String(order?.id ?? '')) return false
        if (o.status === 'paid') return false
        return true
      }),
    [allTables, currentNameNorm, order?.id]
  )

  const takeoutMergePeersResolved = useMemo(
    () =>
      takeoutMergePeers.filter((t) => {
        const o = t.order
        if (!o || o.type !== 'takeout') return false
        if (String(o.id) === String(order?.id ?? '')) return false
        if (o.status === 'paid') return false
        if (!o.items?.length) return false
        if (orderPaymentsSum(o) > 0.005) return false
        return true
      }),
    [takeoutMergePeers, order?.id]
  )

  const mergePeerOptions = useMemo(
    () => [...dineInMergePeers, ...takeoutMergePeersResolved],
    [dineInMergePeers, takeoutMergePeersResolved]
  )

  const mergeTargetPeer = useMemo(
    () => mergePeerOptions.find((p) => String(p.id) === String(mergeTargetId)),
    [mergePeerOptions, mergeTargetId]
  )
  const mergePeerIsTakeout = mergeTargetPeer?.order?.type === 'takeout'

  useEffect(() => {
    if (moveOpen) {
      const first = emptyTableOptions[0]?.name
      setMoveTargetName(first ? String(first) : '')
    }
  }, [moveOpen, emptyTableOptions])

  useEffect(() => {
    if (mergeOpen) {
      const first = mergePeerOptions[0]
      setMergeTargetId(first?.id ? String(first.id) : '')
      setMergeDirection(first?.order?.type === 'takeout' ? 'into_current' : 'into_selected')
    }
  }, [mergeOpen, mergePeerOptions])

  useEffect(() => {
    if (!mergeOpen || !mergeTargetId) return
    const peer = mergePeerOptions.find((p) => String(p.id) === String(mergeTargetId))
    if (peer?.order?.type === 'takeout' && mergeDirection === 'into_selected') {
      setMergeDirection('into_current')
    }
  }, [mergeOpen, mergeTargetId, mergePeerOptions, mergeDirection])

  useEffect(() => {
    if (!order?.items?.length) {
      setSelectedLineItemId(null)
      return
    }
    setSelectedLineItemId((prev) => (prev && order.items.some((i) => i.id === prev && !i.cancelledAt) ? prev : null))
  }, [order?.id, order?.items])

  const handleRemoveOrderLine = async (itemId: string) => {
    if (!order) return
    const target = order.items.find((it) => it.id === itemId)
    if (!target) return
    if (isDemo && onDemoOrderReplace) {
      const nextItems = order.items.filter((it) => it.id !== itemId)
      if (nextItems.length < 1) return
      const nextTotal = nextItems.reduce((s, it) => s + it.price * it.quantity, 0)
      onDemoOrderReplace({ ...order, items: nextItems, total: nextTotal })
      setSelectedLineItemId(null)
      return
    }
    if (!canRemovePosOrderLine(order)) {
      if (order.items.length <= 1) {
        await appAlert(t('posLineItemCancelLastHint') || tDefault('posLineItemCancelLastHint'))
      } else if (orderPaymentsSum(order) > 0.005) {
        await appAlert(t('posLineItemCancelPaidBlocked') || tDefault('posLineItemCancelPaidBlocked'))
      }
      return
    }
    const label = translatePosMenuLineForReceipt(target.name, t)
    const ask = i18nTr(tDefault, 'posLineItemCancelConfirm', { name: label })
    if (!await appConfirm(ask)) return
    const id = Number(order.id)
    if (Number.isNaN(id) || !posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : tDefault('posServedNeedsOrderId'))
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
      onServed?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setRemovingItemId(null)
    }
  }

  const handlePartialCancel = async () => {
    if (!order) return
    if (!selectedLineItemId) {
      await appAlert(t('posLineItemSelectFirst') || tDefault('posLineItemSelectFirst'))
      return
    }
    await handleRemoveOrderLine(selectedLineItemId)
  }

  const handleCancelOrder = async () => {
    if (!order || !await appConfirm(t('posCancelConfirm') || '이 주문을 취소하시겠습니까?')) return
    setCancelling(true)
    try {
      const first = await updatePosOrderStatus({ id: Number(order.id), status: 'cancelled' })
      const resolved = await (async () => {
        if (first.success) return first
        const canRetry = first.statusAlreadyApplied || first.retryAfterQueue
        const msg = buildPosStatusFailureMessage(first, t('processFail') || '처리 실패')
        if (!canRetry) {
          await appAlert(msg)
          return null
        }
        const retryAsk = `${msg}\n\n후속 처리를 다시 시도할까요?`
        if (!await appConfirm(retryAsk)) return null
        const retried = await updatePosOrderStatus({
          id: Number(order.id),
          status: 'cancelled',
          retrySideEffects: true,
        })
        if (!retried.success) {
          await appAlert(buildPosStatusFailureMessage(retried, t('processFail') || '처리 실패'))
          return null
        }
        return retried
      })()
      if (!resolved) return
      const oid = Number(order.id)
      if (order.items.length > 0) {
        const kitchenLines = order.items.map((it) =>
          kitchenRoutingItemFromOrderItem(it, translatePosMenuLineForReceipt(it.name, t))
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
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setCancelling(false)
    }
  }

  const handlePayClick = () => {
    onPay?.()
  }

  const handleServeComplete = async () => {
    if (!order || order.status === 'completed') return
    if (isDemo && onDemoOrderReplace) {
      onDemoOrderReplace({ ...order, status: 'ready' })
      onServed?.()
      return
    }
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    try {
      const first = await updatePosOrderStatus({ id, status: 'ready' })
      const resolved: PosOrderStatusUpdateResult | null = await (async () => {
        if (first.success) return first
        const canRetry = first.statusAlreadyApplied || first.retryAfterQueue
        const msg = buildPosStatusFailureMessage(first, t('processFail') || '처리 실패')
        if (!canRetry) {
          await appAlert(msg)
          return null
        }
        if (!await appConfirm(`${msg}\n\n후속 처리를 다시 시도할까요?`)) return null
        const retried = await updatePosOrderStatus({
          id,
          status: 'ready',
          retrySideEffects: true,
        })
        if (!retried.success) {
          await appAlert(buildPosStatusFailureMessage(retried, t('processFail') || '처리 실패'))
          return null
        }
        return retried
      })()
      if (!resolved) return
      onServed?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    }
  }

  const handleTableMove = async () => {
    if (!order || order.type !== 'dine-in' || !moveTargetName.trim()) return
    const msg = `${translateReceiptTableDisplayName(tableName, t)} → ${translateReceiptTableDisplayName(moveTargetName.trim(), t)}`
    if (!(await appConfirm(`${t('posTableMoveConfirm') || '이동'}? ${msg}`))) return
    setTransferSubmitting(true)
    try {
      const res = await posDineInTableMove({
        orderId: Number(order.id),
        targetTableName: moveTargetName.trim(),
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setMoveOpen(false)
      onServed?.()
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setTransferSubmitting(false)
    }
  }

  const handleTableMerge = async () => {
    if (!order || order.type !== 'dine-in' || !mergeTargetId.trim()) return
    const peer = mergePeerOptions.find((x) => String(x.id) === String(mergeTargetId.trim()))
    if (!peer?.order) return
    if (peer.order.type === 'takeout' && mergeDirection === 'into_selected') {
      await appAlert(t('posTableMergeTakeoutIntoCurrentOnly') || tDefault('posTableMergeTakeoutIntoCurrentOnly'))
      return
    }
    const peerLabel = translateReceiptTableDisplayName(peer.name, t)
    const hereLabel = translateReceiptTableDisplayName(tableName, t)
    const detail =
      mergeDirection === 'into_selected'
        ? `${hereLabel} → ${peerLabel} (${t('posTableMergeIntoSelected') || ''})`
        : `${peerLabel} → ${hereLabel} (${t('posTableMergeIntoCurrent') || ''})`
    if (
      !(await appConfirm(
        `${t('posTableMergeConfirm') || '합석'}?\n${detail}\n${t('posTableMergeHint') || ''}`
      ))
    )
      return
    setTransferSubmitting(true)
    try {
      const keepId =
        mergeDirection === 'into_selected' ? Number(peer.order.id) : Number(order.id)
      const absorbId =
        mergeDirection === 'into_selected' ? Number(order.id) : Number(peer.order.id)
      const res = await posDineInTableMerge({ keepOrderId: keepId, absorbOrderId: absorbId })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setMergeOpen(false)
      onServed?.()
      if (mergeDirection === 'into_selected') onClose?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setTransferSubmitting(false)
    }
  }

  const tableDisplayName = translateReceiptTableDisplayName(tableName, t)

  return (
    <div className="h-full flex flex-col border-l border-border bg-card" data-tour="pos-tour-serving-panel">
      <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center gap-1.5"
            title={t('posTableLabel') || ''}
          >
            <LayoutGrid
              className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
              strokeWidth={2.25}
              aria-hidden
            />
            <span
              className={cn(
                'inline-flex h-10 min-w-[2.5rem] max-w-[3.5rem] shrink-0 items-center justify-center rounded-full border px-1.5 shadow-sm',
                'border-emerald-600/45 bg-gradient-to-b from-emerald-50/95 to-emerald-100/90 text-emerald-950',
                'dark:border-emerald-500/40 dark:from-emerald-950/55 dark:to-emerald-900/70 dark:text-emerald-50',
                'ring-1 ring-emerald-700/15 dark:ring-emerald-400/20'
              )}
            >
              <span className="truncate text-center text-sm font-extrabold tabular-nums leading-none tracking-tight">
                {tableDisplayName}
              </span>
            </span>
          </span>
          {order && (
            <span
              className="min-w-0 truncate text-sm font-semibold tabular-nums text-muted-foreground"
              title={`${t('posOrderTime') || ''} ${formatPosOrderMonthDayTime(order.createdAt, lang)}`}
            >
              {formatPosOrderMonthDayTime(order.createdAt, lang)}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'h-10 w-10 shrink-0 border-2 border-border bg-muted/50 shadow-sm',
            'text-foreground hover:bg-muted hover:text-foreground',
            'dark:bg-muted/30 dark:hover:bg-muted/60'
          )}
          onClick={onClose}
          aria-label={t('posBack') || '뒤로'}
        >
          <ArrowLeft className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
        </Button>
      </div>

      {!order ? (
        <div className="p-3 text-base text-muted-foreground">{t('posNoOrder') || '주문이 없습니다.'}</div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
          {order.type === 'dine-in' &&
            ((order.guestCount ?? 0) > 0 || allTables.length > 0 || mergePeerOptions.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {(order.guestCount ?? 0) > 0 && (
                  <div
                    className="flex shrink-0 items-center gap-2 text-muted-foreground text-base"
                    title={t('posOrderGuestCount') || ''}
                  >
                    <Users className="w-5 h-5 shrink-0" aria-hidden />
                    <span className="font-semibold tabular-nums text-foreground">{order.guestCount}</span>
                  </div>
                )}
                {allTables.length > 0 && (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 min-w-0 flex-1 gap-1.5 px-2 text-xs font-semibold"
                      disabled={emptyTableOptions.length === 0 || transferSubmitting}
                      onClick={() => setMoveOpen(true)}
                    >
                      <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
                      {t('posTableMoveBtn')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 min-w-0 flex-1 gap-1.5 px-2 text-xs font-semibold"
                      title={mergeDisabledByPayment ? (t('posTableMergeHint') || '') : undefined}
                      disabled={
                        mergePeerOptions.length === 0 || mergeDisabledByPayment || transferSubmitting
                      }
                      onClick={() => setMergeOpen(true)}
                    >
                      <Combine className="h-4 w-4 shrink-0" aria-hidden />
                      {t('posTableMergeBtn')}
                    </Button>
                  </div>
                )}
              </div>
            )}

          {isPaidPrepaid ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-base rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>{t('posPrepaidPaid') || '선불 결제 완료'}</span>
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
              <Button
                className="w-full h-11 text-base font-semibold"
                onClick={async () => {
                  if (!order) return
                  try {
                    const id = Number(order.id)
                    const first = await updatePosOrderStatus({ id, status: 'completed' })
                    if (!first.success) {
                      const canRetry = first.statusAlreadyApplied || first.retryAfterQueue
                      const msg = buildPosStatusFailureMessage(first, t('processFail') || '처리 실패')
                      if (!canRetry) {
                        await appAlert(msg)
                        return
                      }
                      if (!await appConfirm(`${msg}\n\n후속 처리를 다시 시도할까요?`)) return
                      const retried = await updatePosOrderStatus({
                        id,
                        status: 'completed',
                        retrySideEffects: true,
                      })
                      if (!retried.success) {
                        await appAlert(buildPosStatusFailureMessage(retried, t('processFail') || '처리 실패'))
                        return
                      }
                    }
                    await onLeaveTable?.()
                  } catch (e) {
                    await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
                  }
                }}
              >
                {t('posTableLeave') || '퇴장 (테이블 비우기)'}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  {t('posOrderCancelFull') || t('posOrderCancel') || '전체 취소'}
                </Button>
              )}
            </>
          ) : isServedReadyForPayment ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-base rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>{t('posTableStatusServed') || '서빙 완료'}</span>
              </div>
              <ScrollArea className="flex-1 min-h-0 rounded-md border" data-tour="pos-tour-serving-items">
                <ul className="p-1.5 space-y-1">
                  {order.items.map((item) => {
                    const cancelled = itemCancelled[item.id]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const noteTrim = (item.note ?? '').trim()
                    const mainNameT = translatePosMenuLineForReceipt(mainName, t)
                    const optionPartT = optionPart ? translatePosMenuLineForReceipt(optionPart, t) : undefined
                    const fullNameT = translatePosMenuLineForReceipt(item.name, t)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'flex cursor-default items-start gap-1.5 py-1.5 px-2 rounded-md border border-border/50 transition-shadow',
                          cancelled
                            ? 'bg-rose-50/80 border-rose-300/60 dark:bg-rose-950/20 dark:border-rose-700/40'
                            : 'bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800',
                          selectedLineItemId === item.id &&
                            !cancelled &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => {
                          if (cancelled) return
                          setSelectedLineItemId(null)
                        }}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <button
                            type="button"
                            className="block w-full rounded-sm px-0.5 text-left text-base font-medium leading-snug break-words -mx-0.5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (cancelled) return
                              setSelectedLineItemId((prev) => (prev === item.id ? null : item.id))
                            }}
                            title={fullNameT}
                          >
                            {mainNameT}
                          </button>
                          {optionPart && (
                            <p className="text-sm text-muted-foreground line-clamp-2 break-words pl-0 leading-snug" title={optionPartT}>
                              {optionPartT}
                            </p>
                          )}
                          {noteTrim && (
                            <p className="text-sm text-blue-700 dark:text-blue-300/90 line-clamp-1 break-words leading-snug" title={noteTrim}>
                              {noteTrim}
                            </p>
                          )}
                          {cancelled && (
                            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                              {t('posLineCancelled') || '취소 처리됨'}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end justify-start gap-0.5 self-start pt-0.5 text-right">
                          <span className="text-base font-bold tabular-nums text-foreground leading-tight whitespace-nowrap">
                            ×{item.quantity}
                          </span>
                          <span className="text-sm text-muted-foreground tabular-nums leading-tight whitespace-nowrap">
                            {(item.price * item.quantity).toLocaleString()} ฿
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
              <div className="flex justify-between text-base font-medium">
                <span>{t('posInputTotal') || '합계'}</span>
                <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-11 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={onAddOrder}
                >
                  {t('posOrderButton') || '주문'}
                </Button>
                <Button className="h-11 text-base font-semibold" onClick={handlePayClick}>
                  {t('posPayButton') || '결제'}
                </Button>
              </div>
              {canCancel && (
                <div className="space-y-1.5">
                  {canRemovePosOrderLine(order) && !selectedLineItemId ? (
                    <p className="text-center text-xs text-muted-foreground px-1">
                      {t('posLineItemSelectFirst') || tDefault('posLineItemSelectFirst')}
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
                      onClick={() => {
                        void handlePartialCancel()
                      }}
                    >
                      {t('posOrderCancelPartial') || tDefault('posOrderCancelPartial')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="disabled:opacity-50"
                      disabled={cancelling || removingItemId !== null}
                      onClick={handleCancelOrder}
                    >
                      {t('posOrderCancelFull') || tDefault('posOrderCancelFull')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0 rounded-md border" data-tour="pos-tour-serving-items">
                <ul className="p-1.5 space-y-1">
                  {order.items.map((item) => {
                    const served = itemServed[item.id]
                    const cancelled = itemCancelled[item.id]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const noteTrim = (item.note ?? '').trim()
                    const expanded = expandedItemId === item.id
                    const mainNameT = translatePosMenuLineForReceipt(mainName, t)
                    const optionPartT = optionPart ? translatePosMenuLineForReceipt(optionPart, t) : undefined
                    const fullNameT = translatePosMenuLineForReceipt(item.name, t)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'flex cursor-default items-start gap-1.5 py-1.5 px-2 rounded-md border border-border/50 transition-shadow',
                          cancelled && 'bg-rose-50/80 border-rose-300/60 dark:bg-rose-950/20 dark:border-rose-700/40',
                          served && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
                          selectedLineItemId === item.id &&
                            'ring-2 ring-primary/45 border-primary/50 bg-primary/5 dark:bg-primary/10'
                        )}
                        onClick={() => {
                          if (cancelled) return
                          setSelectedLineItemId(null)
                        }}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex min-w-0 items-start gap-0.5">
                            <button
                              type="button"
                              className="min-w-0 flex-1 rounded-sm px-0.5 text-left hover:underline -mx-0.5"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (cancelled) return
                                setSelectedLineItemId((prev) => (prev === item.id ? null : item.id))
                              }}
                              title={fullNameT}
                            >
                              <span className="block text-base font-medium leading-snug break-words">
                                {mainNameT}
                              </span>
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground"
                              aria-label={t('posOrderLineExpandHint') || tDefault('posOrderLineExpandHint')}
                              title={t('posOrderLineExpandHint') || tDefault('posOrderLineExpandHint')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedItemId((prev) => (prev === item.id ? null : item.id))
                              }}
                            >
                              {expanded ? (
                                <ChevronUp className="h-4 w-4" aria-hidden />
                              ) : (
                                <ChevronDown className="h-4 w-4" aria-hidden />
                              )}
                            </Button>
                          </div>
                          {optionPart && (
                            <p
                              className="text-sm text-muted-foreground line-clamp-2 break-words pl-0 leading-snug"
                              title={optionPartT}
                            >
                              {optionPartT}
                            </p>
                          )}
                          {noteTrim && (
                            <p
                              className="text-sm text-blue-700 dark:text-blue-300/90 line-clamp-1 break-words leading-snug"
                              title={noteTrim}
                            >
                              {noteTrim}
                            </p>
                          )}
                          {expanded && (
                            <p className="text-sm text-muted-foreground pt-0.5 whitespace-normal break-words border-t border-border/40 mt-1">
                              {fullNameT}
                              {noteTrim ? ` · ${noteTrim}` : ''}
                            </p>
                          )}
                          {cancelled && (
                            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                              {t('posLineCancelled') || '취소 처리됨'}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end justify-start gap-0.5 self-start pt-0.5 text-right">
                          <span className="text-base font-bold tabular-nums text-foreground leading-tight whitespace-nowrap">
                            ×{item.quantity}
                          </span>
                          <span className="text-sm text-muted-foreground tabular-nums leading-tight whitespace-nowrap">
                            {(item.price * item.quantity).toLocaleString()} ฿
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant={served ? 'default' : 'outline'}
                          className="shrink-0 self-start mt-0.5 h-9 w-9 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleItemServed(item.id)
                          }}
                          disabled={savingItemId === item.id || removingItemId !== null || cancelled}
                          aria-label={
                            served
                              ? (t('cancel') || '취소')
                              : serveActionLabel
                          }
                        >
                          {served ? <Check className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>

              <div className="flex justify-between text-base font-medium">
                <span>{t('posInputTotal') || '합계'}</span>
                <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
              </div>

              <Button
                data-tour="pos-tour-serving-complete"
                onClick={handleServeComplete}
                className="w-full h-11 text-base font-semibold"
                disabled={!allServed}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {allServed
                  ? t('posTableStatusServed') || '서빙 완료'
                  : `${t('posTableStatusServed') || '서빙 완료'} (${servedCount}/${activeItems.length || order.items.length})`}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-11 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={onAddOrder}
                >
                  {t('posOrderButton') || '주문'}
                </Button>
                <Button className="h-11 text-base font-semibold" onClick={handlePayClick}>
                  {t('posPayButton') || '결제'}
                </Button>
              </div>
              {canCancel && (
                <div className="space-y-1.5">
                  {canRemovePosOrderLine(order) && !selectedLineItemId ? (
                    <p className="text-center text-xs text-muted-foreground px-1">
                      {t('posLineItemSelectFirst') || tDefault('posLineItemSelectFirst')}
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
                      {t('posOrderCancelPartial') || tDefault('posOrderCancelPartial')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="disabled:opacity-50"
                      disabled={cancelling || removingItemId !== null}
                      onClick={handleCancelOrder}
                    >
                      {t('posOrderCancelFull') || tDefault('posOrderCancelFull')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posTableMoveTitle') || '테이블 이동'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('posTableMoveHint') || ''}</p>
          {emptyTableOptions.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 py-2">{t('posTableMoveEmpty') || ''}</p>
          ) : (
            <div className="space-y-2 py-2">
              <Label className="text-xs font-semibold">{t('posTableMoveTarget') || '이동할 테이블'}</Label>
              <Select value={moveTargetName} onValueChange={setMoveTargetName}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {emptyTableOptions.map((tab) => (
                    <SelectItem key={tab.id} value={String(tab.name ?? '').trim()}>
                      {translateReceiptTableDisplayName(String(tab.name ?? ''), t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full"
                disabled={!moveTargetName || transferSubmitting}
                onClick={() => { void handleTableMove() }}
              >
                {transferSubmitting ? '…' : (t('posTableMoveConfirm') || '이동')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posTableMergeTitle') || '테이블 합석'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('posTableMergeHint') || ''}</p>
          <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
            {t('posTableMergeLineRuleHint') || ''}
          </p>
          {mergePeerOptions.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 py-2">{t('posTableMergeNoPeer') || ''}</p>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('posTableMergePickTable') || ''}</Label>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mergePeerOptions.map((tab) => (
                      <SelectItem key={tab.id} value={String(tab.id)}>
                        {translateReceiptTableDisplayName(String(tab.name ?? ''), t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mergePeerIsTakeout ? (
                <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                  {t('posTableMergeTakeoutIntoCurrentOnly') || tDefault('posTableMergeTakeoutIntoCurrentOnly')}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('posTableMergeDirection') || ''}</Label>
                <Select
                  value={mergeDirection}
                  onValueChange={(v) =>
                    setMergeDirection(v === 'into_current' ? 'into_current' : 'into_selected')
                  }
                >
                  <SelectTrigger className="h-auto min-h-10 py-2 whitespace-normal text-left">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!mergePeerIsTakeout ? (
                      <SelectItem value="into_selected">{t('posTableMergeIntoSelected') || ''}</SelectItem>
                    ) : null}
                    <SelectItem value="into_current">{t('posTableMergeIntoCurrent') || ''}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!mergeTargetId || transferSubmitting}
                onClick={() => { void handleTableMerge() }}
              >
                {transferSubmitting ? '…' : (t('posTableMergeConfirm') || '합석')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

