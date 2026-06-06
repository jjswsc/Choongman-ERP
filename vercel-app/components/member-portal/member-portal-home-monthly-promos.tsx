"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import {
  listMemberPortalHomeNewMenusForMonth,
  listMemberPortalHomePromosForMonth,
  MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB,
  MEMBER_PORTAL_HOME_PROMO_TARGET_TAB,
  shiftBangkokYearMonth,
  type MemberPortalContentItem,
} from "@/lib/member-portal-content"

type MemberPortalHomeContentMonthCarouselProps = {
  contentItems: MemberPortalContentItem[]
  lang: string
  t: (key: MemberPortalKey) => string
  onSelectItem: (item: MemberPortalContentItem) => void
  targetTab: string
  listForMonth: (
    items: MemberPortalContentItem[],
    yearMonth: string,
    monthRange: { startStr: string; endStr: string }
  ) => MemberPortalContentItem[]
  titleKey: MemberPortalKey
  emptyKey: MemberPortalKey
  thisMonthKey: MemberPortalKey
  headerIcon: LucideIcon
}

function formatPromoMonthLabel(yearMonth: string, lang: string): string {
  const [y, m] = yearMonth.split("-").map(Number)
  if (!y || !m) return yearMonth
  const date = new Date(Date.UTC(y, m - 1, 1))
  const locale = lang === "th" ? "th-TH" : lang === "ko" ? "ko-KR" : "en-US"
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "Asia/Bangkok" }).format(date)
}

export function MemberPortalHomeContentMonthCarousel({
  contentItems,
  lang,
  t,
  onSelectItem,
  targetTab: _targetTab,
  listForMonth,
  titleKey,
  emptyKey,
  thisMonthKey,
  headerIcon: HeaderIcon,
}: MemberPortalHomeContentMonthCarouselProps) {
  const [yearMonth, setYearMonth] = React.useState(() => getBangkokMonthRange().yearMonth)

  const monthRange = React.useMemo(() => getBangkokMonthRange(yearMonth), [yearMonth])
  const items = React.useMemo(
    () => listForMonth(contentItems, yearMonth, monthRange),
    [contentItems, yearMonth, monthRange, listForMonth]
  )

  const monthLabel = formatPromoMonthLabel(yearMonth, lang)
  const isCurrentMonth = yearMonth === getBangkokMonthRange().yearMonth

  return (
    <GlassCard soft className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <HeaderIcon className="h-4 w-4 text-amber-300/90" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-white">{t(titleKey)}</p>
            {isCurrentMonth ? (
              <p className="text-[11px] text-white/45">{t(thisMonthKey)}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, -1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/80 hover:bg-white/10"
            aria-label={t("homePromoPrevMonth")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-medium text-amber-100/90">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, 1))}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/80 hover:bg-white/10"
            aria-label={t("homePromoNextMonth")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-white/50">{t(emptyKey)}</p>
      ) : (
        <div className="-mx-0 overflow-x-auto px-3 pb-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-3">
            {items.map((item) => (
              <button
                key={item.contentKey}
                type="button"
                onClick={() => onSelectItem(item)}
                className="w-[min(88vw,17.5rem)] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 text-left transition hover:border-amber-300/25 hover:bg-black/40"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title || t(titleKey)}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-amber-900/40 to-black/50 px-4">
                    <p className="line-clamp-3 text-center text-sm font-semibold text-white/85">
                      {item.title || "—"}
                    </p>
                  </div>
                )}
                <div className="px-3 py-2.5">
                  <p className="line-clamp-2 text-sm font-medium text-white">{item.title || "—"}</p>
                  {item.body ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-white/50">{item.body}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-200/70">{t("homeFeatureTap")}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  )
}

type MemberPortalHomeMonthlyPromosProps = {
  contentItems: MemberPortalContentItem[]
  lang: string
  t: (key: MemberPortalKey) => string
  onSelectPromo: (item: MemberPortalContentItem) => void
}

export function MemberPortalHomeMonthlyPromos({
  contentItems,
  lang,
  t,
  onSelectPromo,
}: MemberPortalHomeMonthlyPromosProps) {
  return (
    <MemberPortalHomeContentMonthCarousel
      contentItems={contentItems}
      lang={lang}
      t={t}
      onSelectItem={onSelectPromo}
      targetTab={MEMBER_PORTAL_HOME_PROMO_TARGET_TAB}
      listForMonth={listMemberPortalHomePromosForMonth}
      titleKey="homePromoTitle"
      emptyKey="homePromoEmpty"
      thisMonthKey="homePromoThisMonth"
      headerIcon={Sparkles}
    />
  )
}

type MemberPortalHomeNewMenusProps = {
  contentItems: MemberPortalContentItem[]
  lang: string
  t: (key: MemberPortalKey) => string
  onSelectItem: (item: MemberPortalContentItem) => void
}

export function MemberPortalHomeNewMenus({ contentItems, lang, t, onSelectItem }: MemberPortalHomeNewMenusProps) {
  return (
    <MemberPortalHomeContentMonthCarousel
      contentItems={contentItems}
      lang={lang}
      t={t}
      onSelectItem={onSelectItem}
      targetTab={MEMBER_PORTAL_HOME_NEW_MENU_TARGET_TAB}
      listForMonth={listMemberPortalHomeNewMenusForMonth}
      titleKey="homeNewMenuTitle"
      emptyKey="homeNewMenuEmpty"
      thisMonthKey="homeNewMenuThisMonth"
      headerIcon={UtensilsCrossed}
    />
  )
}
