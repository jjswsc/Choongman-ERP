'use client'
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Order, Table } from '@/lib/pos-types'
import {
  getPosPackagingChecklistByOrder,
  markPosOrderItemServed,
  posTakeoutToTable,
  type PosMenu,
  type PosOrderPackagingChecklistGroup,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { executePosFullOrderCancel } from '@/lib/pos-order-full-cancel-execute'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, Check, CheckCircle, Clock } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
import { resolvePosOrderItemMenuDisplayName } from '@/lib/pos-order-item-display-name'
import {
  translatePosMenuLineForReceipt,
  translateReceiptTableDisplayName,
  translateTakeoutOrderDisplayLabel,
} from '@/lib/pos-print-translate'
import {
  buildMemberPortalTakeoutBarSubLabel,
  resolveMemberPortalTakeoutMeta,
} from '@/lib/pos-member-portal-takeout-label'
import { parsePosOrderMemo } from '@/lib/pos-tax-invoice'
import {
  PosOrderTaxInvoiceEntryRow,
  PosOrderTaxInvoiceStatusButton,
} from '@/components/pos/pos-tax-invoice-form-ui'
import { buildPosSetChildKey, listPosSetChildKeys, readPosSetChildrenState } from '@/lib/pos-set-children-state'
import { buildPosOrderLineKeys, getPosOrderLineByKey } from '@/lib/pos-order-line-keys'
import { canStartPosLinePartialCancel, orderPaymentsSum } from '@/lib/pos-order-line-update'
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
  /** 빈 테이블 선택용 — 매장 테이블 목록 */
  allTables?: Table[]
  onPackaged?: () => void
  /** 기존 포장 주문에 메뉴 추가(메뉴 화면으로) */
  onAddOrder?: () => void
  onPay?: () => void
  onOpenTaxInvoice?: () => void
  /** 주문 취소 시 */
  onCancel?: () => void
  /** 전체 취소 성공 직후 — 터미널 목록·sessionStorage에서 즉시 제거 */
  onOrderDismissed?: (order: Order) => void
  /** 일부 취소 직후 홀·주방 재인쇄(터미널) */
  onAfterPartialLineRemoved?: (orderId: number, detail?: PosKitchenReprintPayload) => void | Promise<void>
  /** 전체 취소 직후 주방 취소 전표 */
  onAfterFullOrderKitchenReprint?: (orderId: number, detail: PosKitchenReprintPayload) => void | Promise<void>
  /** 포장→빈 테이블 전환 직전(Realtime 억제용) */
  onBeforeTakeoutToTable?: (orderId: number) => void
  /** 포장→빈 테이블 전환 성공 후(홀 탭 이동·재인쇄) */
  onAfterTakeoutToTable?: (orderId: number, targetTableName: string) => void | Promise<void>
  onClose?: () => void
  t?: (key: string) => string
  storeCode?: string
}

export function TakeoutOrderPanel({
  orderLabel,
  order,
  menus: menusFromProps = [],
  allTables = [],
  onPackaged,
  onAddOrder,
  onPay,
  onOpenTaxInvoice,
  onCancel,
  onOrderDismissed,
  onAfterPartialLineRemoved,
  onAfterFullOrderKitchenReprint,
  onBeforeTakeoutToTable,
  onAfterTakeoutToTable,
  onClose,
  t = (k) => k,
  storeCode = '',
}: TakeoutOrderPanelProps) {
  const { lang } = useLang()
  const ti = useT(lang)
  const memberTakeoutMeta = useMemo(
    () =>
      resolveMemberPortalTakeoutMeta({
        memo: order?.memo,
        memberId: order?.memberId,
        memberNo: order?.memberNo,
        tableName: order?.tableName,
      }),
    [order?.memo, order?.memberId, order?.memberNo, order?.tableName]
  )
  const memberPickupTimeLabel = useMemo(() => {
    if (!memberTakeoutMeta.isMemberPortal || !memberTakeoutMeta.pickupAtRaw) return ''
    return buildMemberPortalTakeoutBarSubLabel({
      createdAt: order?.createdAt,
      pickupAtRaw: memberTakeoutMeta.pickupAtRaw,
      lang,
      orderTimeLabel: ti('posOrderTimeShort') || '주문',
      pickupTimeLabel: ti('posPickupAtShort') || '픽업',
    })
  }, [memberTakeoutMeta, order?.createdAt, lang, ti])
  const normalizedStatus = String(order?.status ?? '').trim().toLowerCase()
  const isCompleted = normalizedStatus === 'completed'
  const isPaid = normalizedStatus === 'paid' || normalizedStatus === 'completed'
  const hasTaxInvoice = Boolean(parsePosOrderMemo(order?.memo).taxInvoice)
  const [itemPackaged, setItemPackaged] = useState<Record<string, boolean>>({})
  const [itemChildPackaged, setItemChildPackaged] = useState<Record<string, boolean>>({})
  const [itemCancelled, setItemCancelled] = useState<Record<string, boolean>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [checklistSubmitting, setChecklistSubmitting] = useState(false)
  const [checklistGroups, setChecklistGroups] = useState<PosOrderPackagingChecklistGroup[]>([])

  const lineKeys = useMemo(() => buildPosOrderLineKeys(order?.items ?? []), [order?.items])

  useEffect(() => {
    if (!order?.items?.length) {
      setItemPackaged((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      setItemChildPackaged((prev) => (Object.keys(prev).length === 0 ? prev : {}))
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
      return changed ? next : prev
    })
    setItemChildPackaged((prev) => {
      let changed = false
      const next = { ...prev }
      order.items.forEach((it, i) => {
        const lineKey = keys[i] ?? `line-${i}`
        const childKeys = listPosSetChildKeys(Array.isArray(it.promoItems) ? it.promoItems : [])
        if (!childKeys.length) return
        const childState = readPosSetChildrenState(it.setChildrenState)
        childKeys.forEach((key) => {
          const raw = childState[key]
          const done = Boolean(String(raw?.packedAt ?? raw?.servedAt ?? (it.servedAt ? '1' : '')).trim())
          const mapKey = `${lineKey}::${key}`
          if (next[mapKey] !== done) { next[mapKey] = done; changed = true }
        })
      })
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
      return changed ? next : prev
    })
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
  const payButtonDisabled =
    !order || isPaid || isCompleted || orderPaymentsSum(order) > 0.005
  const canAddOrder = Boolean(
    order &&
      onAddOrder &&
      !isCompleted &&
      !isPaid &&
      normalizedStatus !== 'cancelled' &&
      normalizedStatus !== 'refunded' &&
      orderPaymentsSum(order) <= 0.005
  )
  const canMoveToTable = Boolean(
    order &&
      order.type === 'takeout' &&
      canCancel &&
      posOrderHasServerId(order.id) &&
      (order.items?.length ?? 0) > 0
  )
  const emptyTableOptions = useMemo(
    () =>
      allTables.filter((tab) => {
        const n = String(tab.name ?? '').trim()
        return Boolean(n) && !tab.isOccupied
      }),
    [allTables]
  )
  const [cancelling, setCancelling] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [selectedLineItemId, setSelectedLineItemId] = useState<string | null>(null)
  const [cancelQtyDialogOpen, setCancelQtyDialogOpen] = useState(false)
  const [moveToTableOpen, setMoveToTableOpen] = useState(false)
  const [moveTargetName, setMoveTargetName] = useState('')
  const [moveSubmitting, setMoveSubmitting] = useState(false)

  useEffect(() => {
    if (!moveToTableOpen) return
    const first = emptyTableOptions[0]?.name
    setMoveTargetName(first ? String(first) : '')
  }, [moveToTableOpen, emptyTableOptions])

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

  const applyLineCancel = async (itemId: string, cancelQty: number, confirmBeforeApply: boolean) => {
    if (!order) return
    const target = getPosOrderLineByKey(order.items, itemId)
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
        storeCode,
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
      const outcome = await executePosFullOrderCancel({
        order,
        storeCode,
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
      onOrderDismissed?.(order)
      onCancel?.()
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setCancelling(false)
    }
  }

  const handleHandoverComplete = async () => {
    if (!order || order.status !== 'ready') return
    const id = Number(order.id)
    if (!posOrderHasServerId(order.id)) {
      const msg = t('posServedNeedsOrderId')
      await appAlert(msg && msg !== 'posServedNeedsOrderId' ? msg : ti('posServedNeedsOrderId'))
      return
    }
    if (Number.isNaN(id)) return
    const go = await appConfirm(
      t('posTakeoutHandoverConfirm') || '손님 수령 완료로 주문을 마감할까요?'
    )
    if (!go) return
    try {
      const res = await updatePosOrderStatus({ id, status: 'completed' })
      if (!res.success) {
        await appAlert(
          localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang)
        )
        return
      }
      onOrderDismissed?.(order)
      onPackaged?.()
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
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

  const handleTakeoutToTable = async () => {
    if (!order || !canMoveToTable || !moveTargetName.trim()) return
    const orderId = Number(order.id)
    if (!Number.isFinite(orderId) || orderId <= 0) return
    const target = moveTargetName.trim()
    const fromLabel = translateTakeoutOrderDisplayLabel(orderLabel, t)
    const toLabel = translateReceiptTableDisplayName(target, t)
    if (
      !(await appConfirm(
        `${t('posTakeoutToTableConfirm') || '테이블로 이동'}?\n${fromLabel} → ${toLabel}\n${t('posTakeoutToTableHint') || ''}`
      ))
    ) {
      return
    }
    setMoveSubmitting(true)
    try {
      onBeforeTakeoutToTable?.(orderId)
      const res = await posTakeoutToTable({ orderId, targetTableName: target })
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, t('processFail') || '처리 실패', lang))
        return
      }
      setMoveToTableOpen(false)
      await onAfterTakeoutToTable?.(orderId, target)
      onClose?.()
    } catch (e) {
      await appAlert(i18nTr(ti, 'posUnexpectedErrorDetail', { detail: String(e) }))
    } finally {
      setMoveSubmitting(false)
    }
  }

  const moveToTableButton = canMoveToTable ? (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full gap-1.5 text-base font-semibold"
      disabled={emptyTableOptions.length === 0 || moveSubmitting}
      title={
        emptyTableOptions.length === 0
          ? t('posTableMoveEmpty') || ''
          : t('posTakeoutToTableHint') || ''
      }
      onClick={() => setMoveToTableOpen(true)}
    >
      <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
      {t('posTakeoutToTableBtn') || '테이블로 이동'}
    </Button>
  ) : null

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
          {memberTakeoutMeta.isMemberPortal ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
              <p className="font-semibold">{t('posMemberPortalOrder') || '회원주문'}</p>
              {(memberTakeoutMeta.memberName || memberTakeoutMeta.memberNo) ? (
                <p className="mt-0.5 text-xs opacity-90">
                  {[memberTakeoutMeta.memberName, memberTakeoutMeta.memberNo].filter(Boolean).join(' · ')}
                </p>
              ) : null}
              {memberPickupTimeLabel ? (
                <p className="mt-1 text-xs tabular-nums opacity-90">{memberPickupTimeLabel}</p>
              ) : null}
            </div>
          ) : null}

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
            </>
          ) : order.status === 'ready' ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('posTakeoutReadyForPickup') || '픽업 대기'}</span>
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
              <div className="flex justify-between text-sm font-medium">
                <span>{t('posInputTotal') || '합계'}</span>
                <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
              </div>
              <PosOrderTaxInvoiceEntryRow
                hasTaxInvoice={hasTaxInvoice}
                onOpen={onOpenTaxInvoice}
                t={(key, fallback) => t(key) || fallback || key}
              />
              <Button
                onClick={() => void handleHandoverComplete()}
                className="h-11 w-full text-base font-semibold bg-primary"
              >
                {t('posTakeoutPickupComplete') || '수령 완료'}
              </Button>
              {!payButtonDisabled ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="h-11 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={!canAddOrder}
                    onClick={() => onAddOrder?.()}
                  >
                    {t('posAddOrderButton') || ti('posAddOrderButton') || '추가 주문'}
                  </Button>
                  <Button
                    className="h-11 text-base font-semibold"
                    disabled={payButtonDisabled}
                    onClick={() => {
                      if (!payButtonDisabled) onPay?.()
                    }}
                  >
                    {t('posTablePayInStore') || '매장 결제'}
                  </Button>
                </div>
              ) : null}
              {moveToTableButton}
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
                  {order.items.map((item, itemIndex) => {
                    const lineKey = lineKeys[itemIndex] ?? `line-${itemIndex}`
                    const packaged = itemPackaged[lineKey]
                    const cancelled = itemCancelled[lineKey]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const mainDisp = translatePosMenuLineForReceipt(mainName, ti)
                    const optionDisp = optionPart ? translatePosMenuLineForReceipt(optionPart, ti) : null
                    const fullDisp = translatePosMenuLineForReceipt(item.name, ti)
                    return (
                      <li
                        key={lineKey}
                        className={cn(
                          'grid cursor-default grid-cols-[1fr_auto] items-start gap-2 py-2 px-2 rounded-lg border border-border/50 transition-shadow',
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
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="w-full min-w-0 rounded-sm px-0.5 text-left text-sm font-medium leading-snug break-words hover:underline -mx-0.5"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (cancelled) return
                              setSelectedLineItemId((prev) => (prev === lineKey ? null : lineKey))
                            }}
                            title={fullDisp}
                          >
                            {mainDisp}
                          </button>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {optionDisp && <span className="mr-1">{optionDisp}</span>}
                            x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                          </p>
                          {Array.isArray(item.promoItems) && item.promoItems.length > 0 && (
                            <div className="mt-1.5 w-full max-w-full overflow-hidden space-y-1 rounded-md border border-border/50 bg-background/70 p-1.5">
                              {item.promoItems.flatMap((line, idx) => {
                                const qty = Math.max(1, Math.trunc(Number(line.quantity ?? 1) || 1))
                                const menuId = String(line.menuId ?? '').trim()
                                const rawMenu = menuId
                                  ? resolvePosOrderItemMenuDisplayName({ id: menuId, name: menuId, menuId }, menusFromProps)
                                  : `Set ${idx + 1}`
                                const rawOpt = String(line.optionName ?? '').trim() || String(line.optionId ?? '').trim()
                                const childLabel = rawOpt ? `${rawMenu} (${rawOpt})` : rawMenu
                                return Array.from({ length: qty }).map((_, n) => {
                                  const childKey = buildPosSetChildKey(line, idx, n)
                                  const mapKey = `${lineKey}::${childKey}`
                                  const childDone = Boolean(itemChildPackaged[mapKey])
                                  return (
                                    <button
                                      key={`${lineKey}-${childKey}`}
                                      type="button"
                                      className={cn(
                                        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded pl-2 pr-0.5 py-1.5 text-left text-base font-medium transition-colors',
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
                                      <span className="truncate pr-1">{translatePosMenuLineForReceipt(childLabel, ti)}</span>
                                      {childDone ? <Check className="h-5 w-5 shrink-0" /> : <CheckCircle className="h-5 w-5 shrink-0" />}
                                    </button>
                                  )
                                })
                              })}
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

              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-11 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!canAddOrder}
                  onClick={() => onAddOrder?.()}
                >
                  {t('posAddOrderButton') || ti('posAddOrderButton') || '추가 주문'}
                </Button>
                <Button
                  className="h-11 text-base font-semibold"
                  disabled={payButtonDisabled}
                  onClick={() => {
                    if (!payButtonDisabled) onPay?.()
                  }}
                >
                  {isPaid
                    ? (t('posPaymentComplete') || '결제 완료')
                    : (t('posTablePayInStore') || '매장 결제')}
                </Button>
              </div>
              {moveToTableButton}
              <Button
                onClick={handlePackComplete}
                className="h-11 w-full text-base font-semibold"
                disabled={!allPackaged}
              >
                {allPackaged
                  ? (t('posDeliveryPackagingComplete') || '포장 완료')
                  : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${activeLineEntries.length || order.items.length})`}
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

      <Dialog open={moveToTableOpen} onOpenChange={setMoveToTableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posTakeoutToTableTitle') || '테이블로 이동'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('posTakeoutToTableHint') || ''}</p>
          {emptyTableOptions.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 py-2">
              {t('posTableMoveEmpty') || ''}
            </p>
          ) : (
            <div className="space-y-2 py-2">
              <Label className="text-xs font-semibold">
                {t('posTakeoutToTableTarget') || t('posTableMoveTarget') || '이동할 테이블'}
              </Label>
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
                disabled={!moveTargetName || moveSubmitting}
                onClick={() => {
                  void handleTakeoutToTable()
                }}
              >
                {moveSubmitting ? '…' : t('posTakeoutToTableConfirm') || '이 테이블로 이동'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

