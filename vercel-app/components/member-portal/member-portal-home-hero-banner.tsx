"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import {
  listMemberPortalHomeNewMenusForMonth,
  listMemberPortalHomePromosForMonth,
  type MemberPortalContentItem,
  type MemberPortalHomePromoChannel,
} from "@/lib/member-portal-content"
import { MP_HOME_CARD_RADIUS, MP_HOME_HERO_HEIGHT } from "@/lib/member-portal-home-layout"

type HeroBannerCardProps = {
  item: MemberPortalContentItem
  fallbackTitle: string
  ctaLabel?: string
  badgeLabel?: string
  onSelect: () => void
  onCta?: () => void
}

/** 단일 프로모/신메뉴 히어로 배너 — 홈 "Choongman Super Deal" 사이즈 (가로형, 왼쪽 텍스트·오른쪽 음식) */
export function MemberPortalHeroBannerCard({
  item,
  fallbackTitle,
  ctaLabel,
  badgeLabel,
  onSelect,
  onCta,
}: HeroBannerCardProps) {
  return (
    <div
      className={`group relative w-full overflow-hidden ${MP_HOME_CARD_RADIUS} bg-[#261c12] shadow-[0_14px_34px_-12px_rgba(28,21,16,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 z-[1]"
        aria-label={item.title || fallbackTitle}
      />
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className={`${MP_HOME_HERO_HEIGHT} w-full object-cover object-right transition duration-500 group-hover:scale-[1.03]`}
        />
      ) : (
        <div className={`${MP_HOME_HERO_HEIGHT} w-full bg-gradient-to-br from-[#3d2a14] to-[#261c12]`} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#241a10]/96 via-[#241a10]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] flex max-w-[62%] flex-col justify-center px-4 py-3">
        {badgeLabel ? (
          <span className="mb-1.5 inline-flex w-fit items-center rounded-full bg-amber-500/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
            {badgeLabel}
          </span>
        ) : null}
        <p className="line-clamp-2 text-[1.3rem] font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
          {item.title || fallbackTitle}
        </p>
        {item.body ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/80">{item.body}</p>
        ) : null}
        {ctaLabel && onCta ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCta()
            }}
            className="pointer-events-auto mt-2.5 inline-flex h-9 w-fit items-center gap-0.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 px-4 text-xs font-bold text-white shadow-[0_6px_16px_-4px_rgba(217,119,6,0.7)] ring-1 ring-white/25 transition hover:from-amber-400 hover:to-amber-500 active:scale-95"
          >
            {ctaLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

type MemberPortalHomeHeroBannerProps = {
  contentItems: MemberPortalContentItem[]
  channel?: MemberPortalHomePromoChannel
  t: (key: MemberPortalKey) => string
  onOrder: () => void
  onSelectItem: (item: MemberPortalContentItem) => void
  showOrderButton?: boolean
}

export function MemberPortalHomeHeroBanner({
  contentItems,
  channel = "dine",
  t,
  onOrder,
  onSelectItem,
  showOrderButton = true,
}: MemberPortalHomeHeroBannerProps) {
  const promo = React.useMemo(() => {
    const monthRange = getBangkokMonthRange()
    const rows = listMemberPortalHomePromosForMonth(contentItems, monthRange.yearMonth, monthRange, channel)
    return rows[0] || null
  }, [contentItems, channel])

  if (!promo) return null

  return (
    <MemberPortalHeroBannerCard
      item={promo}
      fallbackTitle={t("homePromoTitle")}
      ctaLabel={showOrderButton ? t("homePromoOrderNow") : undefined}
      onSelect={() => onSelectItem(promo)}
      onCta={showOrderButton ? onOrder : undefined}
    />
  )
}

/** 주문 탭 신메뉴 — 프로모와 동일한 큰 히어로 배너로 노출 */
export function MemberPortalHomeNewMenuHeroes({
  contentItems,
  t,
  onOrder,
  onSelectItem,
  max = 4,
}: {
  contentItems: MemberPortalContentItem[]
  t: (key: MemberPortalKey) => string
  onOrder: () => void
  onSelectItem: (item: MemberPortalContentItem) => void
  max?: number
}) {
  const items = React.useMemo(() => {
    const monthRange = getBangkokMonthRange()
    return listMemberPortalHomeNewMenusForMonth(contentItems, monthRange.yearMonth, monthRange).slice(0, max)
  }, [contentItems, max])

  if (!items.length) return null

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MemberPortalHeroBannerCard
          key={item.contentKey}
          item={item}
          fallbackTitle={t("homeNewMenuTitle")}
          badgeLabel={t("homeNewMenuTitle")}
          ctaLabel={t("homePromoOrderNow")}
          onSelect={() => onSelectItem(item)}
          onCta={onOrder}
        />
      ))}
    </div>
  )
}
