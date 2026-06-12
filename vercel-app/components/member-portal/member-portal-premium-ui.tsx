"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import { ChevronRight, Gift, History, Ticket } from "lucide-react"
import {
  DEFAULT_MEMBER_APP_BG,
  MP_BOTTOM_NAV_CLEARANCE,
  MP_MAX_WIDTH,
  mpGlassCard,
  mpGlassCardSoft,
  mpGlassInset,
} from "@/lib/member-portal-design"
import { MemberPortalLoungeBackdrop } from "@/components/member-portal/member-portal-lounge-backdrop"
import type { PortalTab } from "@/components/member-portal/portal-ui"

export function MemberPortalAmbienceBackground({
  imageUrl,
  heroFoodImageUrl,
  children,
  className = "",
}: {
  imageUrl?: string
  heroFoodImageUrl?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative min-h-[100dvh] bg-[#050506] text-white ${className}`}>
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
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`relative mx-auto w-full ${MP_MAX_WIDTH} px-4 pt-[max(1rem,env(safe-area-inset-top))]`}
      style={{ paddingBottom: MP_BOTTOM_NAV_CLEARANCE }}
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
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm leading-relaxed text-white/50">{subtitle}</p> : null}
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
    amber: "from-amber-400/20 to-amber-600/5 text-amber-200 border-amber-400/20",
    rose: "from-rose-400/15 to-rose-600/5 text-rose-200 border-rose-400/20",
    emerald: "from-emerald-400/15 to-emerald-600/5 text-emerald-200 border-emerald-400/20",
  }
  const compact = size === "compact"
  const className = `${mpGlassCardSoft} ${compact ? "p-3" : "p-4"} text-left transition ${onClick ? "cursor-pointer hover:border-white/15 active:scale-[0.98]" : ""}`
  const inner = (
    <>
      <div
        className={`${compact ? "mb-2 h-9 w-9" : "mb-3 h-10 w-10"} flex items-center justify-center rounded-xl border bg-gradient-to-br ${accentMap[accent]}`}
      >
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </div>
      <p className={`font-medium uppercase text-white/45 ${compact ? "text-[10px] leading-tight tracking-[0.08em] line-clamp-2" : "text-[11px] tracking-[0.12em]"}`}>
        {label}
      </p>
      <p className={`font-semibold leading-snug tracking-tight text-white ${compact ? "mt-1 text-lg" : "mt-1.5 line-clamp-2 text-base"}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-white/40">{sub}</p> : null}
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
  pointsLabel,
  pointsValue,
  visitsLabel,
  visitsValue,
}: {
  couponsLabel: string
  couponsValue: string
  pointsLabel: string
  pointsValue: string
  visitsLabel: string
  visitsValue: string
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <PremiumStatTile icon={Ticket} label={couponsLabel} value={couponsValue} accent="emerald" size="compact" />
      <PremiumStatTile icon={Gift} label={pointsLabel} value={pointsValue} accent="rose" size="compact" />
      <PremiumStatTile icon={History} label={visitsLabel} value={visitsValue} accent="amber" size="compact" />
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
      className={`${mpGlassCardSoft} group flex w-full items-center gap-3.5 p-4 text-left transition hover:border-amber-400/25 active:scale-[0.99]`}
    >
      <div className="flex shrink-0 items-center pl-1">
        <span className="relative z-[3] flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/20 to-emerald-600/5 text-emerald-200 shadow-lg shadow-black/20">
          <Ticket className="h-4 w-4" aria-hidden />
        </span>
        <span className="relative z-[2] -ml-3 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-400/20 bg-gradient-to-br from-rose-400/15 to-rose-600/5 text-rose-200 shadow-lg shadow-black/20">
          <Gift className="h-4 w-4" aria-hidden />
        </span>
        <span className="relative z-[1] -ml-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-400/20 to-amber-600/5 text-amber-200 shadow-lg shadow-black/20">
          <History className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/45">{subtitle}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-amber-300/80" aria-hidden />
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
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] border border-white/10 bg-[#121214] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl`}
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
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{item.body}</p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-white/90 hover:bg-white/10"
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
      className={`flex min-w-[5.5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-3.5 backdrop-blur-md transition active:scale-[0.98] hover:border-amber-400/25 hover:bg-black/40`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/25 to-amber-600/10 text-amber-100 shadow-inner">
        <Icon className="h-5 w-5" />
      </span>
      <span className="max-w-[4.5rem] text-center text-[11px] font-medium leading-tight text-white/80">{label}</span>
    </button>
  )
}

export function PremiumAppHeader({
  wordmark,
  displayName,
  tierLabel,
  logoSrc,
  logoAlt,
  langSelect,
  onLogout,
  logoutLabel,
}: {
  wordmark: string
  displayName: string
  tierLabel?: string
  logoSrc: string
  logoAlt: string
  langSelect: React.ReactNode
  onLogout: () => void
  logoutLabel: string
}) {
  return (
    <header className="mb-5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-amber-400/20 bg-black/40 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-400/10 to-transparent" />
          <Image src={logoSrc} alt={logoAlt} width={32} height={32} className="relative h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-amber-200/55">{wordmark}</p>
          <p className="truncate text-base font-semibold tracking-tight">{displayName}</p>
          {tierLabel ? (
            <span className="mt-0.5 inline-flex rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100/90">
              {tierLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {langSelect}
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/35 text-white/65 backdrop-blur-md transition hover:border-white/20 hover:text-white"
          aria-label={logoutLabel}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
}: {
  tab: PortalTab
  onChange: (tab: PortalTab) => void
  items: Array<{ id: PortalTab; label: string; icon: LucideIcon }>
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const nav = (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] isolate pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2"
      aria-label="Member portal navigation"
    >
      <div className={`mx-auto w-full ${MP_MAX_WIDTH} px-4`}>
        <div className="rounded-[1.35rem] border border-white/12 bg-[#121214] px-1 py-1.5 shadow-[0_-6px_28px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06] supports-[backdrop-filter]:bg-[rgba(10,10,12,0.97)] supports-[backdrop-filter]:backdrop-blur-xl">
          <div className="grid grid-cols-5">
            {items.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange(id)}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition ${
                    active ? "text-amber-200" : "text-white/55 hover:text-white/75"
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-x-2 top-0 h-8 rounded-xl bg-gradient-to-b from-amber-400/20 to-transparent" />
                  ) : null}
                  <Icon className={`relative h-5 w-5 ${active ? "text-amber-300" : "text-white/70"}`} />
                  <span className="relative max-w-full truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )

  if (!mounted || typeof document === "undefined") return nav
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
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">{subtitle}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/25 ${accentClass}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M12 15l-3.5 5h7L12 15zM8.5 9.5L12 3l3.5 6.5H8.5z" />
          </svg>
        </div>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-[#f5e6b8] shadow-[0_0_12px_rgba(251,191,36,0.45)] transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-white/45">{pointRateLabel}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-400/15"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </GlassCard>
  )
}

export { DEFAULT_MEMBER_APP_BG }
