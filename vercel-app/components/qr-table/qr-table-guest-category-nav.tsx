'use client'

import * as React from 'react'

type CategoryTone = {
  /** 비활성 아이콘·라벨 */
  idle: string
  /** 활성 배경 tint */
  activeBg: string
  /** 활성 텍스트·언더라인 (브랜드와 조화되는 카테고리 컬러) */
  active: string
}

function categoryTone(name: string): CategoryTone {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (key.includes('promo') || key.includes('set') || key.includes('โปร') || key.includes('세트') || key.includes('프로')) {
    return { idle: 'text-amber-500', activeBg: 'bg-amber-500/12', active: 'text-amber-600' }
  }
  if (key.includes('chicken') || key.includes('ไก่') || key.includes('치킨')) {
    return { idle: 'text-orange-500', activeBg: 'bg-orange-500/12', active: 'text-orange-600' }
  }
  if (
    key.includes('korean') ||
    key.includes('한식') ||
    key.includes('อาหารเกาหลี') ||
    key.includes('bibimbap') ||
    key.includes('rice')
  ) {
    return { idle: 'text-rose-500', activeBg: 'bg-rose-500/12', active: 'text-rose-600' }
  }
  if (
    key.includes('side') ||
    key.includes('사이드') ||
    key.includes('ของว่าง') ||
    key.includes('snack') ||
    key.includes('fries')
  ) {
    return { idle: 'text-emerald-500', activeBg: 'bg-emerald-500/12', active: 'text-emerald-600' }
  }
  if (
    key.includes('drink') ||
    key.includes('beverage') ||
    key.includes('음료') ||
    key.includes('เครื่องดื่ม') ||
    key.includes('cola')
  ) {
    return { idle: 'text-sky-500', activeBg: 'bg-sky-500/12', active: 'text-sky-600' }
  }
  return {
    idle: 'text-stone-500',
    activeBg: 'bg-[var(--qr-brand,#ea580c)]/12',
    active: 'text-[var(--qr-brand,#ea580c)]',
  }
}

function underlineClass(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (key.includes('promo') || key.includes('set') || key.includes('โปร') || key.includes('세트') || key.includes('프로')) {
    return 'bg-amber-500'
  }
  if (key.includes('chicken') || key.includes('ไก่') || key.includes('치킨')) return 'bg-orange-500'
  if (
    key.includes('korean') ||
    key.includes('한식') ||
    key.includes('อาหารเกาหลี') ||
    key.includes('bibimbap') ||
    key.includes('rice')
  ) {
    return 'bg-rose-500'
  }
  if (
    key.includes('side') ||
    key.includes('사이드') ||
    key.includes('ของว่าง') ||
    key.includes('snack') ||
    key.includes('fries')
  ) {
    return 'bg-emerald-500'
  }
  if (
    key.includes('drink') ||
    key.includes('beverage') ||
    key.includes('음료') ||
    key.includes('เครื่องดื่ม') ||
    key.includes('cola')
  ) {
    return 'bg-sky-500'
  }
  return 'bg-[var(--qr-brand,#ea580c)]'
}

/** POS category_main 원문 → 하단 탭 아이콘 (없으면 텍스트만) */
function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const cn = className || 'h-5 w-5'
  if (key.includes('chicken') || key.includes('ไก่') || key.includes('치킨')) {
    // 닭다리 (참고 앱과 유사)
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M14.5 3.5c2.2-.4 4.2 1.2 4.4 3.4.1 1.2-.3 2.3-1.1 3.1l-1.6 1.6c-.3.3-.4.7-.3 1.1l.6 2.2c.2.6-.1 1.2-.7 1.5l-1.3.6c-.5.2-1.1 0-1.4-.5l-1.2-1.8c-.2-.3-.5-.5-.9-.5H9.2c-.6 0-1.1-.4-1.2-1L7.5 11c-.2-.8.2-1.6.9-2l2.4-1.3c.4-.2.7-.5.8-.9l.4-1.5c.3-1.2 1.4-2 2.5-1.8Z"
          fill="currentColor"
          opacity="0.92"
        />
        <path
          d="M8.2 14.2c1.2 1.4 2.6 2.6 4.2 3.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="7.2" cy="17.8" r="2.2" fill="currentColor" opacity="0.85" />
        <circle cx="5.4" cy="19.6" r="1.35" fill="currentColor" opacity="0.7" />
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
    // 돌솥·비빔밥
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <ellipse cx="12" cy="17.5" rx="7.5" ry="2.8" fill="currentColor" opacity="0.25" />
        <path
          d="M5 16.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7.5 15.2c.8-2.2 2.4-3.5 4.5-3.5s3.7 1.3 4.5 3.5"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="10.2" cy="13.2" r="1" fill="currentColor" opacity="0.55" />
        <circle cx="13.5" cy="12.8" r="0.85" fill="currentColor" opacity="0.45" />
        <path d="M12 9.2V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
    // 감자튀김
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 20h8l1.2-8.5H6.8L8 20Z"
          fill="currentColor"
          opacity="0.9"
        />
        <path d="M7.2 11.5h9.6l-.4-1.2H7.6l-.4 1.2Z" fill="currentColor" opacity="0.75" />
        <path d="M9.2 10.2V5.8m2.8 4.4V4.5m2.8 5.7V6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
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
    // 아이스 음료
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8.2 7.5h7.6l-1.1 12.2a1.6 1.6 0 0 1-1.6 1.4H10.9a1.6 1.6 0 0 1-1.6-1.4L8.2 7.5Z"
          fill="currentColor"
          opacity="0.88"
        />
        <path d="M9 4.8h6v2.7H9V4.8Z" fill="currentColor" opacity="0.7" />
        <path d="M10.2 12.2h3.6M10.5 15h3" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
        <circle cx="11" cy="10.2" r="0.7" fill="white" opacity="0.45" />
        <circle cx="13.2" cy="11" r="0.55" fill="white" opacity="0.4" />
      </svg>
    )
  }
  if (key.includes('promo') || key.includes('set') || key.includes('โปร') || key.includes('세트') || key.includes('프로')) {
    // 프로모션 별
    return (
      <svg className={cn} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3.2l2.35 4.76 5.25.76-3.8 3.7.9 5.24L12 15.9l-4.7 2.46.9-5.24-3.8-3.7 5.25-.76L12 3.2Z"
          fill="currentColor"
          opacity="0.92"
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
    <nav className="border-t border-stone-200/90 bg-white" aria-label={ariaLabel}>
      <div className="flex gap-0.5 overflow-x-auto overscroll-x-contain px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const active = selected === c
          const count = counts?.get(c)
          const tone = categoryTone(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className={`flex min-h-14 min-w-[4.75rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 touch-manipulation transition-colors ${
                active ? `${tone.activeBg} ${tone.active}` : `${tone.idle} active:bg-stone-50`
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <CategoryIcon name={c} className="h-6 w-6 shrink-0" />
              <span
                className={`max-w-[6rem] truncate text-[11px] leading-tight ${
                  active ? 'font-bold' : 'font-semibold'
                }`}
              >
                {labelFor(c)}
              </span>
              {active ? (
                <span className={`mt-0.5 h-0.5 w-8 rounded-full ${underlineClass(c)}`} />
              ) : count != null && count > 0 ? (
                <span className="text-[10px] tabular-nums text-stone-400">{count}</span>
              ) : (
                <span className="h-0.5 w-8" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
