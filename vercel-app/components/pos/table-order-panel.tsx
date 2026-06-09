'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { Order, Table } from '@/lib/pos-types'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import {
  markPosOrderItemServed,
  posDineInTableMerge,
  posDineInTableMove,
  updatePosOrder,
  type PosMenu,
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
import { executePosFullOrderCancel } from '@/lib/pos-order-full-cancel-execute'
import { buildPosStatusFailureMessage } from '@/lib/pos-status-feedback'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import { buildPosSetChildKey, listPosSetChildKeys, readPosSetChildrenState } from '@/lib/pos-set-children-state'
import {
  buildUpdatePosOrderParamsFromOrder,
  canStartPosLinePartialCancel,
  orderItemsToPosOrderItems,
  orderPaymentsSum,
} from '@/lib/pos-order-line-update'
import { kitchenRoutingItemFromOrderItem } from '@/lib/pos-kitchen-slip-routing'
import { orderItemLineQty } from '@/lib/pos-order-line-cancel'
import {
  alertPosLineCancelBlocked,
  executePosOrderLineCancel,
} from '@/lib/pos-order-line-cancel-execute'
import type { PosKitchenReprintPayload } from '@/lib/pos-kitchen-slip-routing'
import { PosLineCancelQtyDialog } from '@/components/pos/pos-line-cancel-qty-dialog'

export interface TableOrderPanelProps {
  tableName: string
  order: Order | null
  menus?: PosMenu[]
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
  /** 전체 취소 성공 직후 — 터미널 목록·sessionStorage에서 즉시 제거 */
  onOrderDismissed?: (order: Order) => void
  /** 일부 취소(updatePosOrder) 직후 — 터미널에서 홀·주방 재인쇄 */
  onAfterPartialLineRemoved?: (orderId: number, detail?: PosKitchenReprintPayload) => void | Promise<void>
  /** 전체 취소 직후 — 터미널에서 주방 취소 전표(줄 앞 `-`) */
  onAfterFullOrderKitchenReprint?: (orderId: number, detail: PosKitchenReprintPayload) => void | Promise<void>
  /** 테이블 이동·합석 직후 — 터미널에서 갱신된 테이블 번호로 홀 주문서 재인쇄 */
  onAfterTableTransfer?: (keepOrderId: number) => void | Promise<void>
  /** 합석 API 호출 직전 — Realtime 추가주문 인쇄와 중복 방지 */
  onBeforeTableMerge?: (keepOrderId: number) => void
  /** 테이블 이동 API 호출 직전 — Realtime 추가주문 인쇄와 중복 방지 */
  onBeforeTableMove?: (orderId: number) => void
  /** 테이블 이동 성공 직후 — 구 테이블 점유 UI 즉시 해제 */
  onTableMovedFrom?: (sourceTableName: string) => void
  onClose?: () => void
  t?: (key: string) => string
  storeCode?: string
  /** 데모: 서빙 API 없이 부모 state만 갱신 */
  isDemo?: boolean
  onDemoOrderReplace?: (order: Order) => void
}

export function TableOrderPanel({
  tableName,
  order,
  menus: menusFromProps = [],
  allTables = [],
  onServed,
  onAddOrder,
  onPay,
  onOpenTaxInvoice,
  onLeaveTable,
  onCancel,
  onOrderDismissed,
  onAfterPartialLineRemoved,
  onAfterFullOrderKitchenReprint,
  onAfterTableTransfer,
  onBeforeTableMerge,
  onBeforeTableMove,
  onTableMovedFrom,
  onClose,
  t: tProp,
  storeCode = '',
  isDemo,
  onDemoOrderReplace,
  takeoutMergePeers = [],
}: TableOrderPanelProps) {
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const serveActionLabel = t('posServeAction') || '서빙'
  const isPaidPrepaid = order?.status === 'paid'
  const hasTaxInvoice = Boolean(parsePosOrderMemo(order?.memo).taxInvoice)
  const mergeDisabledByPayment = isPaidPrepaid
  const [itemServed, setItemServed] = useState<Record<string, boolean>>({})
  const [itemChildServed, setItemChildServed] = useState<Record<string, boolean>>({})
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [guestEditOpen, setGuestEditOpen] = useState(false)
  const [guestDirectOpen, setGuestDirectOpen] = useState(false)
  const [guestDirectValue, setGuestDirectValue] = useState('10')
  const [guestSaving, setGuestSaving] = useState(false)

  useEffect(() => {
    if (!order?.items?.length) {
      setItemServed({})
      setItemChildServed({})
      setItemCancelled({})
    }
    else {
      setItemServed((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          next[it.id] = Boolean(it.servedAt)
        })
        return next
      })
      setItemChildServed((prev) => {
        const next = { ...prev }
        order.items.forEach((it) => {
          const childKeys = listPosSetChildKeys(Array.isArray(it.promoItems) ? it.promoItems : [])
          if (!childKeys.length) return
          const childState = readPosSetChildrenState(it.setChildrenState)
          childKeys.forEach((key) => {
            const raw = childState[key]
            const done = Boolean(String(raw?.servedAt ?? (it.servedAt ? '1' : '')).trim())
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

  const toggleSetChildServed = async (itemId: string, childKey: string) => {
    if (!order) return
    if (itemCancelled[itemId]) return
    if (isDemo && onDemoOrderReplace) {
      const mapKey = `${itemId}::${childKey}`
      setItemChildServed((prev) => ({ ...prev, [mapKey]: !prev[mapKey] }))
      return
    }
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : tDefault('posServedNeedsOrderId'))
      return
    }
    const mapKey = `${itemId}::${childKey}`
    const nextServed = !itemChildServed[mapKey]
    setSavingItemId(itemId)
    try {
      const res = await markPosOrderItemServed({
        id,
        itemId,
        childKey,
        mode: 'served',
        served: nextServed,
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setItemChildServed((prev) => ({ ...prev, [mapKey]: nextServed }))
      const childServedCount = Number(res.childServedCount ?? -1)
      const childTotalCount = Number(res.childTotalCount ?? -1)
      if (childServedCount >= 0 && childTotalCount >= 0) {
        setItemServed((prev) => ({ ...prev, [itemId]: childServedCount >= childTotalCount }))
      }
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
  const [cancelQtyDialogOpen, setCancelQtyDialogOpen] = useState(false)

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

  const cancelQtyTargetItem = useMemo(
    () => (selectedLineItemId && order ? order.items.find((it) => it.id === selectedLineItemId) ?? null : null),
    [order, selectedLineItemId]
  )

  const applyLineCancel = async (itemId: string, cancelQty: number, confirmBeforeApply: boolean) => {
    if (!order) return
    const target = order.items.find((it) => it.id === itemId)
    if (!target) return
    const label = translatePosMenuLineForReceipt(target.name, t)
    setRemovingItemId(itemId)
    try {
      const result = await executePosOrderLineCancel({
        order,
        itemId,
        cancelQty,
        displayLabel: label,
        t,
        tDefault,
        lang,
        isDemo,
        onDemoOrderReplace,
        confirmBeforeApply,
        onAfterPartialLineRemoved,
        storeCode,
        onRefresh: () => {
          setSelectedLineItemId(null)
          onServed?.()
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
      await appAlert(t('posLineItemSelectFirst') || tDefault('posLineItemSelectFirst'))
      return
    }
    if (!canStartPosLinePartialCancel(order)) {
      await alertPosLineCancelBlocked(order, t, tDefault)
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
      const outcome = await executePosFullOrderCancel({
        order,
        storeCode,
        onAlert: appAlert,
        onConfirm: appConfirm,
        failMessageFallback: t('processFail') || '처리 실패',
      })
      if (!outcome.ok) {
        if (outcome.message) {
          await appAlert(
            localizeApiMessage(outcome.message, t, t('processFail') || '처리 실패', lang)
          )
        }
        return
      }
      const oid = outcome.serverId ?? (posOrderHasServerId(order.id) ? Number(order.id) : 0)
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
      onOrderDismissed?.(order)
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
      onBeforeTableMove?.(Number(order.id))
      const res = await posDineInTableMove({
        orderId: Number(order.id),
        targetTableName: moveTargetName.trim(),
      })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setMoveOpen(false)
      onTableMovedFrom?.(tableName)
      await onAfterTableTransfer?.(Number(order.id))
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
      onBeforeTableMerge?.(keepId)
      const res = await posDineInTableMerge({ keepOrderId: keepId, absorbOrderId: absorbId })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setMergeOpen(false)
      await onAfterTableTransfer?.(keepId)
      onServed?.()
      if (mergeDirection === 'into_selected') onClose?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setTransferSubmitting(false)
    }
  }

  const tableDisplayName = translateReceiptTableDisplayName(tableName, t)

  const openGuestCountEditor = () => {
    if (!order || order.type !== 'dine-in') return
    if (String(order.status ?? '').toLowerCase() === 'cancelled') return
    const raw = Math.max(0, Math.min(99, Math.trunc(Number(order.guestCount ?? 0) || 0)))
    setGuestDirectValue(String(raw > 9 ? raw : 10))
    setGuestEditOpen(true)
  }

  const persistGuestCount = async (nextGuest: number) => {
    if (!order || order.type !== 'dine-in') return
    const g = Math.max(0, Math.min(99, Math.trunc(nextGuest)))
    const st = String(order.status ?? '').toLowerCase()
    if (st === 'cancelled') {
      await appAlert(tr('posGuestEditCancelledOrder', '취소된 주문은 인원을 바꿀 수 없습니다.'))
      return
    }
    if (isDemo && onDemoOrderReplace) {
      onDemoOrderReplace({ ...order, guestCount: g })
      setGuestEditOpen(false)
      setGuestDirectOpen(false)
      return
    }
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : tDefault('posServedNeedsOrderId'))
      return
    }
    setGuestSaving(true)
    try {
      const items = orderItemsToPosOrderItems(order.items)
      const merged: Order = { ...order, guestCount: g }
      const res = await updatePosOrder(buildUpdatePosOrderParamsFromOrder(merged, items))
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setGuestEditOpen(false)
      setGuestDirectOpen(false)
      onServed?.()
    } catch (e) {
      await appAlert(i18nTr(tDefault, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setGuestSaving(false)
    }
  }

  const confirmGuestDirectInput = () => {
    const v = parseInt(guestDirectValue, 10)
    if (!Number.isNaN(v)) void persistGuestCount(Math.max(0, Math.min(99, v)))
    setGuestDirectOpen(false)
  }

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
          {order.type === 'dine-in' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-xl border border-sky-500/45 bg-sky-500/[0.08] px-3 py-2 text-base shadow-sm',
                    'transition-colors hover:bg-sky-500/15 active:scale-[0.98]',
                    'dark:border-sky-500/35 dark:bg-sky-950/25 dark:hover:bg-sky-950/40',
                    guestSaving || String(order.status ?? '').toLowerCase() === 'cancelled'
                      ? 'pointer-events-none opacity-50'
                      : 'touch-manipulation'
                  )}
                  title={t('posOrderGuestCount') || ''}
                  aria-label={t('posOrderGuestCount') || undefined}
                  onClick={openGuestCountEditor}
                >
                  <Users className="h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />
                  <span className="font-semibold tabular-nums text-foreground">{order.guestCount ?? 0}</span>
                </button>
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
                        <div className="min-w-0 space-y-1">
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
                  {canStartPosLinePartialCancel(order) && !selectedLineItemId ? (
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
                        !canStartPosLinePartialCancel(order) ||
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
                    const hasSetChildren = Array.isArray(item.promoItems) && item.promoItems.length > 0
                    const mainNameT = translatePosMenuLineForReceipt(mainName, t)
                    const optionPartT = optionPart ? translatePosMenuLineForReceipt(optionPart, t) : undefined
                    const fullNameT = translatePosMenuLineForReceipt(item.name, t)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'grid cursor-default grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-1.5 gap-y-1 py-1.5 px-2 rounded-md border border-border/50 transition-shadow',
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
                        <div className="min-w-0 space-y-1">
                          <button
                            type="button"
                            className="w-full min-w-0 rounded-sm px-0.5 text-left hover:underline -mx-0.5"
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
                        {hasSetChildren && (
                          <div className="col-span-3 w-full overflow-hidden space-y-1 rounded-md border border-border/50 bg-background/70 p-1.5">
                            {item.promoItems!.flatMap((line, idx) => {
                              const qty = Math.max(1, Math.trunc(Number(line.quantity ?? 1) || 1))
                              const menuId = String(line.menuId ?? '').trim()
                              const optId = String(line.optionId ?? '').trim()
                              const menuLabel = menuId
                                ? resolvePosOrderItemMenuDisplayName({ id: menuId, name: menuId, menuId }, menusFromProps)
                                : `Set ${idx + 1}`
                              const childLabel = optId ? `${menuLabel} (${optId})` : menuLabel
                              return Array.from({ length: qty }).map((_, n) => {
                                const childKey = buildPosSetChildKey(line, idx, n)
                                const mapKey = `${item.id}::${childKey}`
                                const childDone = Boolean(itemChildServed[mapKey])
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
                                      void toggleSetChildServed(item.id, childKey)
                                    }}
                                    disabled={savingItemId === item.id || removingItemId !== null || cancelled}
                                  >
                                    <span className="truncate pr-1">{translatePosMenuLineForReceipt(childLabel, t)}</span>
                                    {childDone ? <Check className="h-5 w-5 shrink-0" /> : <CheckCircle className="h-5 w-5 shrink-0" />}
                                  </button>
                                )
                              })
                            })}
                          </div>
                        )}
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
                  {canStartPosLinePartialCancel(order) && !selectedLineItemId ? (
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
                        !canStartPosLinePartialCancel(order) ||
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

      <Dialog
        open={guestEditOpen}
        onOpenChange={(open) => {
          if (guestSaving) return
          setGuestEditOpen(open)
          if (!open) setGuestDirectOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('posOrderGuestCount') || '손님 수'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-muted-foreground">{tr('posTableGuestTapHint', '숫자를 선택하거나 직접 입력하세요.')}</p>
            <Select
              value={(() => {
                const n = Math.max(0, Math.min(99, Math.trunc(Number(order?.guestCount ?? 0) || 0)))
                if (n === 0) return '__zero__'
                if (n >= 1 && n <= 9) return String(n)
                return '__direct__'
              })()}
              onValueChange={(v) => {
                if (v === '__zero__') void persistGuestCount(0)
                else if (v === '__direct__') {
                  const cur = Math.max(0, Math.min(99, Math.trunc(Number(order?.guestCount ?? 0) || 0)))
                  setGuestDirectValue(String(cur > 9 ? cur : 10))
                  setGuestDirectOpen(true)
                } else void persistGuestCount(Number(v))
              }}
              disabled={guestSaving}
            >
              <SelectTrigger className="h-11 border-sky-600/35 bg-background/90 dark:border-sky-500/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__zero__">0</SelectItem>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
                <SelectItem value="__direct__">{t('posGuestDirectInput') || '직접 입력'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={guestSaving} onClick={() => setGuestEditOpen(false)}>
              {t('posCancel') ?? '취소'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guestDirectOpen} onOpenChange={(o) => !guestSaving && setGuestDirectOpen(o)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('posGuestDirectInput') || '직접 입력'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label className="text-sm text-muted-foreground">{tr('posGuestHowManyPh', '몇 명?')}</Label>
            <Input
              type="number"
              min={0}
              max={99}
              className="tabular-nums"
              value={guestDirectValue}
              onChange={(e) => setGuestDirectValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), confirmGuestDirectInput())}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setGuestDirectOpen(false)}>
              {t('posCancel') ?? '취소'}
            </Button>
            <Button type="button" size="sm" disabled={guestSaving} onClick={() => void confirmGuestDirectInput()}>
              {t('posConfirm') || '확인'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PosLineCancelQtyDialog
        open={cancelQtyDialogOpen}
        onOpenChange={setCancelQtyDialogOpen}
        item={cancelQtyTargetItem}
        displayName={
          cancelQtyTargetItem
            ? translatePosMenuLineForReceipt(cancelQtyTargetItem.name, t)
            : ''
        }
        allItems={order?.items ?? []}
        submitting={removingItemId !== null}
        onConfirm={(cq) => {
          if (!selectedLineItemId) return
          void applyLineCancel(selectedLineItemId, cq, false)
        }}
      />
    </div>
  )
}

