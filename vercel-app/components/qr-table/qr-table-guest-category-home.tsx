'use client'

import * as React from 'react'
import {
  QR_GUEST_HOME_HERO_HEIGHT_CLASS,
  QR_GUEST_HOME_NEW_MENU_HEIGHT_CLASS,
} from '@/lib/qr-table-guest-category-home'

export type QrGuestCategoryHomeTile = {
  key: string
  label: string
  imageUrl?: string
  count: number
}

export function QrTableGuestCategoryHome(props: {
  brandLine?: string
  logoUrl?: string
  heroBannerUrl?: string
  newMenuBannerUrl?: string
  categories: QrGuestCategoryHomeTile[]
  heroTitle: string
  newMenuTitle: string
  newMenuEmptyHint: string
  qrOrderLabel: string
  onSelectCategory: (key: string) => void
}) {
  const {
    brandLine,
    logoUrl,
    heroBannerUrl,
    newMenuBannerUrl,
    categories,
    heroTitle,
    newMenuTitle,
    newMenuEmptyHint,
    qrOrderLabel,
    onSelectCategory,
  } = props

  return (
    <section className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 border-b border-stone-100 bg-white px-3 py-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover bg-stone-100" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--qr-brand,#b45309)] text-[11px] font-black text-white">
            CM
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold leading-tight text-stone-900">
            {brandLine || 'CHOONGMAN CHICKEN'}
          </p>
          <p className="truncate text-[11px] text-stone-500">{qrOrderLabel}</p>
        </div>
      </div>

      <div className="space-y-2 px-3 pt-2">
        <div
          className={`relative overflow-hidden rounded-2xl bg-stone-200 shadow-sm ${QR_GUEST_HOME_HERO_HEIGHT_CLASS}`}
        >
          {heroBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroBannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-stone-300 via-stone-200 to-amber-100" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <p className="absolute bottom-2 left-3 right-3 text-[15px] font-black leading-snug text-white drop-shadow">
            {heroTitle}
          </p>
        </div>

        <div
          className={`relative overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ${QR_GUEST_HOME_NEW_MENU_HEIGHT_CLASS}`}
        >
          {newMenuBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={newMenuBannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-stone-50 px-4 text-center">
              <p className="text-[13px] font-bold text-stone-800">{newMenuTitle}</p>
              <p className="text-[11px] text-stone-500">{newMenuEmptyHint}</p>
            </div>
          )}
          {newMenuBannerUrl ? (
            <div className="absolute left-2 top-2 rounded-full bg-[var(--qr-brand,#b45309)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              NEW
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5 px-3">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelectCategory(c.key)}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1.5 py-2.5 text-center shadow-sm ring-1 ring-stone-100 touch-manipulation active:scale-[0.98]"
          >
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.imageUrl}
                alt=""
                className="h-[4.25rem] w-[4.25rem] rounded-full object-cover bg-stone-100 ring-2 ring-stone-100"
              />
            ) : (
              <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-stone-100 text-lg font-black text-stone-400">
                {(c.label || '?').slice(0, 1)}
              </div>
            )}
            <span className="line-clamp-2 min-h-[2.25rem] text-[11px] font-semibold leading-tight text-stone-800">
              {c.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
