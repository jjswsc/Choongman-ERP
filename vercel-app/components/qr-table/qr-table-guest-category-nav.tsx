'use client'

import { QrGuestCategoryCircle } from '@/components/qr-table/qr-guest-category-circle'
import { QrTableGuestScrollRow } from '@/components/qr-table/qr-table-guest-scroll-row'

export function QrTableGuestCategoryNav(props: {
  categories: string[]
  selected: string
  counts?: Map<string, number>
  /** 카테고리 홈 타일과 같은 원형 사진 URL. 없으면 기본 그림. */
  imageFor?: (raw: string) => string
  labelFor: (raw: string) => string
  ariaLabel: string
  scrollPrevLabel: string
  scrollNextLabel: string
  onSelect: (category: string) => void
}) {
  const {
    categories,
    selected,
    counts,
    imageFor,
    labelFor,
    ariaLabel,
    scrollPrevLabel,
    scrollNextLabel,
    onSelect,
  } = props
  if (categories.length === 0) return null

  return (
    <nav className="border-t border-stone-200/90 bg-white" aria-label={ariaLabel}>
      <QrTableGuestScrollRow
        scrollerClassName="flex gap-0.5 overflow-x-auto overscroll-x-contain px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        prevLabel={scrollPrevLabel}
        nextLabel={scrollNextLabel}
        nudgeHintKey="mainCategoryNav"
      >
        {categories.map((c) => {
          const active = selected === c
          const count = counts?.get(c)
          const label = labelFor(c)
          const imageUrl = String(imageFor?.(c) || '').trim()
          const ring = active
            ? 'ring-2 ring-[var(--qr-brand,#b45309)]'
            : 'ring-1 ring-stone-200'
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={`flex min-h-[5.25rem] min-w-[4.75rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 touch-manipulation transition-colors ${
                active
                  ? 'bg-[var(--qr-brand,#b45309)]/10 text-[var(--qr-brand,#b45309)]'
                  : 'text-stone-600 active:bg-stone-50'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <QrGuestCategoryCircle src={imageUrl} className={`h-12 w-12 shrink-0 ${ring}`} />
              <span
                className={`max-w-[6rem] truncate text-[11px] leading-tight ${
                  active ? 'font-bold' : 'font-semibold'
                }`}
              >
                {label}
              </span>
              {active ? (
                <span className="mt-0.5 h-0.5 w-8 rounded-full bg-[var(--qr-brand,#b45309)]" />
              ) : count != null && count > 0 ? (
                <span className="text-[10px] tabular-nums text-stone-400">{count}</span>
              ) : (
                <span className="h-0.5 w-8" />
              )}
            </button>
          )
        })}
      </QrTableGuestScrollRow>
    </nav>
  )
}
