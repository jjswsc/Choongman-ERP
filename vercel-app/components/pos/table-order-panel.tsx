'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Order } from '@/lib/pos-types'
import type { PosDeliveryApp } from '@/lib/api-client'
import { markPosOrderItemServed, updatePosOrder, updatePosOrderStatus } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'
import { Check, CheckCircle, Clock, Users, XCircle } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'

export interface TableOrderPanelProps {
  tableName: string
  order: Order | null
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

  const canCancel = order && !['completed', 'cancelled'].includes(order.status ?? '')

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
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'grid grid-cols-[1fr_auto] items-start gap-1.5 py-1.5 px-2 rounded-md border border-border/50',
                          served && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left hover:underline"
                              onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                              title={item.name}
                            >
                              <span className="block text-base font-medium leading-snug line-clamp-2">
                                {mainName}
                              </span>
                            </button>
                            <span className="shrink-0 text-sm text-muted-foreground tabular-nums leading-snug pt-0.5">
                              ×{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                            </span>
                          </div>
                          {optionPart && (
                            <p
                              className="text-sm text-muted-foreground line-clamp-2 break-words pl-0 leading-snug"
                              title={optionPart}
                            >
                              {optionPart}
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
                              {item.name}
                              {noteTrim ? ` · ${noteTrim}` : ''}
                            </p>
                          )}
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
