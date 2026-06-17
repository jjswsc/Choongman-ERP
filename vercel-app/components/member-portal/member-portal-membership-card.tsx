"use client"

import * as React from "react"
import { Loader2, QrCode, ChevronRight } from "lucide-react"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { formatPoints, maskPhone, tierVisual, type PortalDashboard } from "@/components/member-portal/portal-ui"
import type { TierVisual } from "@/lib/member-portal-tier-visual"
import { MemberPortalTierGem } from "@/components/member-portal/member-portal-tier-gem"
import { MP_HOME_CARD_RADIUS, MP_HOME_MEMBERSHIP_ASPECT } from "@/lib/member-portal-home-layout"
import { cn } from "@/lib/utils"

type MembershipCardTierProgress = {
  subtitle: string
  progressPercent: number
  pointRateLabel: string
  actionLabel?: string
  onAction?: () => void
}

function MembershipCardTierProgressSection({
  subtitle,
  progressPercent,
  pointRateLabel,
  actionLabel,
  onAction,
  tier,
}: MembershipCardTierProgress & { tier: TierVisual }) {
  const { t } = useMemberPortalLang()

  return (
    <div className="relative shrink-0 pt-2.5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{t("tierNext")}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/65">{subtitle}</p>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r shadow-[0_0_10px_rgba(255,255,255,0.12)] transition-all duration-700",
            tier.progressBar
          )}
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-medium tracking-wide text-white/40">{pointRateLabel}</p>
        <p className={cn("shrink-0 text-[11px] font-bold tabular-nums", tier.progressPercent)}>
          {progressPercent}%
        </p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-full border border-white/15 bg-white/8 py-1.5 text-[10px] font-semibold text-white/90 transition hover:bg-white/12"
        >
          {actionLabel}
          <ChevronRight className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )
}

function MembershipCardHeader({
  displayName,
  tier,
  tierName,
  subtitle,
  showQr,
  qrReady,
  onToggleQr,
}: {
  displayName: string
  tier: TierVisual
  tierName: string
  subtitle?: string
  showQr: boolean
  qrReady: boolean
  onToggleQr: () => void
}) {
  const { t } = useMemberPortalLang()

  return (
    <div className="relative flex shrink-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
          {showQr ? t("scanAtCounter") : t("membership")}
        </p>
        <h2 className={cn("mt-0.5 truncate text-[1.125rem] font-bold leading-tight tracking-tight", tier.titleClass)}>
          {displayName}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-white/60">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <MemberPortalTierGem tier={tier} label={tierName} size="md" />
        <button
          type="button"
          onClick={onToggleQr}
          disabled={!qrReady && !showQr}
          className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-black/25 text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-35"
          aria-label={showQr ? t("hideQr") : t("showQr")}
          aria-pressed={showQr}
        >
          <QrCode className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CardFaceTexture({ tier }: { tier: TierVisual }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgdHlwZT0iZnJhY3RhbE5vaXNlIiBiYXNlRnJlcXVlbmN5PSIwLjkiIG51bU9jdGF2ZXM9IjQiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InViciIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==')] opacity-60" />
      <div className={cn("pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl", tier.ambientTop)} />
      <div className={cn("pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full blur-2xl", tier.ambientBottom)} />
    </>
  )
}

export function MemberPortalMembershipCard({
  member,
  dashboard,
  qrDataUrl,
  showQr,
  onToggleQr,
  tierProgress,
}: {
  member: MemberSummary
  dashboard: PortalDashboard
  qrDataUrl: string
  showQr: boolean
  onToggleQr: () => void
  tierProgress?: MembershipCardTierProgress
}) {
  const { t } = useMemberPortalLang()
  const tier = tierVisual(dashboard.tierProgress.currentTierCode)
  const displayName = member.fullName || member.name || "Member"
  const tierName = dashboard.tierProgress.currentTierName || tier.label

  const cardShell = cn(
    "absolute inset-0 overflow-hidden bg-gradient-to-br",
    MP_HOME_CARD_RADIUS,
    tier.border,
    tier.gradient,
    tier.glow,
    "shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)]"
  )

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: MP_HOME_MEMBERSHIP_ASPECT }}
    >
      <div className={cardShell}>
        <CardFaceTexture tier={tier} />
        {/* 상단 글로스 하이라이트 — 입체감 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.14] to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />

        {showQr ? (
          <div key="qr" className="relative flex h-full min-h-0 animate-in fade-in zoom-in-95 flex-col p-4 duration-300">
            <MembershipCardHeader
              displayName={displayName}
              tier={tier}
              tierName={tierName}
              showQr
              qrReady={Boolean(qrDataUrl)}
              onToggleQr={onToggleQr}
            />
            <div className="relative flex min-h-0 flex-1 items-center justify-center pt-1">
              {qrDataUrl ? (
                <div className="flex aspect-square h-full max-h-full w-full max-w-full flex-col rounded-2xl border border-white/15 bg-white p-[clamp(0.45rem,2.5vw,0.75rem)] shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
                  <div className="relative min-h-0 flex-1">
                    <img src={qrDataUrl} alt="Member QR" className="absolute inset-0 size-full object-contain" />
                  </div>
                  <p className="mt-1 shrink-0 text-center text-[10px] font-semibold tracking-wider text-neutral-600">
                    {member.memberNo || `M${member.id}`}
                  </p>
                </div>
              ) : (
                <Loader2 className="h-8 w-8 animate-spin text-white/50" aria-hidden />
              )}
            </div>
          </div>
        ) : (
          <div key="front" className="relative flex h-full min-h-0 animate-in fade-in flex-col p-4 duration-300">
            <MembershipCardHeader
              displayName={displayName}
              tier={tier}
              tierName={tierName}
              subtitle={maskPhone(member.phone)}
              showQr={false}
              qrReady={Boolean(qrDataUrl)}
              onToggleQr={onToggleQr}
            />

            <div className="relative mt-1.5 grid min-h-0 flex-1 grid-cols-2 content-center gap-2.5">
              <div
                className={cn(
                  "relative overflow-hidden rounded-[14px] border px-3 py-2 backdrop-blur-md",
                  tier.statPanel
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">{t("points")}</p>
                <p className="mt-0.5 text-[1.15rem] font-bold leading-none tracking-tight text-white">
                  {formatPoints(member.pointBalance || 0)}
                </p>
              </div>
              <div
                className={cn(
                  "relative overflow-hidden rounded-[14px] border px-3 py-2 backdrop-blur-md",
                  tier.statPanel
                )}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent" />
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">{t("memberNoShort")}</p>
                <p className="mt-0.5 text-sm font-bold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
              </div>
            </div>

            {tierProgress ? <MembershipCardTierProgressSection {...tierProgress} tier={tier} /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
