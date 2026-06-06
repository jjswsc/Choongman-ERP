"use client"

import * as React from "react"
import { Check, Copy, Loader2, QrCode } from "lucide-react"
import type { MemberSummary } from "@/lib/members-server"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  formatPoints,
  maskPhone,
  tierVisual,
  type PortalDashboard,
} from "@/components/member-portal/portal-ui"
import { MEMBERSHIP_CARD_GOLDEN_RATIO, mpGoldText } from "@/lib/member-portal-design"

function CardChip() {
  return (
    <div
      className="pointer-events-none relative h-8 w-11 shrink-0 overflow-hidden rounded-md border border-amber-200/25 bg-gradient-to-br from-amber-100/25 via-amber-300/10 to-amber-900/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
      aria-hidden
    >
      <div className="absolute inset-y-1 left-1.5 w-px bg-amber-100/20" />
      <div className="absolute inset-y-1 left-2.5 w-px bg-amber-100/15" />
      <div className="absolute inset-y-1 left-4 w-px bg-amber-100/10" />
      <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-amber-100/12" />
    </div>
  )
}

function QrCorner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-4 w-4 border-amber-900/25 ${className}`}
      aria-hidden
    />
  )
}

function MembershipCardHeader({
  displayName,
  tier,
  tierName,
  subtitle,
  showQr,
  qrReady,
  qrLoading,
  onToggleQr,
}: {
  displayName: string
  tier: ReturnType<typeof tierVisual>
  tierName: string
  subtitle?: string
  showQr: boolean
  qrReady: boolean
  qrLoading: boolean
  onToggleQr: () => void
}) {
  const { t } = useMemberPortalLang()

  return (
    <div className="relative z-10 flex shrink-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {!showQr ? <CardChip /> : null}
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-white/45">
            {showQr ? t("membershipQrReady") : t("membership")}
          </p>
          <h2
            className={`mt-0.5 truncate text-[1.35rem] font-semibold leading-[1.15] tracking-[0.01em] ${mpGoldText}`}
            style={{ fontFamily: "var(--font-mp-display), Georgia, serif" }}
          >
            {displayName}
          </h2>
          {subtitle ? <p className="mt-1 text-[11px] tracking-wide text-white/55">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${tier.chip}`}
        >
          {tierName}
        </span>
        <button
          type="button"
          onClick={onToggleQr}
          disabled={!qrReady && !showQr}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-white backdrop-blur-md transition-all duration-300 ${
            showQr
              ? "border-amber-300/40 bg-amber-400/20 shadow-[0_0_20px_rgba(251,191,36,0.25)]"
              : "border-white/15 bg-black/30 hover:border-amber-400/30 hover:bg-black/45"
          } disabled:opacity-40`}
          aria-label={showQr ? t("hideQr") : t("showQr")}
          aria-pressed={showQr}
        >
          {qrLoading && !showQr ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-200/80" aria-hidden />
          ) : (
            <QrCode className={`h-5 w-5 transition-transform duration-300 ${showQr ? "scale-110" : ""}`} />
          )}
        </button>
      </div>
    </div>
  )
}

function StatTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.12] bg-black/30 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tracking-tight text-white ${mono ? "font-orbitron text-[0.95rem] tracking-[0.12em]" : "tabular-nums"}`}
      >
        {value}
      </p>
    </div>
  )
}

export function MemberPortalMembershipCard({
  member,
  dashboard,
  qrDataUrl,
  qrLoading = false,
  showQr,
  onToggleQr,
}: {
  member: MemberSummary
  dashboard: PortalDashboard
  qrDataUrl: string
  qrLoading?: boolean
  showQr: boolean
  onToggleQr: () => void
}) {
  const { t } = useMemberPortalLang()
  const [copied, setCopied] = React.useState(false)
  const tier = tierVisual(dashboard.tierProgress.currentTierCode)
  const displayName = member.fullName || member.name || "Member"
  const tierName = dashboard.tierProgress.currentTierName || tier.label
  const memberNoDisplay = member.memberNo || `M${member.id}`

  const copyMemberNo = React.useCallback(async () => {
    const text = String(member.memberNo || member.id || "").trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [member.id, member.memberNo])

  const cardShell = `relative h-full w-full overflow-hidden rounded-[1.6rem] border bg-gradient-to-br ${tier.gradient} shadow-[0_24px_64px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] ${tier.glow}`

  const cardTexture = (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgdHlwZT0iZnJhY3RhbE5vaXNlIiBiYXNlRnJlcXVlbmN5PSIwLjkiIG51bU9jdGF2ZXM9IjQiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InViciIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==')] opacity-70" />
      <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-amber-200/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-black/35 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          background:
            "linear-gradient(125deg, transparent 38%, rgba(255,247,230,0.55) 48%, transparent 58%)",
        }}
      />
      <div className="pointer-events-none absolute right-4 top-[42%] h-24 w-px rotate-[18deg] bg-gradient-to-b from-transparent via-amber-100/25 to-transparent" />
    </>
  )

  return (
    <div
      className={`relative w-full transition-[filter,transform] duration-500 ${showQr ? "brightness-105" : ""}`}
      style={{ perspective: "1400px" }}
    >
      <div
        className="relative w-full transition-transform duration-700 ease-[cubic-bezier(0.34,1.15,0.64,1)]"
        style={{
          aspectRatio: MEMBERSHIP_CARD_GOLDEN_RATIO,
          transformStyle: "preserve-3d",
          transform: showQr ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className={`${cardShell} absolute inset-0 border-amber-300/20`}
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          {cardTexture}
          <div className="relative flex h-full min-h-0 flex-col p-4">
            <MembershipCardHeader
              displayName={displayName}
              tier={tier}
              tierName={tierName}
              subtitle={maskPhone(member.phone)}
              showQr={false}
              qrReady={Boolean(qrDataUrl)}
              qrLoading={qrLoading}
              onToggleQr={onToggleQr}
            />

            <div className="relative mt-3 grid min-h-0 flex-1 grid-cols-2 content-center gap-2.5">
              <StatTile label={t("points")} value={formatPoints(member.pointBalance || 0)} />
              <StatTile label={t("memberNoShort")} value={memberNoDisplay} mono />
            </div>

            <div className="relative mt-2 flex shrink-0 items-center justify-between gap-2 pt-1">
              <p className="text-[9px] uppercase tracking-[0.22em] text-white/45">{t("scanAtCounter")}</p>
              <div className="flex items-center gap-1.5 text-[9px] tracking-[0.16em] text-amber-100/55">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300/80" />
                QR
              </div>
            </div>
          </div>
        </div>

        {/* Back — QR */}
        <div
          className={`${cardShell} absolute inset-0 border-amber-200/25`}
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          {cardTexture}
          <div className="relative flex h-full min-h-0 flex-col p-4">
            <MembershipCardHeader
              displayName={displayName}
              tier={tier}
              tierName={tierName}
              showQr
              qrReady={Boolean(qrDataUrl)}
              qrLoading={qrLoading}
              onToggleQr={onToggleQr}
            />

            <div className="relative mt-2 flex min-h-0 flex-1 flex-col items-center justify-center">
              <div className="relative w-full max-w-[min(100%,13.5rem)]">
                <div className="relative overflow-hidden rounded-[1.15rem] border border-amber-100/80 bg-gradient-to-b from-[#fffdf8] to-[#fff6e8] p-[clamp(0.5rem,2.8vw,0.7rem)] shadow-[0_18px_40px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.9)]">
                  <QrCorner className="left-2 top-2 border-l-2 border-t-2" />
                  <QrCorner className="right-2 top-2 border-r-2 border-t-2" />
                  <QrCorner className="bottom-2 left-2 border-b-2 border-l-2" />
                  <QrCorner className="bottom-2 right-2 border-b-2 border-r-2" />

                  <div className="relative mx-auto aspect-square w-full">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt=""
                        className="size-full object-contain transition-opacity duration-500"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-900/35" aria-hidden />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 border-t border-amber-900/8 pt-2 text-center">
                    <p className="font-orbitron text-[0.72rem] font-semibold tracking-[0.22em] text-[#2a1f0d]">
                      {memberNoDisplay}
                    </p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                      {tierName}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-2.5 max-w-[16rem] text-center text-[10px] leading-relaxed tracking-wide text-white/55">
                {t("membershipQrHint")}
              </p>

              <button
                type="button"
                onClick={() => void copyMemberNo()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/25 px-3 py-1.5 text-[10px] font-medium tracking-wide text-white/75 transition hover:border-amber-300/25 hover:bg-black/35 hover:text-white"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-300" />
                    {t("memberNoCopied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    {t("copyMemberNo")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute -inset-x-2 -bottom-3 h-8 rounded-[50%] bg-black/45 blur-2xl transition-opacity duration-500"
        style={{ opacity: showQr ? 0.65 : 0.45 }}
        aria-hidden
      />
    </div>
  )
}
