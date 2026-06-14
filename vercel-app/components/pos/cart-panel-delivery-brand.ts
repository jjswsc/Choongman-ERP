import { cn } from '@/lib/utils'
import type { ReceiptDeliveryChannelContext } from '@/lib/pos-delivery-platform'

/** Grab 녹색 · 라인맨 하늘색 · 쇼피 주황 — 장바구니 칩/뱃지 */
export function deliveryAppBrandClasses(app: string | undefined) {
  switch (app) {
    case 'grab':
      return {
        bike: 'text-emerald-700 dark:text-emerald-300',
        chip: cn(
          'border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-950',
          'dark:border-emerald-500/35 dark:from-emerald-950/50 dark:to-emerald-900/60 dark:text-emerald-50',
          'shadow-sm ring-1 ring-emerald-700/10 dark:ring-emerald-400/15'
        ),
        badge:
          'border-emerald-600/35 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-500/40 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-950/70',
      }
    case 'lineman':
      return {
        bike: 'text-sky-600 dark:text-sky-300',
        chip: cn(
          'border-sky-600/40 bg-gradient-to-b from-sky-50 to-sky-100/90 text-sky-950',
          'dark:border-sky-500/35 dark:from-sky-950/50 dark:to-sky-900/60 dark:text-sky-50',
          'shadow-sm ring-1 ring-sky-700/10 dark:ring-sky-400/15'
        ),
        badge:
          'border-sky-600/35 bg-sky-50 text-sky-900 hover:bg-sky-100/90 dark:border-sky-500/40 dark:bg-sky-950/55 dark:text-sky-50 dark:hover:bg-sky-950/70',
      }
    case 'shopee':
      return {
        bike: 'text-orange-600 dark:text-orange-400',
        chip: cn(
          'border-orange-500/45 bg-gradient-to-b from-orange-50 to-orange-100/90 text-orange-950',
          'dark:border-orange-500/40 dark:from-orange-950/50 dark:to-orange-900/55 dark:text-orange-50',
          'shadow-sm ring-1 ring-orange-600/15 dark:ring-orange-400/20'
        ),
        badge:
          'border-orange-500/40 bg-orange-50 text-orange-950 hover:bg-orange-100/90 dark:border-orange-500/40 dark:bg-orange-950/55 dark:text-orange-50 dark:hover:bg-orange-950/70',
      }
    default:
      return {
        bike: 'text-emerald-700 dark:text-emerald-300',
        chip: cn(
          'border-emerald-600/40 bg-gradient-to-b from-emerald-50 to-emerald-100/90 text-emerald-950',
          'dark:border-emerald-500/35 dark:from-emerald-950/50 dark:to-emerald-900/60 dark:text-emerald-50',
          'shadow-sm ring-1 ring-emerald-700/10 dark:ring-emerald-400/15'
        ),
        badge:
          'border-emerald-600/35 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/90 dark:border-emerald-500/40 dark:bg-emerald-950/55 dark:text-emerald-50 dark:hover:bg-emerald-950/70',
      }
  }
}

export function cartPanelDeliveryChannelContext(params: {
  deliveryAppProp?: string
  deliveryOrderNoProp?: string
  paymentTableNameOverride?: string | null
  customerMemo?: string
  deliveryPaymentChannel?: string
}): ReceiptDeliveryChannelContext {
  const fallbackLabel = [
    params.deliveryAppProp,
    params.deliveryOrderNoProp?.trim() ? `#${params.deliveryOrderNoProp.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    deliveryAppCode: params.deliveryAppProp,
    deliveryPaymentChannel: params.deliveryPaymentChannel,
    tableName: params.paymentTableNameOverride ?? fallbackLabel,
    memo: String(params.customerMemo ?? '').trim(),
  }
}
