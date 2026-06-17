"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import { MP_CARD_TEXT_MUTED, MP_CARD_TEXT_PRIMARY, MP_CARD_TEXT_SECONDARY, MP_CARD_TEXT_SUBTLE } from "@/lib/member-portal-design"
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

type HomeContentAccent = "promo" | "newMenu"

const HOME_CONTENT_ACCENT: Record<
  HomeContentAccent,
  { icon: string; badge: string; stripe: string; cardHover: string }
> = {
  promo: {
    icon: "text-amber-700",
    badge: "border-amber-400/30 bg-amber-50 text-amber-900",
    stripe: "from-amber-300/75 via-amber-400/35 to-transparent",
    cardHover: "hover:border-amber-300/30",
  },
  newMenu: {
    icon: "text-emerald-700",
    badge: "border-emerald-400/30 bg-emerald-50 text-emerald-900",
    stripe: "from-emerald-300/75 via-emerald-400/35 to-transparent",
    cardHover: "hover:border-emerald-300/30",
  },
}

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
  accent: HomeContentAccent
}

function formatCompactMonthLabel(yearMonth: string, lang: string): string {
  const [y, m] = yearMonth.split("-").map(Number)
  if (!y || !m) return yearMonth
  const date = new Date(Date.UTC(y, m - 1, 1))
  const locale = lang === "th" ? "th-TH" : lang === "ko" ? "ko-KR" : "en-US"
  const currentYear = Number(getBangkokMonthRange().yearMonth.split("-")[0])
  if (lang === "ko") {
    return y === currentYear ? `${m}월` : `${y}년 ${m}월`
  }
  return new Intl.DateTimeFormat(locale, {
    year: y === currentYear ? undefined : "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(date)
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
  accent,
}: MemberPortalHomeContentMonthCarouselProps) {
  const [yearMonth, setYearMonth] = React.useState(() => getBangkokMonthRange().yearMonth)
  const accentStyle = HOME_CONTENT_ACCENT[accent]

  const monthRange = React.useMemo(() => getBangkokMonthRange(yearMonth), [yearMonth])
  const items = React.useMemo(
    () => listForMonth(contentItems, yearMonth, monthRange),
    [contentItems, yearMonth, monthRange, listForMonth]
  )

  const monthLabel = formatCompactMonthLabel(yearMonth, lang)
  const isCurrentMonth = yearMonth === getBangkokMonthRange().yearMonth

  return (
    <GlassCard soft className="overflow-hidden p-0">
      <div className="relative flex items-center justify-between gap-2.5 px-3 py-2">
        <span
          className={`pointer-events-none absolute inset-y-1.5 left-0 w-px bg-gradient-to-b ${accentStyle.stripe}`}
          aria-hidden
        />
        <div className="flex min-w-0 items-center gap-2 pl-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${accentStyle.badge}`}
          >
            <HeaderIcon className={`h-3 w-3 ${accentStyle.icon}`} aria-hidden />
          </span>
          <p className={`truncate text-[13px] font-semibold tracking-tight ${MP_CARD_TEXT_PRIMARY}`}>{t(titleKey)}</p>
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] p-0.5">
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, -1))}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={t("homePromoPrevMonth")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span
            className="inline-flex min-w-[4.25rem] items-center justify-center gap-1 px-1.5 text-[11px] font-medium tabular-nums text-white/80"
            title={isCurrentMonth ? t(thisMonthKey) : monthLabel}
          >
            {isCurrentMonth ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
            ) : null}
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, 1))}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={t("homePromoNextMonth")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-3 pb-5 pt-1 text-center text-xs text-white/45">{t(emptyKey)}</p>
      ) : (
        <div className="-mx-0 overflow-x-auto px-2.5 pb-2.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2.5">
            {items.map((item) => (
              <button
                key={item.contentKey}
                type="button"
                onClick={() => onSelectItem(item)}
                className={`w-[min(84vw,16.5rem)] shrink-0 overflow-hidden rounded-xl border border-white/[0.09] bg-black/25 text-left transition hover:bg-black/35 ${accentStyle.cardHover}`}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title || t(titleKey)}
                    className="aspect-[16/10] w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-white/[0.06] to-black/50 px-3">
                    <p className="line-clamp-3 text-center text-xs font-semibold text-white/85">
                      {item.title || "—"}
                    </p>
                  </div>
                )}
                <div className="px-2.5 py-2">
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">
                    {item.title || "—"}
                  </p>
                  {item.body ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-white/45">{item.body}</p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-white/40">{t("homeFeatureTap")}</p>
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
      accent="promo"
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
      accent="newMenu"
    />
  )
}

type HomeContentTab = "promo" | "newMenu"

const HOME_CONTENT_TAB_CONFIG: Record<
  HomeContentTab,
  {
    titleKey: MemberPortalKey
    emptyKey: MemberPortalKey
    thisMonthKey: MemberPortalKey
    headerIcon: LucideIcon
    accent: HomeContentAccent
    listForMonth: MemberPortalHomeContentMonthCarouselProps["listForMonth"]
  }
> = {
  promo: {
    titleKey: "homePromoTitle",
    emptyKey: "homePromoEmpty",
    thisMonthKey: "homePromoThisMonth",
    headerIcon: Sparkles,
    accent: "promo",
    listForMonth: listMemberPortalHomePromosForMonth,
  },
  newMenu: {
    titleKey: "homeNewMenuTitle",
    emptyKey: "homeNewMenuEmpty",
    thisMonthKey: "homeNewMenuThisMonth",
    headerIcon: UtensilsCrossed,
    accent: "newMenu",
    listForMonth: listMemberPortalHomeNewMenusForMonth,
  },
}

type MemberPortalHomePromosAndMenusProps = {
  contentItems: MemberPortalContentItem[]
  lang: string
  t: (key: MemberPortalKey) => string
  onSelectItem: (item: MemberPortalContentItem) => void
}

function HomeContentMonthItems({
  items,
  titleKey,
  emptyKey,
  accent,
  t,
  onSelectItem,
}: {
  items: MemberPortalContentItem[]
  titleKey: MemberPortalKey
  emptyKey: MemberPortalKey
  accent: HomeContentAccent
  t: (key: MemberPortalKey) => string
  onSelectItem: (item: MemberPortalContentItem) => void
}) {
  const accentStyle = HOME_CONTENT_ACCENT[accent]

  if (items.length === 0) {
    return <p className="px-3 pb-5 pt-1 text-center text-xs text-white/45">{t(emptyKey)}</p>
  }

  return (
    <div className="-mx-0 overflow-x-auto px-2.5 pb-2.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2.5">
        {items.map((item) => (
          <button
            key={item.contentKey}
            type="button"
            onClick={() => onSelectItem(item)}
            className={`w-[min(84vw,16.5rem)] shrink-0 overflow-hidden rounded-xl border border-white/[0.09] bg-black/25 text-left transition hover:bg-black/35 ${accentStyle.cardHover}`}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title || t(titleKey)}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-white/[0.06] to-black/50 px-3">
                <p className="line-clamp-3 text-center text-xs font-semibold text-white/85">{item.title || "—"}</p>
              </div>
            )}
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{item.title || "—"}</p>
              {item.body ? (
                <p className="mt-0.5 line-clamp-1 text-[11px] text-white/45">{item.body}</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-white/40">{t("homeFeatureTap")}</p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function MemberPortalHomePromosAndMenus({
  contentItems,
  lang,
  t,
  onSelectItem,
}: MemberPortalHomePromosAndMenusProps) {
  const [activeTab, setActiveTab] = React.useState<HomeContentTab>("promo")
  const [yearMonth, setYearMonth] = React.useState(() => getBangkokMonthRange().yearMonth)

  const tabConfig = HOME_CONTENT_TAB_CONFIG[activeTab]
  const accentStyle = HOME_CONTENT_ACCENT[tabConfig.accent]
  const monthRange = React.useMemo(() => getBangkokMonthRange(yearMonth), [yearMonth])
  const items = React.useMemo(
    () => tabConfig.listForMonth(contentItems, yearMonth, monthRange),
    [contentItems, yearMonth, monthRange, tabConfig.listForMonth]
  )

  const monthLabel = formatCompactMonthLabel(yearMonth, lang)
  const isCurrentMonth = yearMonth === getBangkokMonthRange().yearMonth

  return (
    <GlassCard soft className="overflow-hidden p-0">
      <div className="relative flex items-center justify-between gap-2 px-3 py-2">
        <span
          className={`pointer-events-none absolute inset-y-1.5 left-0 w-px bg-gradient-to-b ${accentStyle.stripe}`}
          aria-hidden
        />
        <div className="flex min-w-0 items-center gap-1 pl-2">
          {(Object.keys(HOME_CONTENT_TAB_CONFIG) as HomeContentTab[]).map((tab) => {
            const config = HOME_CONTENT_TAB_CONFIG[tab]
            const TabIcon = config.headerIcon
            const isActive = activeTab === tab
            const tabAccent = HOME_CONTENT_ACCENT[config.accent]

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  isActive
                    ? `${tabAccent.badge}`
                    : `border-transparent bg-transparent ${MP_CARD_TEXT_MUTED} hover:bg-stone-100/90 hover:text-[color:var(--mp-text-primary,#1c1917)]`
                }`}
              >
                <TabIcon className={`h-3 w-3 ${isActive ? tabAccent.icon : MP_CARD_TEXT_SUBTLE}`} aria-hidden />
                <span>{t(config.titleKey)}</span>
              </button>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-stone-200/80 bg-stone-50/90 p-0.5">
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, -1))}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${MP_CARD_TEXT_MUTED} transition hover:bg-stone-200/60 hover:text-[color:var(--mp-text-primary,#1c1917)]`}
            aria-label={t("homePromoPrevMonth")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span
            className={`inline-flex min-w-[4.25rem] items-center justify-center gap-1 px-1.5 text-[11px] font-medium tabular-nums ${MP_CARD_TEXT_SECONDARY}`}
            title={isCurrentMonth ? t(tabConfig.thisMonthKey) : monthLabel}
          >
            {isCurrentMonth ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]" />
            ) : null}
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setYearMonth((ym) => shiftBangkokYearMonth(ym, 1))}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${MP_CARD_TEXT_MUTED} transition hover:bg-stone-200/60 hover:text-[color:var(--mp-text-primary,#1c1917)]`}
            aria-label={t("homePromoNextMonth")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <HomeContentMonthItems
        items={items}
        titleKey={tabConfig.titleKey}
        emptyKey={tabConfig.emptyKey}
        accent={tabConfig.accent}
        t={t}
        onSelectItem={onSelectItem}
      />
    </GlassCard>
  )
}
