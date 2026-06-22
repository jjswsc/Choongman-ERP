"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import { ChevronRight, Gift, History, Star, Ticket } from "lucide-react"
import {
  DEFAULT_MEMBER_APP_BG,
  MP_BOTTOM_NAV_CLEARANCE,
  MP_EMBED_PREVIEW_BOTTOM_CLEARANCE,
  MP_MAX_WIDTH,
  MP_PAGE_BG_CLASS,
  MP_SHEET_BOTTOM_OFFSET,
  MP_SHEET_MAX_HEIGHT_ABOVE_NAV,
  MP_TEXT_MUTED,
  MP_TEXT_PRIMARY,
  MP_TEXT_SECONDARY,
  MP_TEXT_SUBTLE,
  mpGlassCard,
  mpGlassCardSoft,
  mpGlassInset,
} from "@/lib/member-portal-design"
import { MP_HOME_TIER_PILL_GEM_SIZE } from "@/lib/member-portal-home-layout"
import { memberPortalUiThemeStyle, type MemberPortalUiTheme } from "@/lib/member-portal-theme"
import { resolveTierFamily } from "@/lib/member-portal-tier-visual"
import { TierFacetedGemIcon } from "@/components/member-portal/member-portal-tier-gem-icon"
import { MemberPortalLoungeBackdrop } from "@/components/member-portal/member-portal-lounge-backdrop"
import type { PortalTab } from "@/components/member-portal/portal-ui"

export function MemberPortalAmbienceBackground({
  imageUrl,
  heroFoodImageUrl,
  uiTheme,
  children,
  className = "",
}: {
  imageUrl?: string
  heroFoodImageUrl?: string
  uiTheme?: Partial<MemberPortalUiTheme>
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative min-h-[100dvh] overflow-x-hidden ${MP_PAGE_BG_CLASS} ${MP_TEXT_PRIMARY} ${className}`}
      style={memberPortalUiThemeStyle(uiTheme || {})}
    >
      <MemberPortalLoungeBackdrop
        className="fixed"
        customFullBackgroundUrl={imageUrl}
        heroFoodImageUrl={heroFoodImageUrl}
        variant="app"
      />
      <div className="relative z-10 min-h-[100dvh]">{children}</div>
    </div>
  )
}

export function MemberPortalShell({
  children,
  embedPreview = false,
}: {
  children: React.ReactNode
  embedPreview?: boolean
}) {
  return (
    <div
      className={`relative mx-auto w-full ${MP_MAX_WIDTH} px-4 pt-[max(1rem,env(safe-area-inset-top))]`}
      style={{
        paddingBottom: embedPreview ? MP_EMBED_PREVIEW_BOTTOM_CLEARANCE : MP_BOTTOM_NAV_CLEARANCE,
      }}
    >
      {children}
    </div>
  )
}

export function GlassCard({
  children,
  className = "",
  soft = false,
}: {
  children: React.ReactNode
  className?: string
  soft?: boolean
}) {
  return <div className={`${soft ? mpGlassCardSoft : mpGlassCard} p-5 ${className}`}>{children}</div>
}

export function GlassInset({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${mpGlassInset} ${className}`}>{children}</div>
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className={`text-lg font-semibold tracking-tight ${MP_TEXT_PRIMARY}`}>{title}</h2>
        {subtitle ? <p className={`mt-0.5 text-sm leading-relaxed ${MP_TEXT_MUTED}`}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function PremiumStatTile({
  icon: Icon,
  label,
  value,
  sub,
  accent = "amber",
  size = "default",
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
  accent?: "amber" | "rose" | "emerald"
  size?: "default" | "compact"
  onClick?: () => void
}) {
  const accentMap = {
    amber: "from-amber-100 to-amber-50 text-amber-700 border-amber-200/80",
    rose: "from-rose-100 to-rose-50 text-rose-700 border-rose-200/80",
    emerald: "from-emerald-100 to-emerald-50 text-emerald-700 border-emerald-200/80",
  }
  const compact = size === "compact"
  const className = `${mpGlassCardSoft} ${compact ? "p-3" : "p-4"} text-left transition ${onClick ? "cursor-pointer hover:border-amber-300/60 active:scale-[0.98]" : ""}`
  const inner = (
    <>
      <div
        className={`${compact ? "mb-2 h-9 w-9" : "mb-3 h-10 w-10"} flex items-center justify-center rounded-xl border bg-gradient-to-br ${accentMap[accent]}`}
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </div>
      <p className={`font-medium uppercase ${MP_TEXT_MUTED} ${compact ? "text-[10px] leading-tight tracking-[0.08em] line-clamp-2" : "text-[11px] tracking-[0.12em]"}`}>
        {label}
      </p>
      <p className={`font-semibold leading-snug tracking-tight ${MP_TEXT_PRIMARY} ${compact ? "mt-1 text-lg" : "mt-1.5 line-clamp-2 text-base"}`}>
        {value}
      </p>
      {sub ? <p className={`mt-1 text-[11px] ${MP_TEXT_SUBTLE}`}>{sub}</p> : null}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    )
  }
  return <div className={className}>{inner}</div>
}

/** 혜택 탭 — 쿠폰·포인트·방문 통계 (아이콘 타일 통일) */
export function MemberPortalBenefitStatsGrid({
  couponsLabel,
  couponsValue,
  availablePointsLabel,
  availablePointsValue,
  cumulativePointsLabel,
  cumulativePointsValue,
  visitsLabel,
  visitsValue,
}: {
  couponsLabel: string
  couponsValue: string
  availablePointsLabel: string
  availablePointsValue: string
  cumulativePointsLabel: string
  cumulativePointsValue: string
  visitsLabel: string
  visitsValue: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PremiumStatTile icon={Ticket} label={couponsLabel} value={couponsValue} accent="emerald" size="compact" />
      <PremiumStatTile icon={History} label={visitsLabel} value={visitsValue} accent="amber" size="compact" />
      <PremiumStatTile icon={Gift} label={availablePointsLabel} value={availablePointsValue} accent="rose" size="compact" />
      <PremiumStatTile icon={Star} label={cumulativePointsLabel} value={cumulativePointsValue} accent="amber" size="compact" />
    </div>
  )
}

/** 홈 — 혜택 탭 바로가기 (숫자 중복 없이 아이콘만) */
export function MemberPortalPrivilegeShortcut({
  title,
  subtitle,
  onClick,
}: {
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${mpGlassCardSoft} group flex w-full items-center gap-3.5 p-4 text-left transition hover:border-amber-300/50 active:scale-[0.99]`}
    >
      <div className="flex shrink-0 items-center pl-1">
        <span className="relative z-[3] flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 shadow-sm">
          <Ticket className="h-4 w-4" aria-hidden />
        </span>
        <span className="relative z-[2] -ml-3 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-gradient-to-br from-rose-100 to-rose-50 text-rose-700 shadow-sm">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <span className="relative z-[1] -ml-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-sm">
          <History className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${MP_TEXT_PRIMARY}`}>{title}</p>
        <p className={`mt-0.5 line-clamp-2 text-xs leading-relaxed ${MP_TEXT_MUTED}`}>{subtitle}</p>
      </div>
      <ChevronRight className={`h-5 w-5 shrink-0 ${MP_TEXT_SUBTLE} transition group-hover:translate-x-0.5 group-hover:text-amber-600`} aria-hidden />
    </button>
  )
}

export function MemberPortalContentSheet({
  open,
  item,
  closeLabel,
  onClose,
}: {
  open: boolean
  item: { title: string; body: string; imageUrl: string } | null
  closeLabel: string
  onClose: () => void
}) {
  if (!open || !item) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} overflow-y-auto rounded-t-[1.75rem] border border-white/10 bg-[#121214] px-5 pb-6 pt-4 shadow-2xl`}
        style={{ marginBottom: MP_SHEET_BOTTOM_OFFSET, maxHeight: MP_SHEET_MAX_HEIGHT_ABOVE_NAV }}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title || "promo"}
            className="mb-4 max-h-64 w-full rounded-2xl object-cover"
          />
        ) : null}
        {item.title ? <h3 className="text-lg font-semibold text-white">{item.title}</h3> : null}
        {item.body ? (
          <p className="mt-3 whitespace-pre-wrap pb-1 text-sm leading-relaxed text-white/70">{item.body}</p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}

export function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[5.5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border border-stone-200/80 bg-white/90 px-3 py-3.5 shadow-sm transition active:scale-[0.98] hover:border-amber-300/60 hover:bg-white`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 shadow-inner">
        <Icon className="h-5 w-5" />
      </span>
      <span className={`max-w-[4.5rem] text-center text-[11px] font-medium leading-tight ${MP_TEXT_SECONDARY}`}>{label}</span>
    </button>
  )
}

export function PremiumAppHeader({
  wordmark,
  displayName,
  tierLabel,
  tierCode,
  logoSrc,
  logoAlt,
  langSelect,
  onLogout,
  logoutLabel,
}: {
  wordmark: string
  displayName: string
  tierLabel?: string
  tierCode?: string
  logoSrc: string
  logoAlt: string
  langSelect: React.ReactNode
  onLogout: () => void
  logoutLabel: string
}) {
  const tierFamily = resolveTierFamily(tierCode || tierLabel || "BRONZE")

  return (
    <header className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="relative shrink-0">
          <div className="absolute -inset-0.5 rounded-[14px] bg-gradient-to-br from-amber-400/35 to-orange-500/20 blur-[2px]" />
          <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-[13px] border border-[#fff0e4] bg-gradient-to-br from-[#ff5b18] to-[#e64b0d] p-1.5 shadow-[0_6px_14px_rgba(241,86,18,0.22)]">
            <Image src={logoSrc} alt={logoAlt} width={32} height={32} className="h-8 w-8 object-contain" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.24em] text-amber-700/75">
            {wordmark}
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-bold leading-tight text-stone-900">{displayName}</p>
            {tierLabel ? (
              <span className="inline-flex max-w-[44%] shrink-0 items-center gap-0.5 rounded-full bg-[#fff0e5] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[#66331a]">
                <TierFacetedGemIcon family={tierFamily} size={MP_HOME_TIER_PILL_GEM_SIZE} />
                <span className="truncate">{tierLabel}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {langSelect}
        <button
          type="button"
          onClick={onLogout}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-200/90 bg-white/95 ${MP_TEXT_SECONDARY} shadow-sm transition hover:border-stone-300 hover:text-stone-800`}
          aria-label={logoutLabel}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  )
}

export function PremiumBottomNav({
  tab,
  onChange,
  items,
  embedPreview = false,
  hidden = false,
}: {
  tab: PortalTab
  onChange: (tab: PortalTab) => void
  items: Array<{ id: PortalTab; label: string; icon: LucideIcon }>
  embedPreview?: boolean
  hidden?: boolean
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  if (hidden) return null

  const nav = (
    <nav
      className={`${embedPreview ? "absolute" : "fixed"} inset-x-0 bottom-0 z-[70] isolate border-t border-stone-200 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-1px_0_rgba(0,0,0,0.06)]`}
      aria-label="Member portal navigation"
    >
      <div className={`mx-auto grid w-full ${MP_MAX_WIDTH} grid-cols-5`}>
        {items.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              className={`relative flex w-full min-h-[3.25rem] flex-col items-center justify-center gap-1 px-0.5 py-0.5 text-[10px] font-medium transition ${
                active ? "text-orange-600" : "text-stone-600"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${active ? "text-orange-600" : "text-stone-700"}`}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className="max-w-full truncate leading-tight">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )

  if (embedPreview || !mounted || typeof document === "undefined") return nav
  return createPortal(nav, document.body)
}

export function TierProgressCard({
  title,
  subtitle,
  progressPercent,
  pointRateLabel,
  accentClass,
  actionLabel,
  onAction,
}: {
  title: string
  subtitle: string
  progressPercent: number
  pointRateLabel: string
  accentClass: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <GlassCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${MP_TEXT_PRIMARY}`}>{title}</p>
          <p className={`mt-1 text-xs leading-relaxed ${MP_TEXT_MUTED}`}>{subtitle}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 ${accentClass}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M12 15l-3.5 5h7L12 15zM8.5 9.5L12 3l3.5 6.5H8.5z" />
          </svg>
        </div>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-stone-200/80">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-[#f5e6b8] shadow-[0_0_12px_rgba(251,191,36,0.45)] transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className={`text-[11px] font-medium tracking-wide ${MP_TEXT_MUTED}`}>{pointRateLabel}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 transition hover:bg-amber-100"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </GlassCard>
  )
}

export { DEFAULT_MEMBER_APP_BG }
