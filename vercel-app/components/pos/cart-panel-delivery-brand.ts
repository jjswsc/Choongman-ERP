import { cn } from '@/lib/utils'
import type { ReceiptDeliveryChannelContext } from '@/lib/pos-delivery-platform'

/** Grab #00B14F · LINE MAN #06C755 · Shopee #EE4D2D — 장바구니 칩/뱃지 */
export function deliveryAppBrandClasses(app: string | undefined) {
  switch (app) {
    case 'grab':
      return {
        bike: 'text-[#008f41] dark:text-[#5fd98a]',
        chip: cn(
          'border-[#00B14F]/40 bg-gradient-to-b from-[#e8f8ef] to-[#d4f0e0]/90 text-[#004d22]',
          'dark:border-[#00B14F]/35 dark:from-[#003318]/50 dark:to-[#004d22]/60 dark:text-[#e8f8ef]',
          'shadow-sm ring-1 ring-[#00B14F]/10 dark:ring-[#00B14F]/15'
        ),
        badge:
          'border-[#00B14F]/35 bg-[#e8f8ef] text-[#004d22] hover:bg-[#d4f0e0]/90 dark:border-[#00B14F]/40 dark:bg-[#003318]/55 dark:text-[#e8f8ef] dark:hover:bg-[#004d22]/70',
      }
    case 'lineman':
      return {
        bike: 'text-[#049a44] dark:text-[#7ee99a]',
        chip: cn(
          'border-[#06C755]/40 bg-gradient-to-b from-[#eafff0] to-[#d4fadc]/90 text-[#024a18]',
          'dark:border-[#06C755]/35 dark:from-[#023014]/50 dark:to-[#024a18]/60 dark:text-[#eafff0]',
          'shadow-sm ring-1 ring-[#06C755]/10 dark:ring-[#06C755]/15'
        ),
        badge:
          'border-[#06C755]/35 bg-[#eafff0] text-[#024a18] hover:bg-[#d4fadc]/90 dark:border-[#06C755]/40 dark:bg-[#023014]/55 dark:text-[#eafff0] dark:hover:bg-[#024a18]/70',
      }
    case 'shopee':
      return {
        bike: 'text-[#d73211] dark:text-[#ff8a6a]',
        chip: cn(
          'border-[#EE4D2D]/45 bg-gradient-to-b from-[#fff0eb] to-[#ffe0d6]/90 text-[#7a1a08]',
          'dark:border-[#EE4D2D]/40 dark:from-[#4a1508]/50 dark:to-[#7a1a08]/55 dark:text-[#fff0eb]',
          'shadow-sm ring-1 ring-[#EE4D2D]/15 dark:ring-[#EE4D2D]/20'
        ),
        badge:
          'border-[#EE4D2D]/40 bg-[#fff0eb] text-[#7a1a08] hover:bg-[#ffe0d6]/90 dark:border-[#EE4D2D]/40 dark:bg-[#4a1508]/55 dark:text-[#fff0eb] dark:hover:bg-[#7a1a08]/70',
      }
    default:
      return {
        bike: 'text-[#008f41] dark:text-[#5fd98a]',
        chip: cn(
          'border-[#00B14F]/40 bg-gradient-to-b from-[#e8f8ef] to-[#d4f0e0]/90 text-[#004d22]',
          'dark:border-[#00B14F]/35 dark:from-[#003318]/50 dark:to-[#004d22]/60 dark:text-[#e8f8ef]',
          'shadow-sm ring-1 ring-[#00B14F]/10 dark:ring-[#00B14F]/15'
        ),
        badge:
          'border-[#00B14F]/35 bg-[#e8f8ef] text-[#004d22] hover:bg-[#d4f0e0]/90 dark:border-[#00B14F]/40 dark:bg-[#003318]/55 dark:text-[#e8f8ef] dark:hover:bg-[#004d22]/70',
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
