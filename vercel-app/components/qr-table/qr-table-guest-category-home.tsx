'use client'

import * as React from 'react'
import { QR_GUEST_HOME_BANNER_HEIGHT_CLASS } from '@/lib/qr-table-guest-category-home'

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
  featuredCount: number
  newMenuCount: number
  categories: QrGuestCategoryHomeTile[]
  heroTitle: string
  newMenuTitle: string
  newMenuEmptyHint: string
  featuredEmptyHint: string
  qrOrderLabel: string
  onSelectFeatured: () => void
  onSelectNewMenu: () => void
  onSelectCategory: (key: string) => void
}) {
  const {
    brandLine,
    logoUrl,
    heroBannerUrl,
    newMenuBannerUrl,
    featuredCount,
    newMenuCount,
    categories,
    heroTitle,
    newMenuTitle,
    newMenuEmptyHint,
    featuredEmptyHint,
    qrOrderLabel,
    onSelectFeatured,
    onSelectNewMenu,
    onSelectCategory,
  } = props

  return (
    <section className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <style>{`
        @keyframes qr-home-banner-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.018); }
        }
        .qr-home-banner-motion {
          animation: qr-home-banner-breathe 3.8s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .qr-home-banner-motion { animation: none; }
        }
      `}</style>

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

      <div className="grid grid-cols-2 gap-2 px-3 pt-2">
        <button
          type="button"
          onClick={onSelectFeatured}
          className={`qr-home-banner-motion relative overflow-hidden rounded-2xl bg-stone-200 text-left shadow-sm touch-manipulation active:scale-[0.98] ${QR_GUEST_HOME_BANNER_HEIGHT_CLASS}`}
        >
          {heroBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroBannerUrl}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-200/80 via-stone-200 to-stone-300" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-1.5 left-2 right-2">
            <p className="line-clamp-2 text-[12px] font-black leading-snug text-white drop-shadow">{heroTitle}</p>
            <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-white/85">
              {featuredCount > 0 ? `${featuredCount}` : featuredEmptyHint}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onSelectNewMenu}
          className={`qr-home-banner-motion relative overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm touch-manipulation active:scale-[0.98] ${QR_GUEST_HOME_BANNER_HEIGHT_CLASS}`}
          style={{ animationDelay: '1.1s' }}
        >
          {newMenuBannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={newMenuBannerUrl}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-stone-50 to-amber-50" />
          )}
          {newMenuBannerUrl ? (
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          ) : null}
          <div className="absolute left-1.5 top-1.5 rounded-full bg-[var(--qr-brand,#b45309)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            NEW
          </div>
          <div className="absolute bottom-1.5 left-2 right-2">
            <p
              className={`line-clamp-2 text-[12px] font-black leading-snug drop-shadow ${
                newMenuBannerUrl ? 'text-white' : 'text-stone-800'
              }`}
            >
              {newMenuTitle}
            </p>
            <p
              className={`mt-0.5 line-clamp-1 text-[10px] font-medium ${
                newMenuBannerUrl ? 'text-white/85' : 'text-stone-500'
              }`}
            >
              {newMenuCount > 0 ? `${newMenuCount}` : newMenuEmptyHint}
            </p>
          </div>
        </button>
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
                loading="lazy"
                decoding="async"
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
