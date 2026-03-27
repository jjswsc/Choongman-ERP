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
import type { PosDeliveryApp } from '@/lib/api-client'
import {
  markPosOrderItemServed,
  posDineInTableMerge,
  posDineInTableMove,
  updatePosOrder,
  updatePosOrderStatus,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { translatePosMenuLineForReceipt, translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, CheckCircle, Clock, Users, XCircle, ArrowRightLeft, Combine } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'

export interface TableOrderPanelProps {
  tableName: string
  order: Order | null
  /** 테이블 이동·합석용 (매장 전체 테이블 목록) */
  allTables?: Table[]
  deliveryApps?: PosDeliveryApp[]
  onServed?: () => void
  onAddOrder?: () => void
  onPay?: () => void
  /** 선불 결제 후 손님 퇴장 시 (테이블 초기화) */
  onLeaveTable?: () => void | Promise<void>
  /** 주문 취소 시 */
  onCancel?: () => void
  onClose?: () => void
  t?: (key: string) => string
}

function getPlatformAndOrderNo(order: Order, deliveryApps?: PosDeliveryApp[]): { platform: string; orderNo: string } {
  const text = [order.customerName ?? '', order.orderNo ?? '', order.memo ?? ''].filter(Boolean).join(' ')
  const raw = text.toLowerCase()
  let platform = ''
  if (deliveryApps?.length) {
    for (const app of deliveryApps) {
      const keywords = app.matchKeywords || []
      if (keywords.some((k) => raw.includes(String(k).toLowerCase()))) {
        platform = app.name
        break
      }
    }
  }
  if (!platform) {
    if (raw.includes('grab') || raw.includes('그랩')) platform = 'Grab'
    else if (raw.includes('lineman') || raw.includes('line man') || raw.includes('라인맨')) platform = 'Line Man'
    else if (raw.includes('shopee') || raw.includes('쇼피')) platform = 'Shopee'
  }
  const hashMatch = text.match(/#\s*([A-Za-z0-9-]+)/)
  const orderNo = hashMatch?.[1] ?? order.orderNo ?? ''
  return { platform, orderNo }
}

export function TableOrderPanel({
  tableName,
  order,
  allTables = [],
  deliveryApps = [],
  onServed,
  onAddOrder,
  onPay,
  onLeaveTable,
  onCancel,
  onClose,
  t = (k) => k,
}: TableOrderPanelProps) {
  const { lang } = useLang()
  const dineOutApps = deliveryApps.filter((a) => a.dineOutEnabled && a.enabled)
  const showPlatformPayOption = dineOutApps.length > 0
  const isServedReadyForPayment = order?.status === 'ready'
  const isPaidPrepaid = order?.status === 'paid'
  const mergeDisabledByPayment = isPaidPrepaid
  const [itemServed, setItemServed] = useState<Record<string, boolean>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!order?.items?.length) {
      setItemServed({})
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
    }
  }, [order?.id, order?.items])

  const toggleItemServed = async (itemId: string) => {
    if (!order) return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    const nextServed = !itemServed[itemId]
    setSavingItemId(itemId)
    try {
      const res = await markPosOrderItemServed({
        id,
        itemId,
        served: nextServed,
      })
      if (!res.success) {
        await appAlert(res.message || (t('processFail') || '처리 실패'))
        return
      }
      setItemServed((prev) => ({ ...prev, [itemId]: nextServed }))
      onServed?.()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingItemId(null)
    }
  }

  const servedCount = order?.items?.filter((it) => itemServed[it.id]).length ?? 0
  const allServed = order?.items?.length ? servedCount >= order.items.length : false

  const [payChoiceOpen, setPayChoiceOpen] = useState(false)
  const [platformPaymentConfirmOpen, setPlatformPaymentConfirmOpen] = useState(false)
  const [platformPaymentSubmitting, setPlatformPaymentSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [moveTargetName, setMoveTargetName] = useState('')
  const [mergeTargetName, setMergeTargetName] = useState('')
  const [mergeDirection, setMergeDirection] = useState<'into_selected' | 'into_current'>('into_selected')
  const [transferSubmitting, setTransferSubmitting] = useState(false)

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
  const mergePeerOptions = useMemo(
    () =>
      allTables.filter((t) => {
        const n = String(t.name ?? '').trim()
        if (!n || n === currentNameNorm) return false
        const o = t.order
        if (!t.isOccupied || !o || String(o.id) === String(order?.id ?? '')) return false
        if (o.status === 'paid') return false
        return true
      }),
    [allTables, currentNameNorm, order?.id]
  )

  useEffect(() => {
    if (moveOpen) {
      const first = emptyTableOptions[0]?.name
      setMoveTargetName(first ? String(first) : '')
    }
  }, [moveOpen, emptyTableOptions])

  useEffect(() => {
    if (mergeOpen) {
      const first = mergePeerOptions[0]?.name
      setMergeTargetName(first ? String(first) : '')
      setMergeDirection('into_selected')
    }
  }, [mergeOpen, mergePeerOptions])

  const handleCancelOrder = async () => {
    if (!order || !await appConfirm(t('posCancelConfirm') || '이 주문을 취소하시겠습니까?')) return
    setCancelling(true)
    try {
      await updatePosOrderStatus({ id: Number(order.id), status: 'cancelled' })
      onCancel?.()
      onClose?.()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCancelling(false)
    }
  }

  const handlePayClick = () => setPayChoiceOpen(true)
  const handlePayInStore = () => {
    setPayChoiceOpen(false)
    onPay?.()
  }
  const handlePayPlatform = () => {
    setPayChoiceOpen(false)
    setPlatformPaymentConfirmOpen(true)
  }

  const handlePlatformPaymentConfirm = async () => {
    if (!order) return
    setPlatformPaymentSubmitting(true)
    try {
      const items = order.items.map((it) => ({
        id: it.id,
        name: it.name,
        price: it.price,
        qty: it.quantity || 1,
        ...(it.note?.trim() ? { note: it.note.trim() } : {}),
      }))
      await updatePosOrder({
        id: Number(order.id),
        items,
        tableName,
        memo: order.memo,
        paymentCash: 0,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: order.total,
      })
      await updatePosOrderStatus({ id: Number(order.id), status: 'completed' })
      setPlatformPaymentConfirmOpen(false)
      onServed?.()
      onPay?.()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setPlatformPaymentSubmitting(false)
    }
  }

  const handleServeComplete = async () => {
    if (!order || order.status === 'completed') return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    try {
      await updatePosOrderStatus({ id, status: 'ready' })
      onServed?.()
    } catch (e) {
      console.error('updatePosOrderStatus:', e)
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
        await appAlert(res.message || (t('processFail') || '처리 실패'))
        return
      }
      setMoveOpen(false)
      onServed?.()
      onClose?.()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTransferSubmitting(false)
    }
  }

  const handleTableMerge = async () => {
    if (!order || order.type !== 'dine-in' || !mergeTargetName.trim()) return
    const peer = allTables.find((x) => String(x.name ?? '').trim() === mergeTargetName.trim())
    if (!peer?.order) return
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
        await appAlert(res.message || (t('processFail') || '처리 실패'))
        return
      }
      setMergeOpen(false)
      onServed?.()
      if (mergeDirection === 'into_selected') onClose?.()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setTransferSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <h3 className="text-base font-semibold truncate">
          {translateReceiptTableDisplayName(tableName, t)} {t('posTableOrder') || '주문'}
        </h3>
        <Button variant="outline" size="sm" className="h-8 text-sm" onClick={onClose}>
          {t('posBack') || '뒤로가기'}
        </Button>
      </div>

      {!order ? (
        <div className="p-3 text-base text-muted-foreground">{t('posNoOrder') || '주문이 없습니다.'}</div>
      ) : (
        <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-muted-foreground text-base">
            <Clock className="w-5 h-5 shrink-0" />
            <span>{t('posOrderTime') || '주문 시각'}: {formatPosOrderMonthDayTime(order.createdAt, lang)}</span>
          </div>
          {order.type === 'dine-in' && (order.guestCount ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground text-base">
              <Users className="w-5 h-5 shrink-0" />
              <span>
                {t('posOrderGuestCount') || '손님 수'}:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {order.guestCount}
                  {t('posPeopleUnit') || ''}
                </span>
              </span>
            </div>
          )}

          {order.type === 'dine-in' && allTables.length > 0 && (
            <div className="rounded-lg border border-border/80 bg-muted/25 p-2.5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-snug">
                {t('posTableMoveTitle') || '테이블 이동'} · {t('posTableMergeTitle') || '합석'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs font-semibold"
                  disabled={emptyTableOptions.length === 0 || transferSubmitting}
                  onClick={() => setMoveOpen(true)}
                >
                  <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden />
                  {t('posTableMoveTitle') || '이동'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5 text-xs font-semibold"
                  title={mergeDisabledByPayment ? (t('posTableMergeHint') || '') : undefined}
                  disabled={
                    mergePeerOptions.length === 0 || mergeDisabledByPayment || transferSubmitting
                  }
                  onClick={() => setMergeOpen(true)}
                >
                  <Combine className="h-4 w-4 shrink-0" aria-hidden />
                  {t('posTableMergeTitle') || '합석'}
                </Button>
              </div>
            </div>
          )}

          {isPaidPrepaid ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-base rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>{t('posPrepaidPaid') || '선불 결제 완료'}</span>
              </div>
              <Button
                className="w-full h-11 text-base font-semibold"
                onClick={async () => {
                  if (!order) return
                  try {
                    await updatePosOrderStatus({ id: Number(order.id), status: 'completed' })
                    await onLeaveTable?.()
                  } catch (e) {
                    await appAlert(String(e))
                  }
                }}
              >
                {t('posTableLeave') || '퇴장 (테이블 비우기)'}
              </Button>
              {canCancel && (
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancel') || '주문 취소'}
                </Button>
              )}
            </>
          ) : isServedReadyForPayment ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-base rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>{t('posTableStatusServed') || '서빙 완료'}</span>
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
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancel') || '주문 취소'}
                </Button>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[min(360px,45vh)] rounded-md border">
                <ul className="p-1.5 space-y-1">
                  {order.items.map((item) => {
                    const served = itemServed[item.id]
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
                          'flex items-start gap-1.5 py-1.5 px-2 rounded-md border border-border/50',
                          served && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <button
                            type="button"
                            className="block w-full min-w-0 text-left hover:underline"
                            onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
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
                          {expanded && (
                            <p className="text-sm text-muted-foreground pt-0.5 whitespace-normal break-words border-t border-border/40 mt-1">
                              {fullNameT}
                              {noteTrim ? ` · ${noteTrim}` : ''}
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
                          className="shrink-0 h-9 w-9 p-0 self-start mt-0.5"
                          onClick={() => { void toggleItemServed(item.id) }}
                          disabled={savingItemId === item.id}
                          aria-label={
                            served
                              ? (t('cancel') || '취소')
                              : (t('posTableStatusServed') || '서빙 완료')
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

              <Button onClick={handleServeComplete} className="w-full h-11 text-base font-semibold" disabled={!allServed}>
                <CheckCircle className="w-4 h-4 mr-2" />
                {allServed
                  ? t('posTableStatusServed') || '서빙 완료'
                  : `${t('posTableStatusServed') || '서빙 완료'} (${servedCount}/${order.items.length})`}
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
                <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/50 hover:bg-destructive/10" disabled={cancelling} onClick={handleCancelOrder}>
                  <XCircle className="w-4 h-4 mr-1" />
                  {t('posOrderCancel') || '주문 취소'}
                </Button>
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
                <Select value={mergeTargetName} onValueChange={setMergeTargetName}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mergePeerOptions.map((tab) => (
                      <SelectItem key={tab.id} value={String(tab.name ?? '').trim()}>
                        {translateReceiptTableDisplayName(String(tab.name ?? ''), t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    <SelectItem value="into_selected">{t('posTableMergeIntoSelected') || ''}</SelectItem>
                    <SelectItem value="into_current">{t('posTableMergeIntoCurrent') || ''}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!mergeTargetName || transferSubmitting}
                onClick={() => { void handleTableMerge() }}
              >
                {transferSubmitting ? '…' : (t('posTableMergeConfirm') || '합석')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={payChoiceOpen} onOpenChange={setPayChoiceOpen}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posPayButton') || '결제'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Button className="w-full h-11 text-base font-semibold" variant="outline" onClick={handlePayInStore}>
              {t('posTablePayInStore') || '매장 결제'}
            </Button>
            <Button className="w-full h-11 text-base font-semibold" variant="outline" onClick={handlePayPlatform}>
              {t('posTablePayPlatform') || '배달앱 결제(플랫폼)'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={platformPaymentConfirmOpen} onOpenChange={setPlatformPaymentConfirmOpen}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('posDeliveryPaymentConfirmTitle') || '결제 확인'}</DialogTitle>
          </DialogHeader>
          {order && (() => {
            const { platform, orderNo } = getPlatformAndOrderNo(order, deliveryApps)
            const platformOrderText = [platform, orderNo ? `#${orderNo}` : ''].filter(Boolean).join(' ')
            return (
              <div className="space-y-4 py-2">
                {platformOrderText ? (
                  <div className="rounded-lg border bg-card px-3 py-2.5">
                    <p className="text-xs text-muted-foreground mb-1">{t('posDeliveryPaymentConfirmVerify') || '플랫폼·주문번호 확인'}</p>
                    <p className="text-base font-bold tabular-nums">{platformOrderText}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('posTablePayPlatformNote') || '배달앱(Grab/Line Man/Shopee) dine out 주문은 플랫폼에서 이미 결제되었습니다.'}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {t('posDeliveryPaymentConfirmMessage') || '배달 주문은 플랫폼에서 이미 결제되었으며, 익일 통장으로 정산됩니다. 확인 완료하시겠습니까?'}
                </p>
                <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                  <span className="text-xs text-muted-foreground">{t('posInputTotal') || '합계'}</span>
                  <div className="text-xl font-bold tabular-nums">{order.total.toLocaleString()} ฿</div>
                </div>
                <Button className="w-full" size="lg" disabled={platformPaymentSubmitting} onClick={handlePlatformPaymentConfirm}>
                  {platformPaymentSubmitting ? '...' : (t('posDeliveryPaymentComplete') || '완료')}
                </Button>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
