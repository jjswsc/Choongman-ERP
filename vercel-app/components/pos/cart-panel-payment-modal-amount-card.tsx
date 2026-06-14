'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import {
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Receipt,
  Sparkles,
} from 'lucide-react'
import type { OrderItem } from '@/lib/pos-types'
import { cn, formatBahtNum } from '@/lib/utils'
import {
  resolveReceiptSubtotalPrintAmount,
  resolveReceiptVatPrintAmount,
  type PosPricingResult,
} from '@/lib/pos-pricing'

export type CartPanelMenuLineDiscountMode = 'none' | 'discount' | 'service' | 'cancel'

export type PosPaymentModalAmountCardProps = {
  subtotal: number
  discount: number
  pricing: PosPricingResult
  total: number
  /** i18n 키 (없으면 posPaymentTotalLabel) */
  totalLabelKey?: string
  cartItems?: OrderItem[]
  lineDiscountModeByItemId?: Record<string, CartPanelMenuLineDiscountMode>
  onLineDiscountModeChange?: (itemId: string, nextMode: CartPanelMenuLineDiscountMode) => void
  onDiscountLineSelected?: () => void
  t: (key: string) => string
}

/** POS 결제 모달 — 금액 요약(소계·할인·수수료·합계) */
export function PosPaymentModalAmountCard({
  subtotal,
  discount,
  pricing,
  total,
  totalLabelKey,
  cartItems,
  lineDiscountModeByItemId,
  onLineDiscountModeChange,
  onDiscountLineSelected,
  t,
}: PosPaymentModalAmountCardProps) {
  const [showLineDiscountPicker, setShowLineDiscountPicker] = useState(false)
  const tr = (key: string, fallback: string) => {
    const v = t(key)
    return !v || v === key ? fallback : v
  }
  const totalLineLabel = totalLabelKey ? t(totalLabelKey) : (t('posPaymentTotalLabel') || '결제 금액')
  const hasLineDiscountPicker = !!onLineDiscountModeChange && !!cartItems?.length
  const subtotalDisplay = resolveReceiptSubtotalPrintAmount({
    subtotal,
    vatFeeMode: pricing.vatFeeMode,
    receiptExclusiveSubtotalDisplay: pricing.receiptExclusiveSubtotalDisplay,
    receiptTaxableGrossForDisplay: pricing.baseTotal,
  })
  const vatDisplay = resolveReceiptVatPrintAmount({
    vatFeeAmt: pricing.vatFeeAmt,
    receiptVatDisplayAmt: pricing.receiptVatDisplayAmt,
  })
  const feeRows: { show: boolean; label: ReactNode; value: string }[] = [
    {
      show: vatDisplay > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posVatLabel') || '부가세'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.vatFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.vatFeeMode === 'separate' ? '+' : ''}${formatBahtNum(vatDisplay)} ฿`,
    },
    {
      show: pricing.serviceFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posServiceFee') || '서비스비'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.serviceFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.serviceFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.serviceFeeAmt)} ฿`,
    },
    {
      show: pricing.cardFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posCardFee') || '카드비'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.cardFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.cardFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.cardFeeAmt)} ฿`,
    },
    {
      show: pricing.otherFeeAmt > 0,
      label: (
        <span className="text-muted-foreground">
          {t('posOtherFee') || '기타'}{' '}
          <span className="text-[11px] opacity-80">
            ({pricing.otherFeeMode === 'included' ? (t('posFeeModeIncluded') || '포함') : (t('posFeeModeSeparate') || '별도')})
          </span>
        </span>
      ),
      value: `${pricing.otherFeeMode === 'separate' ? '+' : ''}${formatBahtNum(pricing.otherFeeAmt)} ฿`,
    },
  ]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-muted/45 via-muted/25 to-background/95 p-3 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="flex gap-2.5">
        <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary shadow-inner">
            <Receipt className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.25} />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-0">
          <div className="flex items-baseline justify-between gap-2 border-b border-border/50 pb-1 text-sm leading-tight">
            <span className="text-muted-foreground">{t('posSubtotal')}</span>
            <span className="shrink-0 tabular-nums font-semibold text-foreground">{formatBahtNum(subtotalDisplay)} ฿</span>
          </div>
          {hasLineDiscountPicker && (
            <Collapsible open={showLineDiscountPicker} onOpenChange={setShowLineDiscountPicker}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-8 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span className="mr-1">{tr('posMenuLineDiscountToggle', '메뉴별 할인/서비스/취소')}</span>
                  {showLineDiscountPicker ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {cartItems?.map((item) => {
                    const mode = lineDiscountModeByItemId?.[item.id] ?? 'none'
                    const lineTotal = Math.max(0, Number(item.price) || 0) * Math.max(0, Number(item.quantity) || 0)
                    return (
                      <div key={item.id} className="rounded-xl border border-border/60 bg-background/70 p-2">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('qty') || '수량'} {formatBahtNum(item.quantity)} · {formatBahtNum(lineTotal)} ฿
                            </p>
                          </div>
                          {mode !== 'none' ? (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {mode === 'service'
                                ? tr('posServiceHandled', '서비스처리')
                                : mode === 'cancel'
                                  ? tr('posLineCancelledShort', '취소처리')
                                  : tr('posDiscountApplied', '할인적용')}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'discount' ? 'default' : 'outline'}
                            className="h-7 rounded-lg text-[11px]"
                            onClick={() => {
                              const nextMode: CartPanelMenuLineDiscountMode = mode === 'discount' ? 'none' : 'discount'
                              onLineDiscountModeChange?.(item.id, nextMode)
                              if (nextMode === 'discount') onDiscountLineSelected?.()
                            }}
                          >
                            {tr('posDiscountApplied', '할인적용')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'service' ? 'default' : 'outline'}
                            className={cn(
                              'h-7 rounded-lg text-[11px]',
                              mode === 'service'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                            )}
                            onClick={() => onLineDiscountModeChange?.(item.id, mode === 'service' ? 'none' : 'service')}
                          >
                            {tr('posServiceHandled', '서비스처리')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={mode === 'cancel' ? 'destructive' : 'outline'}
                            className={cn(
                              'h-7 rounded-lg text-[11px]',
                              mode === 'cancel'
                                ? ''
                                : 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30'
                            )}
                            onClick={() => onLineDiscountModeChange?.(item.id, mode === 'cancel' ? 'none' : 'cancel')}
                          >
                            {tr('posLineCancelledShort', '취소처리')}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {discount > 0 && (
            <div className="flex items-baseline justify-between gap-2 py-1 text-[13px] leading-tight">
              <span className="flex min-w-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-3 w-3 shrink-0 opacity-80" />
                {t('posDiscount')}
              </span>
              <span className="shrink-0 tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                −{formatBahtNum(discount)} ฿
              </span>
            </div>
          )}
          {feeRows.some((r) => r.show) && (
            <>
              <Separator className="my-1 bg-border/60" />
              <div className="space-y-0">
                {feeRows
                  .filter((r) => r.show)
                  .map((row, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 py-1 text-[12px] leading-tight">
                      <div className="min-w-0">{row.label}</div>
                      <span className="shrink-0 tabular-nums text-foreground/90">{row.value}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
          <Separator className="my-1.5 bg-border/70" />
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-primary/8 px-2 py-2 dark:bg-primary/15">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
              <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-primary" />
              {totalLineLabel}
            </span>
            <span className="shrink-0 text-base font-bold tabular-nums tracking-tight text-primary">{formatBahtNum(total)} ฿</span>
          </div>
        </div>
      </div>
    </div>
  )
}
