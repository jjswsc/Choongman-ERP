"use client"

import * as React from "react"
import { Loader2, QrCode } from "lucide-react"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  formatPoints,
  maskPhone,
  tierVisual,
  type PortalDashboard,
} from "@/components/member-portal/portal-ui"
import { MEMBERSHIP_CARD_GOLDEN_RATIO, mpGoldText } from "@/lib/member-portal-design"

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
}: MembershipCardTierProgress) {
  const { t } = useMemberPortalLang()

  return (
    <div className="relative shrink-0 border-t border-white/10 pt-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{t("tierNext")}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/65">{subtitle}</p>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-[#f5e6b8] shadow-[0_0_10px_rgba(251,191,36,0.4)] transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-medium tracking-wide text-white/40">{pointRateLabel}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-medium text-amber-100 transition hover:bg-amber-400/15"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
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
  tier: ReturnType<typeof tierVisual>
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
        <h2 className={`mt-0.5 truncate text-[1.2rem] font-bold leading-tight tracking-tight ${mpGoldText}`}>
          {displayName}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-white/60">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tier.chip}`}>
          {tierName}
        </span>
        <button
          type="button"
          onClick={onToggleQr}
          disabled={!qrReady && !showQr}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-black/30 text-white backdrop-blur-md transition hover:border-amber-400/30 hover:bg-black/45 disabled:opacity-40"
          aria-label={showQr ? t("hideQr") : t("showQr")}
          aria-pressed={showQr}
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function CardFaceTexture() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgdHlwZT0iZnJhY3RhbE5vaXNlIiBiYXNlRnJlcXVlbmN5PSIwLjkiIG51bU9jdGF2ZXM9IjQiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InViciIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==')] opacity-60" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-black/30 blur-2xl" />
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

  const cardShell = `absolute inset-0 overflow-hidden rounded-[1.5rem] border border-amber-400/20 bg-gradient-to-br ${tier.gradient} shadow-[0_20px_60px_rgba(0,0,0,0.5)] ${tier.glow}`

  return (
    <div className="relative w-full" style={{ perspective: "1200px" }}>
      <div
        className="relative w-full transition-transform duration-700 ease-[cubic-bezier(0.4,0.2,0.2,1)]"
        style={{
          aspectRatio: tierProgress ? 1.38 : MEMBERSHIP_CARD_GOLDEN_RATIO,
          transformStyle: "preserve-3d",
          transform: showQr ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className={cardShell}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <CardFaceTexture />
          <div className="relative flex h-full min-h-0 flex-col p-4">
            <MembershipCardHeader
              displayName={displayName}
              tier={tier}
              tierName={tierName}
              subtitle={maskPhone(member.phone)}
              showQr={false}
              qrReady={Boolean(qrDataUrl)}
              onToggleQr={onToggleQr}
            />

            <div className="relative mt-2 grid min-h-0 flex-1 grid-cols-2 content-center gap-2">
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{t("points")}</p>
                <p className="mt-0.5 text-lg font-bold tracking-tight text-white">{formatPoints(member.pointBalance || 0)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{t("memberNoShort")}</p>
                <p className="mt-0.5 text-sm font-bold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
              </div>
            </div>

            {tierProgress ? <MembershipCardTierProgressSection {...tierProgress} /> : null}
          </div>
        </div>

        {/* Back — QR (same card slot, flipped) */}
        <div
          className={cardShell}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardFaceTexture />
          <div className="relative flex h-full min-h-0 flex-col p-4">
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
        </div>
      </div>
    </div>
  )
}
