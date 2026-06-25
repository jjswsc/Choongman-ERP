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
import {
  MP_HOME_HERO_AUTO_SLIDE_MS,
  MP_HOME_HERO_HEIGHT,
  MP_HOME_PROMO_RADIUS,
} from "@/lib/member-portal-home-layout"

type HeroBannerCardProps = {
  item: MemberPortalContentItem
  fallbackTitle: string
  ctaLabel?: string
  onSelect: () => void
  onCta?: () => void
}

/**
 * 프로모 히어로 — 이미지 풀블리드 + 하단만 얕은 그라데이션
 * (왼쪽 검은 패널 제거 → 배너 이미지 내 문구가 더 보임)
 */
export function MemberPortalHeroBannerCard({
  item,
  fallbackTitle,
  ctaLabel,
  onSelect,
  onCta,
}: HeroBannerCardProps) {
  const ariaTitle = item.title || fallbackTitle
  const showCta = Boolean(ctaLabel && onCta)

  return (
    <div
      className={`group relative w-full shrink-0 snap-center overflow-hidden ${MP_HOME_PROMO_RADIUS} bg-[#261c12] shadow-[0_14px_34px_-12px_rgba(28,21,16,0.55)]`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 z-[1]"
        aria-label={ariaTitle}
      />
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className={`${MP_HOME_HERO_HEIGHT} w-full object-cover object-center transition duration-500 group-hover:scale-[1.02]`}
        />
      ) : (
        <div className={`${MP_HOME_HERO_HEIGHT} w-full bg-gradient-to-br from-[#3d2a14] to-[#261c12]`} />
      )}

      {/* 배너 이미지에 문구 포함 — 앱 UI는 CTA만 */}
      {showCta ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-16 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex items-end px-4 pb-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCta?.()
              }}
              className="pointer-events-auto inline-flex w-fit items-center gap-0.5 rounded-full bg-gradient-to-r from-[#ff9824] to-[#ef5513] px-3.5 py-1.5 text-[10px] font-extrabold text-white shadow-[0_7px_14px_rgba(239,85,19,0.4)] transition hover:brightness-105 active:scale-95"
            >
              {ctaLabel}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function MemberPortalHeroCarousel({
  items,
  fallbackTitle,
  ctaLabel,
  onSelectItem,
  onCta,
}: {
  items: MemberPortalContentItem[]
  fallbackTitle: string
  ctaLabel?: string
  onSelectItem: (item: MemberPortalContentItem) => void
  onCta?: () => void
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const activeIndexRef = React.useRef(0)
  const autoSlidePausedRef = React.useRef(false)
  const resumeAutoSlideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const itemKeys = React.useMemo(() => items.map((x) => x.contentKey).join("|"), [items])

  const setIndex = React.useCallback((index: number) => {
    activeIndexRef.current = index
    setActiveIndex(index)
  }, [])

  React.useEffect(() => {
    setIndex(0)
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" })
  }, [itemKeys, setIndex])

  const pauseAutoSlide = React.useCallback((resumeAfterMs = MP_HOME_HERO_AUTO_SLIDE_MS * 2) => {
    autoSlidePausedRef.current = true
    if (resumeAutoSlideTimeoutRef.current) clearTimeout(resumeAutoSlideTimeoutRef.current)
    resumeAutoSlideTimeoutRef.current = setTimeout(() => {
      autoSlidePausedRef.current = false
    }, resumeAfterMs)
  }, [])

  React.useEffect(() => {
    return () => {
      if (resumeAutoSlideTimeoutRef.current) clearTimeout(resumeAutoSlideTimeoutRef.current)
    }
  }, [])

  const syncIndexFromScroll = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el || items.length <= 1) return
    const width = el.clientWidth
    if (width <= 0) return
    const next = Math.round(el.scrollLeft / width)
    setIndex(Math.min(items.length - 1, Math.max(0, next)))
  }, [items.length, setIndex])

  const scrollToIndex = React.useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollerRef.current
      if (!el) return
      el.scrollTo({ left: index * el.clientWidth, behavior })
      setIndex(index)
    },
    [setIndex],
  )

  React.useEffect(() => {
    if (items.length <= 1) return
    const id = window.setInterval(() => {
      if (autoSlidePausedRef.current) return
      const next = (activeIndexRef.current + 1) % items.length
      scrollToIndex(next)
    }, MP_HOME_HERO_AUTO_SLIDE_MS)
    return () => window.clearInterval(id)
  }, [items.length, itemKeys, scrollToIndex])

  if (items.length === 1) {
    return (
      <MemberPortalHeroBannerCard
        item={items[0]}
        fallbackTitle={fallbackTitle}
        ctaLabel={ctaLabel}
        onSelect={() => onSelectItem(items[0])}
        onCta={onCta}
      />
    )
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={syncIndexFromScroll}
        onPointerDown={() => pauseAutoSlide()}
        onTouchStart={() => pauseAutoSlide()}
        aria-roledescription="carousel"
      >
        {items.map((item) => (
          <div key={item.contentKey} className="w-full shrink-0 snap-center">
            <MemberPortalHeroBannerCard
              item={item}
              fallbackTitle={fallbackTitle}
              ctaLabel={ctaLabel}
              onSelect={() => onSelectItem(item)}
              onCta={onCta}
            />
          </div>
        ))}
      </div>

      {/* 원본 시안 .dots */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[4] flex items-center justify-center gap-1.5">
        {items.map((row, dotIndex) => (
          <button
            key={row.contentKey}
            type="button"
            onClick={() => {
              pauseAutoSlide()
              scrollToIndex(dotIndex)
            }}
            className={`pointer-events-auto rounded-full transition-all ${
              dotIndex === activeIndex
                ? "h-1.5 w-4 bg-white"
                : "h-1.5 w-1.5 bg-white/55 hover:bg-white/80"
            }`}
            aria-label={`${dotIndex + 1} / ${items.length}`}
          />
        ))}
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
  const promos = React.useMemo(() => {
    const monthRange = getBangkokMonthRange()
    return listMemberPortalHomePromosForMonth(contentItems, monthRange.yearMonth, monthRange, channel)
  }, [contentItems, channel])

  if (!promos.length) return null

  return (
    <MemberPortalHeroCarousel
      items={promos}
      fallbackTitle={t("homePromoTitle")}
      ctaLabel={showOrderButton ? t("homePromoOrderNow") : undefined}
      onSelectItem={onSelectItem}
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

  if (items.length === 1) {
    return (
      <MemberPortalHeroBannerCard
        item={items[0]}
        fallbackTitle={t("homeNewMenuTitle")}
        ctaLabel={t("homePromoOrderNow")}
        onSelect={() => onSelectItem(items[0])}
        onCta={onOrder}
      />
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MemberPortalHeroBannerCard
          key={item.contentKey}
          item={item}
          fallbackTitle={t("homeNewMenuTitle")}
          ctaLabel={t("homePromoOrderNow")}
          onSelect={() => onSelectItem(item)}
          onCta={onOrder}
        />
      ))}
    </div>
  )
}
