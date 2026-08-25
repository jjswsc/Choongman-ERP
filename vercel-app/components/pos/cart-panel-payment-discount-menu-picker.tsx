'use client'

import { Check } from 'lucide-react'
import type { OrderItem } from '@/lib/pos-types'
import { cn, formatBahtNum } from '@/lib/utils'
import type { CartPanelMenuLineDiscountMode } from '@/components/pos/cart-panel-payment-modal-amount-card'

type PosPaymentDiscountMenuPickerProps = {
  cartItems: OrderItem[]
  lineDiscountModeByItemId: Record<string, CartPanelMenuLineDiscountMode>
  onLineDiscountModeChange: (itemId: string, nextMode: CartPanelMenuLineDiscountMode) => void
  t: (key: string) => string
}

export function PosPaymentDiscountMenuPicker({
  cartItems,
  lineDiscountModeByItemId,
  onLineDiscountModeChange,
  t,
}: PosPaymentDiscountMenuPickerProps) {
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  if (!cartItems.length) return null

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
          {t('posManualDiscountPickTitle')}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-200/80">
          {t('posManualDiscountPickHint')}
        </p>
      </div>
      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-0.5">
        {cartItems.map((item) => {
          const mode = lineDiscountModeByItemId[item.id] ?? 'none'
          const lineTotal = Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
          const locked = mode === 'service' || mode === 'cancel'
          const selected = mode === 'discount'
          return (
            <button
              key={item.id}
              type="button"
              disabled={locked}
              onClick={() => onLineDiscountModeChange(item.id, selected ? 'none' : 'discount')}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left touch-manipulation',
                selected
                  ? 'border-amber-500 bg-amber-100/90 dark:border-amber-400 dark:bg-amber-950/50'
                  : 'border-border/70 bg-background/80',
                locked && 'cursor-not-allowed opacity-55'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                  selected
                    ? 'border-amber-600 bg-amber-600 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950'
                    : 'border-muted-foreground/40 bg-background'
                )}
                aria-hidden
              >
                {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t('qty') || '수량'} {formatBahtNum(item.quantity)} · {formatBahtNum(lineTotal)} ฿
                  {locked
                    ? ` · ${
                        mode === 'service'
                          ? tr('posServiceHandled', '서비스처리')
                          : tr('posLineCancelledShort', '취소처리')
                      }`
                    : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
