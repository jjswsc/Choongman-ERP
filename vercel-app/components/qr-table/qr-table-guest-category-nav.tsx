'use client'

import * as React from 'react'

/** POS category_main 원문 → 하단 탭 아이콘 (없으면 텍스트만) */
function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const cn = className || 'h-5 w-5'
  if (
    key.includes('chicken') ||
    key.includes('ไก่') ||
    key.includes('치킨')
  ) {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8.5 14c-1.5-1-2-3-1.5-5 .8-3 3.5-5 6.5-4.5 2 .3 3.5 1.5 4.2 3.2.4 1 .3 2.2-.3 3.2L15 15.5V20a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-2.5L8.5 14Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M12 9.5v.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    )
  }
  if (
    key.includes('korean') ||
    key.includes('한식') ||
    key.includes('อาหารเกาหลี') ||
    key.includes('bibimbap') ||
    key.includes('rice')
  ) {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <ellipse cx="12" cy="16" rx="7" ry="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 16V11c0-2.5 3-4.5 7-4.5s7 2 7 4.5v5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 10.5c.5 1.5 1.5 2.5 3 2.5s2.5-1 3-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (
    key.includes('side') ||
    key.includes('사이드') ||
    key.includes('ของว่าง') ||
    key.includes('snack') ||
    key.includes('fries')
  ) {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 20h10l1-9H6l1 9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 11V7m3 4V5m3 6V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (
    key.includes('drink') ||
    key.includes('beverage') ||
    key.includes('음료') ||
    key.includes('เครื่องดื่ม') ||
    key.includes('cola')
  ) {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 7h8l-1 13H9L8 7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 4h6v3H9V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (key.includes('promo') || key.includes('set') || key.includes('โปร') || key.includes('세트')) {
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5L12 14.8 7.5 16.7l.9-5L4.8 8.2l5-.7L12 3Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function QrTableGuestCategoryNav(props: {
  categories: string[]
  selected: string
  counts?: Map<string, number>
  labelFor: (raw: string) => string
  ariaLabel: string
  onSelect: (category: string) => void
}) {
  const { categories, selected, counts, labelFor, ariaLabel, onSelect } = props
  if (categories.length === 0) return null

  return (
    <nav
      className="border-t border-stone-200 bg-white"
      aria-label={ariaLabel}
    >
      <div className="flex gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const active = selected === c
          const count = counts?.get(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={`flex min-h-14 min-w-[5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 touch-manipulation transition-colors ${
                active
                  ? 'bg-[var(--qr-brand,#b45309)]/12 text-[var(--qr-brand,#b45309)]'
                  : 'text-stone-600 active:bg-stone-100'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <CategoryIcon name={c} className="h-6 w-6 shrink-0" />
              <span className="max-w-[6rem] truncate text-[11px] font-bold leading-tight">
                {labelFor(c)}
              </span>
              {active ? (
                <span className="mt-0.5 h-0.5 w-7 rounded-full bg-[var(--qr-brand,#b45309)]" />
              ) : count != null && count > 0 ? (
                <span className="text-[10px] tabular-nums text-stone-400">{count}</span>
              ) : (
                <span className="h-0.5 w-7" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
