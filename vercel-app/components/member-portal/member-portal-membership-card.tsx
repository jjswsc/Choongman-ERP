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
import { mpGoldText } from "@/lib/member-portal-design"

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
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
          {showQr ? t("scanAtCounter") : t("membership")}
        </p>
        <h2 className={`mt-1 truncate text-[1.35rem] font-bold tracking-tight ${mpGoldText}`}>{displayName}</h2>
        {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${tier.chip}`}>
          {tierName}
        </span>
        <button
          type="button"
          onClick={onToggleQr}
          disabled={!qrReady}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-black/30 text-white backdrop-blur-md transition hover:border-amber-400/30 hover:bg-black/45 disabled:opacity-40"
          aria-label={showQr ? t("hideQr") : t("showQr")}
          aria-pressed={showQr}
        >
          <QrCode className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export function MemberPortalMembershipCard({
  member,
  dashboard,
  qrDataUrl,
  showQr,
  onToggleQr,
}: {
  member: MemberSummary
  dashboard: PortalDashboard
  qrDataUrl: string
  showQr: boolean
  onToggleQr: () => void
}) {
  const { t } = useMemberPortalLang()
  const tier = tierVisual(dashboard.tierProgress.currentTierCode)
  const displayName = member.fullName || member.name || "Member"
  const tierName = dashboard.tierProgress.currentTierName || tier.label

  return (
    <div
      className={`relative h-[336px] overflow-hidden rounded-[1.5rem] border border-amber-400/20 bg-gradient-to-br ${tier.gradient} shadow-[0_20px_60px_rgba(0,0,0,0.5)] ${tier.glow}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgdHlwZT0iZnJhY3RhbE5vaXNlIiBiYXNlRnJlcXVlbmN5PSIwLjkiIG51bU9jdGF2ZXM9IjQiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InViciIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==')] opacity-60" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-black/30 blur-2xl" />

      <div
        className={`absolute inset-0 flex flex-col p-5 transition-opacity duration-300 ease-out ${
          showQr ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={showQr}
      >
        <MembershipCardHeader
          displayName={displayName}
          tier={tier}
          tierName={tierName}
          subtitle={maskPhone(member.phone)}
          showQr={false}
          qrReady={Boolean(qrDataUrl)}
          onToggleQr={onToggleQr}
        />

        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{t("points")}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{formatPoints(member.pointBalance || 0)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{t("memberNoShort")}</p>
            <p className="mt-1.5 text-lg font-bold tracking-wide text-white">{member.memberNo || `#${member.id}`}</p>
          </div>
        </div>

        <p className="relative mt-auto pt-4 text-[11px] tracking-wide text-white/50">{t("scanAtCounter")}</p>
      </div>

      <div
        className={`absolute inset-0 flex flex-col p-5 transition-opacity duration-300 ease-out ${
          showQr ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!showQr}
      >
        <MembershipCardHeader
          displayName={displayName}
          tier={tier}
          tierName={tierName}
          showQr
          qrReady={Boolean(qrDataUrl)}
          onToggleQr={onToggleQr}
        />

        <div className="relative mt-3 flex flex-1 flex-col items-center justify-center">
          {qrDataUrl ? (
            <div className="flex w-full max-w-[232px] flex-col items-center rounded-2xl border border-white/15 bg-white p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
              <img src={qrDataUrl} alt="Member QR" className="h-[11.5rem] w-[11.5rem] rounded-xl" />
              <p className="mt-2.5 text-center text-xs font-semibold tracking-wider text-neutral-600">
                {member.memberNo || `M${member.id}`}
              </p>
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white/50" aria-hidden />
          )}
        </div>
      </div>
    </div>
  )
}
