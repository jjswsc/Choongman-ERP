'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Order } from '@/lib/pos-types'
import { updatePosOrderStatus } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Clock, CheckCircle, Check } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { formatPosOrderMonthDayTime } from '@/lib/pos-datetime-locale'

export interface TableOrderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableName: string
  order: Order | null
  onServed?: () => void
  t?: (key: string) => string
}

export function TableOrderModal({
  open,
  onOpenChange,
  tableName,
  order,
  onServed,
  t = (k) => k,
}: TableOrderModalProps) {
  const { lang } = useLang()
  const serveActionLabel = t('posServeAction') || '서빙'
  const isServedReadyForPayment = order?.status === 'completed' || order?.status === 'ready'
  const [itemServed, setItemServed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!order?.items?.length) setItemServed({})
    else setItemServed((prev) => {
      const next = { ...prev }
      order.items.forEach((it) => {
        if (next[it.id] === undefined) next[it.id] = false
      })
      return next
    })
  }, [order?.id, order?.items])

  const markItemServed = (itemId: string) => {
    setItemServed((prev) => ({ ...prev, [itemId]: true }))
  }

  const servedCount = order?.items?.filter((it) => itemServed[it.id]).length ?? 0
  const allServed = order?.items?.length ? servedCount >= order.items.length : false

  const handleServeComplete = async () => {
    if (!order || order.status === 'completed') return
    const id = Number(order.id)
    if (Number.isNaN(id)) return
    try {
      await updatePosOrderStatus({ id, status: 'ready' })
      onServed?.()
      onOpenChange(false)
    } catch (e) {
      console.error('updatePosOrderStatus:', e)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {tableName} {t('posTableOrder') || '주문'}
          </DialogTitle>
        </DialogHeader>
        {!order ? (
          <p className="text-sm text-muted-foreground py-4">{t('posNoOrder') || '주문이 없습니다.'}</p>
        ) : (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 text-muted-foreground text-sm shrink-0">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{t('posOrderTime') || '주문 시각'}: {formatPosOrderMonthDayTime(order.createdAt, lang)}</span>
            </div>
            {isServedReadyForPayment ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg bg-muted/50 p-3">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t('posTableStatusServed') || '서빙 완료'}</span>
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1 max-h-[280px] rounded-md border">
                  <ul className="p-2 space-y-2">
                    {order.items.map((item) => {
                      const served = itemServed[item.id]
                      return (
                        <li
                          key={item.id}
                          className={cn(
                            'flex items-center justify-between gap-2 py-2 px-2 rounded-lg border border-border/50',
                            served && 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              x{item.quantity} · {(item.price * item.quantity).toLocaleString()} ฿
                            </p>
                          </div>
                          {served ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium shrink-0">
                              <Check className="w-4 h-4" />
                              {t('posTableStatusServed') || '서빙 완료'}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 h-8 text-xs"
                              onClick={() => markItemServed(item.id)}
                            >
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              {serveActionLabel}
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
                <div className="flex justify-between text-sm font-medium shrink-0">
                  <span>{t('posInputTotal') || '합계'}</span>
                  <span className="tabular-nums">{order.total.toLocaleString()} ฿</span>
                </div>
                <Button
                  onClick={handleServeComplete}
                  className="w-full shrink-0"
                  disabled={!allServed}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {allServed
                    ? t('posTableStatusServed') || '서빙 완료'
                    : `${t('posTableStatusServed') || '서빙 완료'} (${servedCount}/${order.items.length})`}
                </Button>
              </>
            )}
          </div>
        )}
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('posConfirm') || '확인'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
