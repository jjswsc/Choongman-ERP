'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bike, Package, Clock, MapPin, ChevronRight } from 'lucide-react'
import type { Order } from '@/lib/pos-types'
import { cn } from '@/lib/utils'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { translatePosMenuLineForReceipt } from '@/lib/pos-print-translate'

interface OrderListProps {
  deliveryOrders: Order[]
  takeoutOrders: Order[]
  /** 'delivery' | 'takeout' 이면 해당 유형만 표시, 없으면 둘 다 표시 */
  mode?: 'delivery' | 'takeout' | 'all'
  onOrderSelect?: (order: Order) => void
  onStatusUpdate?: (orderId: string, status: Order['status']) => void
  t?: (k: string) => string
}

function formatTime(date: Date, t: (k: string) => string): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (minutes < 1) return t('posJustNow')
  if (minutes < 60) return `${minutes}${t('posMinutesAgo')}`
  const hours = Math.floor(minutes / 60)
  return `${hours}${t('posHoursAgo')} ${minutes % 60}${t('posMinutesAgo')}`
}

function getStatusColor(status: Order['status']) {
  switch (status) {
    case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'preparing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    case 'ready': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
  }
}

function getStatusLabel(status: Order['status'], t: (k: string) => string) {
  switch (status) {
    case 'pending': return t('posOrderStatusReceived')
    case 'preparing': return t('posOrderStatusPreparing')
    case 'ready': return t('posOrderStatusReady')
    case 'completed': return t('posOrderStatusCompleted')
    default: return status
  }
}

function OrderCard({
  order,
  onSelect,
  onStatusUpdate,
  t
}: {
  order: Order
  onSelect?: () => void
  onStatusUpdate?: (status: Order['status']) => void
  t: (k: string) => string
}) {
  const nextStatus = order.status === 'pending' ? 'preparing' : order.status === 'preparing' ? 'ready' : 'completed'

  return (
    <div
      className={cn(
        'p-3 rounded-lg border transition-all cursor-pointer hover:shadow-md',
        order.type === 'delivery'
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {order.type === 'delivery' ? (
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Bike className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
          )}
          <div>
            <p className="font-semibold text-sm text-foreground">{order.customerName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(order.createdAt, t)}
            </p>
          </div>
        </div>
        <Badge className={cn('text-xs', getStatusColor(order.status))}>
          {getStatusLabel(order.status, t)}
        </Badge>
      </div>

      <div className="space-y-1 mb-2">
        {order.items.slice(0, 2).map(item => (
          <p key={item.id} className="text-sm text-foreground">
            {translatePosMenuLineForReceipt(item.name, t)} x{item.quantity}
          </p>
        ))}
        {order.items.length > 2 && (
          <p className="text-xs text-muted-foreground">{t('posAndMore')} {order.items.length - 2}</p>
        )}
      </div>

      {order.type === 'delivery' && order.address && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{order.address}</span>
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="font-bold text-foreground">
          {order.total.toLocaleString()} ฿
        </span>
        {order.status !== 'completed' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onStatusUpdate?.(nextStatus)
            }}
          >
            {nextStatus === 'preparing' ? t('posStartCooking') : nextStatus === 'ready' ? t('posReady') : t('posDone')}
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function OrderList({
  deliveryOrders,
  takeoutOrders,
  mode = 'all',
  onOrderSelect,
  onStatusUpdate,
  t: tProp
}: OrderListProps) {
  const { lang } = useLang()
  const tDefault = useT(lang)
  const t = tProp ?? tDefault
  const showDelivery = mode === 'all' || mode === 'delivery'
  const showTakeout = mode === 'all' || mode === 'takeout'

  return (
    <div className="flex flex-col h-full gap-4">
      {showDelivery && (
        <Card className="flex-1 min-h-0">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bike className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {t('posDelivery')}
              </CardTitle>
              <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                {deliveryOrders.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className={mode === 'delivery' ? 'h-full min-h-[280px]' : 'h-[200px]'}>
              <div className="space-y-2 pr-2">
                {deliveryOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('posNoDeliveryOrders')}
                  </p>
                ) : (
                  deliveryOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onSelect={() => onOrderSelect?.(order)}
                      onStatusUpdate={(status) => onStatusUpdate?.(order.id, status)}
                      t={t}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {showTakeout && (
        <Card className="flex-1 min-h-0">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                {t('posTakeout')}
              </CardTitle>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400">
                {takeoutOrders.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className={mode === 'takeout' ? 'h-full min-h-[280px]' : 'h-[200px]'}>
              <div className="space-y-2 pr-2">
                {takeoutOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t('posNoTakeoutOrders')}
                  </p>
                ) : (
                  takeoutOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onSelect={() => onOrderSelect?.(order)}
                      onStatusUpdate={(status) => onStatusUpdate?.(order.id, status)}
                      t={t}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
