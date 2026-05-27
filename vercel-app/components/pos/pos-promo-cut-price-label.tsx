'use client'

import { resolvePromoCutPrice } from '@/lib/pos-promo-cut-price'
import { cn, formatBahtNum } from '@/lib/utils'

type PosPromoCutPriceLabelProps = {
  salePrice: number
  regularPrice: number | null | undefined
  className?: string
  saleClassName?: string
  regularClassName?: string
}

export function PosPromoCutPriceLabel({
  salePrice,
  regularPrice,
  className,
  saleClassName = 'font-bold text-amber-600',
  regularClassName = 'text-[10px] font-normal text-slate-400 line-through tabular-nums',
}: PosPromoCutPriceLabelProps) {
  const cut = resolvePromoCutPrice({
    salePrice,
    regularPrice: regularPrice ?? 0,
  })

  if (!cut.showCutPrice) {
    return (
      <span className={cn(saleClassName, className)}>
        {cut.salePrice > 0 ? `${formatBahtNum(cut.salePrice)} ฿` : '-'}
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1 gap-y-0', className)}>
      <span className={saleClassName}>{formatBahtNum(cut.salePrice)} ฿</span>
      <span className={regularClassName}>{formatBahtNum(cut.regularPrice)}</span>
    </span>
  )
}
