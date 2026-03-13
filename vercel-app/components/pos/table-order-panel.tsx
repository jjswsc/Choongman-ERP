'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import { markPosOrderItemServed, updatePosOrderStatus } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Check, CheckCircle, Clock } from 'lucide-react'

export interface TableOrderPanelProps {
  tableName: string
  order: Order | null
  onServed?: () => void
  onAddOrder?: () => void
  onPay?: () => void
  onClose?: () => void
  t?: (key: string) => string
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function TableOrderPanel({
  tableName,
  order,
  onServed,
  onAddOrder,
  onPay,
  onClose,
  t = (k) => k,
}: TableOrderPanelProps) {
  const isCompleted = order?.status === 'completed'
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
        alert(res.message || (t('processFail') || '처리 실패'))
        return
      }
      setItemServed((prev) => ({ ...prev, [itemId]: nextServed }))
      onServed?.()
    } catch (e) {
      alert(String(e))
    } finally {
      setSavingItemId(null)
    }
  }

  const servedCount = order?.items?.filter((it) => itemServed[it.id]).length ?? 0
  const allServed = order?.items?.length ? servedCount >= order.items.length : false

  const handleServeComplete = async () => {
    if (!order || order.status === 'completed') return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    try {
      await updatePosOrderStatus({ id, status: 'completed' })
      onServed?.()
    } catch (e) {
      console.error('updatePosOrderStatus:', e)
    }
  }

  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      <div className="px-3 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold truncate">
          {tableName} {t('posTableOrder') || '주문'}
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
            <span>{t('posOrderTime') || '주문 시각'}: {formatDateTime(order.createdAt)}</span>
          </div>

          {isCompleted ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('posTableStatusServed') || '서빙 완료'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-11 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={onAddOrder}
                >
                  {t('posOrderButton') || '주문'}
                </Button>
                <Button className="h-11 text-base font-semibold" onClick={onPay}>
                  {t('posPayButton') || '결제'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 max-h-[320px] rounded-md border">
                <ul className="p-2 space-y-2">
                  {order.items.map((item) => {
                    const served = itemServed[item.id]
                    const optMatch = item.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
                    const mainName = optMatch ? optMatch[1].trim() : item.name
                    const optionPart = optMatch ? optMatch[2].trim() : null
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          'grid grid-cols-[1fr_auto] items-start gap-2 py-2 px-2 rounded-lg border border-border/50',
                          served && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-sm font-medium truncate text-left w-full hover:underline"
                            onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                            title={item.name}
                          >
                            {mainName}
                          </button>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {optionPart && <span className="mr-1">{optionPart}</span>}
                            x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                          </p>
                          {expandedItemId === item.id && (
                            <p className="text-xs text-muted-foreground mt-1 whitespace-normal break-words">
                              {item.name}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={served ? 'default' : 'outline'}
                          className="shrink-0 h-8 w-8 p-0 self-center"
                          onClick={() => { void toggleItemServed(item.id) }}
                          disabled={savingItemId === item.id}
                          aria-label={
                            served
                              ? (t('cancel') || '취소')
                              : (t('posTableStatusServed') || '서빙 완료')
                          }
                        >
                          {served ? <Check className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
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
                <Button className="h-11 text-base font-semibold" onClick={onPay}>
                  {t('posPayButton') || '결제'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
