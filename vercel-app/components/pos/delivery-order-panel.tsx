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
  markPosOrderItemServed,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { posOrderHasServerId } from '@/lib/pos-order-server-id'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, Clock, XCircle } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT, tr as i18nTr } from '@/lib/i18n'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'
import { extractGrabOrderIdFromMemo, extractGrabStateFromMemo } from '@/lib/grab-order-memo'
import {
  grabStateToStageIndex,
  GRAB_DELIVERY_PROGRESS_STAGE_COUNT,
} from '@/lib/grab-delivery-progress'
import { PackagingChecklistDialog } from '@/components/pos/packaging-checklist-dialog'
import { normalizePosLineNote } from '@/lib/pos-line-note'

export interface DeliveryOrderPanelProps {
  orderLabel: string
  order: Order | null
  /** 품목 `name`이 코드로만 온 경우(Grab 등) POS 메뉴명으로 복원 */
  menus?: PosMenu[]
  deliveryApps?: PosDeliveryApp[]
  onPackaged?: () => void
  onPay?: () => void
  /** 주문 취소 시 */
  onCancel?: () => void
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
  onPay,
  onCancel,
  onClose,
  storeCode,
  t = (k) => k,
}: DeliveryOrderPanelProps) {
  const { lang } = useLang()
  const ti = useT(lang)
  const isCompleted = order?.status === 'completed'
  const [itemPackaged, setItemPackaged] = useState<Record<string, boolean>>({})
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

  useEffect(() => {
    setOptimisticGrabState(null)
  }, [order?.id, order?.memo, order?.status])

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
        await appAlert(res.message || (t('processFail') || '처리 실패'))
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

  const canCancel = order && !['completed', 'cancelled'].includes(order.status ?? '')
  const [cancelling, setCancelling] = useState(false)
  const [deciding, setDeciding] = useState(false)

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
      await updatePosOrderStatus({ id: Number(order.id), status: 'cancelled' })
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
              </div>
              <Button className="h-11 text-base font-semibold w-full" onClick={() => onPay?.()}>
                {t('posTablePayInStore') || '매장 결제'}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancel') || '주문 취소'}
                </Button>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[320px] rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const displayName = resolvePosOrderItemMenuDisplayName(
                      { id: item.id, name: item.name, menuId: item.menuId },
                      menusFromProps
                    )
                    const packaged = itemPackaged[item.id]
                    const optMatch = displayName.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : displayName
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    const meta = parseItemMeta(item.note)
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'grid grid-cols-[1fr_auto] items-start gap-2 py-2 px-2 rounded-lg border border-border/50',
                          packaged && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium truncate text-left w-full hover:underline"
                            onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
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
                        </div>
                        <Button
                          size="sm"
                          variant={packaged ? 'default' : 'outline'}
                          className="shrink-0 h-9 w-9 p-0 self-start mt-0.5"
                          onClick={() => { void toggleItemPackaged(item.id) }}
                          disabled={savingItemId === item.id}
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
                <CheckCircle className="w-4 h-4 mr-2" />
                {allPackaged
                  ? (t('posDeliveryPackagingComplete') || '포장 완료')
                  : `${t('posDeliveryPackagingComplete') || '포장 완료'} (${packagedCount}/${order.items.length})`}
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
                {t('posTablePayInStore') || '매장 결제'}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancel') || '주문 취소'}
                </Button>
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
