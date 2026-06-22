"use client"

import * as React from "react"
import { ChevronRight, Loader2, QrCode } from "lucide-react"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { formatPoints, maskPhone, tierVisual, type PortalDashboard } from "@/components/member-portal/portal-ui"
import { TierFacetedGemIcon } from "@/components/member-portal/member-portal-tier-gem-icon"
import { MP_HOME_CARD_GEM_SIZE } from "@/lib/member-portal-home-layout"
import { cn } from "@/lib/utils"

type MembershipCardTierProgress = {
  subtitle: string
  progressPercent: number
  pointRateLabel: string
  nextTierCode?: string | null
  nextTierName?: string | null
  progressSummary?: string
  actionLabel?: string
  onAction?: () => void
}

/** choongman_member_home_only.html — member-card (172px, 다크 그라데이션) */
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
  const nextFamily = tierProgress?.nextTierCode ? tierVisual(tierProgress.nextTierCode).family : null

  if (showQr) {
    return (
      <div className="relative w-full overflow-hidden rounded-[18px] bg-gradient-to-br from-[#222] via-[#101010] to-[#262626] p-4 text-white shadow-[0_12px_22px_rgba(0,0,0,0.16)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">{t("scanAtCounter")}</p>
          <button
            type="button"
            onClick={onToggleQr}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80"
            aria-label={t("hideQr")}
          >
            <QrCode className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-[200px] items-center justify-center">
          {qrDataUrl ? (
            <div className="w-full max-w-[220px] rounded-2xl border border-white/15 bg-white p-3 shadow-xl">
              <img src={qrDataUrl} alt="Member QR" className="aspect-square w-full object-contain" />
              <p className="mt-2 text-center text-[10px] font-semibold tracking-wider text-neutral-600">
                {member.memberNo || `M${member.id}`}
              </p>
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-white/50" aria-hidden />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative w-full overflow-visible rounded-[18px] px-4 py-[13px] pb-4 text-white shadow-[0_12px_22px_rgba(0,0,0,0.16)]"
      style={{
        background:
          "radial-gradient(circle at 82% 18%, rgba(255,255,255,0.22), transparent 18%), linear-gradient(135deg, #222 0%, #101010 60%, #262626 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(117deg, transparent 0 65%, rgba(255,255,255,0.08) 66% 68%, transparent 69%), radial-gradient(circle at 98% 5%, rgba(255,255,255,0.12), transparent 24%)",
        }}
      />

      <div className="pointer-events-none absolute right-5 top-4 z-[2]">
        <TierFacetedGemIcon family={tier.family} size={MP_HOME_CARD_GEM_SIZE} variant="cardHero" />
      </div>

      <button
        type="button"
        onClick={onToggleQr}
        disabled={!qrDataUrl}
        className="absolute right-3 top-3 z-[3] inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-30"
        aria-label={t("showQr")}
      >
        <QrCode className="h-3.5 w-3.5" />
      </button>

      <div className="relative z-[1]">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-[#d2d2d2]">
          {t("membership")}
        </p>
        <h2 className="truncate text-[21px] font-black leading-[1.15]">{displayName}</h2>
        <p className="mt-px text-[13px] text-[#f6f6f6]">{maskPhone(member.phone)}</p>

        <div className="relative mt-2.5 grid min-h-[54px] grid-cols-[1fr_1px_1fr_1px_1fr] items-center rounded-[9px] border border-white/[0.13] bg-white/[0.025] px-2.5 py-2 sm:px-[11px]">
          <div className="min-w-0 px-1">
            <p className="mb-0.5 text-[7.5px] font-semibold uppercase leading-tight tracking-[0.14em] text-[#a9a9a9] sm:text-[8px]">
              {t("availablePoints")}
            </p>
            <p className="truncate text-base font-black leading-none sm:text-lg">
              {formatPoints(member.pointBalance || 0)}
            </p>
          </div>
          <div className="h-[34px] w-px bg-white/[0.15]" />
          <div className="min-w-0 px-1">
            <p className="mb-0.5 text-[7.5px] font-semibold uppercase leading-tight tracking-[0.14em] text-[#a9a9a9] sm:text-[8px]">
              {t("cumulativeTierPoints")}
            </p>
            <p className="truncate text-base font-black leading-none sm:text-lg">
              {formatPoints(
                member.tierPoints ??
                  dashboard.stats.tierQualificationPoints ??
                  dashboard.tierProgress.qualificationValue ??
                  0
              )}
            </p>
          </div>
          <div className="h-[34px] w-px bg-white/[0.15]" />
          <div className="min-w-0 pl-1">
            <p className="mb-0.5 text-[7.5px] font-semibold uppercase leading-tight tracking-[0.14em] text-[#a9a9a9] sm:text-[8px]">
              {t("memberNoShort")}
            </p>
            <p className="truncate font-mono text-sm font-black leading-none sm:text-lg">{member.memberNo || `#${member.id}`}</p>
          </div>
        </div>

        {tierProgress ? (
          <div className="relative mt-2.5 text-[9px] text-[#d8d8d8]">
            {tierProgress.nextTierName ? (
              <div className="flex flex-wrap items-center gap-1">
                <span>{t("tierNext")} :</span>
                <b className="text-[10px] tracking-wide text-white">{tierProgress.nextTierName}</b>
                {nextFamily ? <TierFacetedGemIcon family={nextFamily} size={16} /> : null}
              </div>
            ) : null}
            <p className="mt-0.5 text-[9px] leading-snug">{tierProgress.subtitle}</p>
            <div className="my-1 h-1.5 overflow-hidden rounded-full bg-white/[0.24]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#f25a13] to-[#ff9b2d] transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, tierProgress.progressPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[8.5px] text-[#f0f0f0]">
              <span className="min-w-0 truncate tabular-nums">
                {tierProgress.progressSummary || tierProgress.pointRateLabel}
              </span>
              {tierProgress.actionLabel && tierProgress.onAction ? (
                <button
                  type="button"
                  onClick={tierProgress.onAction}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/[0.42] bg-white/[0.05] px-2 py-1 text-[8.5px] text-white"
                >
                  {tierProgress.actionLabel}
                  <ChevronRight className="h-3 w-3" />
                </button>
              ) : (
                <span className={cn("shrink-0 font-bold tabular-nums", tier.progressPercent)}>
                  {tierProgress.progressPercent}%
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
