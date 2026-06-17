"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import {
  listMemberPortalHomePromosForMonth,
  type MemberPortalContentItem,
  type MemberPortalHomePromoChannel,
} from "@/lib/member-portal-content"
import { MP_HOME_CARD_RADIUS, MP_HOME_HERO_HEIGHT } from "@/lib/member-portal-home-layout"

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
    <div
      className={`group relative w-full overflow-hidden ${MP_HOME_CARD_RADIUS} bg-[#261c12] shadow-[0_8px_24px_rgba(28,21,16,0.14)]`}
    >
      <button
        type="button"
        onClick={() => onSelectItem(promo)}
        className="absolute inset-0 z-[1]"
        aria-label={promo.title || t("homePromoTitle")}
      />
      {promo.imageUrl ? (
        <img
          src={promo.imageUrl}
          alt=""
          className={`${MP_HOME_HERO_HEIGHT} w-full object-cover object-right transition duration-500 group-hover:scale-[1.02]`}
        />
      ) : (
        <div className={`${MP_HOME_HERO_HEIGHT} w-full bg-gradient-to-br from-[#3d2a14] to-[#261c12]`} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#261c12]/95 via-[#261c12]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] flex max-w-[58%] flex-col justify-center px-4 py-3">
        <p className="line-clamp-2 text-[1.35rem] font-bold leading-tight tracking-tight text-white">
          {promo.title || t("homePromoTitle")}
        </p>
        {promo.body ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/75">{promo.body}</p>
        ) : null}
        {showOrderButton ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOrder()
            }}
            className="pointer-events-auto mt-2.5 inline-flex h-9 w-fit items-center gap-0.5 rounded-full bg-amber-500 px-4 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(245,158,11,0.35)] transition hover:bg-amber-400"
          >
            {t("homePromoOrderNow")}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
