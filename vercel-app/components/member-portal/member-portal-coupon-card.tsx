"use client"

import * as React from "react"
import { Copy, MapPin, Sparkles, Ticket } from "lucide-react"
import { MemberPortalCouponQrButton } from "@/components/member-portal/member-portal-coupon-qr-sheet"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import { formatDateTime } from "@/components/member-portal/portal-ui"
import type { LangCode } from "@/lib/lang-context"
import { memberPortalCouponStatusLabel, type MemberPortalKey } from "@/lib/member-portal-i18n"
import { resolveCouponBenefitDisplay } from "@/lib/member-portal-coupon-display"
import { MP_PAGE_BG } from "@/lib/member-portal-design"
import { cn } from "@/lib/utils"

type MemberPortalCouponCardProps = {
  coupon: PortalCouponRow
  memberNo: string
  lang: LangCode
  dateLocale: string
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
}

function CouponNotch({ side }: { side: "top" | "bottom" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 z-[2] h-[1.2rem] w-[1.2rem] -translate-x-1/2 rounded-full",
        side === "top" ? "-top-[0.6rem]" : "-bottom-[0.6rem]"
      )}
      style={{ backgroundColor: MP_PAGE_BG }}
      aria-hidden
    />
  )
}

function CouponStubTexture() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJnoiPjxmZVR1cmJ1bGVuY2UgdHlwZT0iZnJhY3RhbE5vaXNlIiBiYXNlRnJlcXVlbmN5PSIwLjkiIG51bU9jdGF2ZXM9IjQiLz48L2ZpbHRlcj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWx0ZXI9InViciIgb3BhY2l0eT0iMC4wNCIvPjwvc3ZnPg==')] opacity-60" />
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-amber-200/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 h-20 w-20 rounded-full bg-black/25 blur-xl" />
    </>
  )
}

function CouponCopyButton({
  text,
  label,
  copiedLabel,
}: {
  text: string
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = React.useState(false)

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-900/10 bg-white/90 px-3 py-1.5 text-xs font-medium text-amber-950 shadow-sm transition hover:border-amber-400/40 hover:bg-amber-50"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          /* ignore */
        }
      }}
    >
      <Copy className="h-3.5 w-3.5 text-amber-700" />
      {copied ? copiedLabel : label}
    </button>
  )
}

export function MemberPortalCouponCard({ coupon, memberNo, lang, dateLocale, t }: MemberPortalCouponCardProps) {
  const isActive = coupon.status === "issued"
  const benefit = resolveCouponBenefitDisplay(coupon)
  const statusLabel = memberPortalCouponStatusLabel(lang, coupon.status)
  const displayName =
    coupon.couponName && coupon.couponName !== coupon.couponCode ? coupon.couponName : t("couponBenefit")
  const expiresRaw = coupon.expiresAt || coupon.validTo || ""
  const storeScope = Array.isArray(coupon.issuedStoreScope) ? coupon.issuedStoreScope : []
  const minOrderAmt = Math.max(0, Number(coupon.minOrderAmt || 0))

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-[18px] border border-amber-900/[0.08] shadow-[0_12px_36px_rgba(42,31,13,0.14)] transition",
        isActive ? "hover:shadow-[0_16px_44px_rgba(42,31,13,0.18)]" : "opacity-[0.78] saturate-[0.65]"
      )}
    >
      {!isActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="rotate-[-14deg] rounded-xl border-2 border-stone-400/35 bg-white/55 px-5 py-1.5 text-sm font-bold uppercase tracking-[0.28em] text-stone-500 backdrop-blur-[1px]">
            {statusLabel}
          </span>
        </div>
      ) : null}

      <div className="flex min-h-[9.25rem]">
        <div className="relative flex w-[31%] min-w-[5.75rem] shrink-0 flex-col items-center justify-center bg-gradient-to-br from-[#1f1608] via-[#3d2a14] to-[#7a5c18] px-2 py-4 text-center">
          <CouponStubTexture />
          <Ticket className="relative mb-1.5 h-4 w-4 text-amber-300/55" aria-hidden />
          <p className="relative text-[9px] font-bold uppercase tracking-[0.28em] text-amber-200/75">{benefit.badge}</p>
          <p className="relative mt-1 bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-[1.65rem] font-extrabold leading-none tracking-tight text-transparent">
            {benefit.headline}
          </p>
          {benefit.subline ? (
            <p className="relative mt-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-100/60">
              {benefit.subline}
            </p>
          ) : null}
        </div>

        <div className="relative w-0 shrink-0">
          <CouponNotch side="top" />
          <CouponNotch side="bottom" />
          <div className="absolute bottom-4 top-4 w-px border-l border-dashed border-amber-900/18" />
        </div>

        <div className="relative min-w-0 flex-1 bg-gradient-to-br from-white via-[#fffdf8] to-amber-50/80 px-4 py-3.5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-200/25 blur-2xl" />
          <div className="relative flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-bold leading-snug text-stone-900">{displayName}</p>
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.18em] text-amber-900">
                <Sparkles className="h-3 w-3 shrink-0 text-amber-600" aria-hidden />
                {coupon.couponCode}
              </p>
            </div>
            {isActive ? (
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
                {statusLabel}
              </span>
            ) : null}
          </div>

          <div className="relative mt-3 space-y-1 text-[11px] text-stone-600">
            <p>
              <span className="text-stone-400">{t("issuedAt")}</span>{" "}
              <span className="font-medium text-stone-700">{formatDateTime(coupon.issuedAt, dateLocale)}</span>
            </p>
            {expiresRaw ? (
              <p>
                <span className="text-stone-400">{t("couponExpiresAt")}</span>{" "}
                <span className="font-medium text-amber-900">{formatDateTime(expiresRaw, dateLocale)}</span>
              </p>
            ) : null}
            {minOrderAmt > 0 ? (
              <p>
                <span className="text-stone-400">{t("couponMinOrder")}</span>{" "}
                <span className="font-medium text-stone-700">฿{Math.round(minOrderAmt)}</span>
              </p>
            ) : null}
            {coupon.campaignName ? (
              <p className="line-clamp-1">
                <span className="text-stone-400">{t("couponCampaign")}</span>{" "}
                <span className="font-medium text-stone-700">{coupon.campaignName}</span>
              </p>
            ) : null}
            {storeScope.length > 0 ? (
              <p className="flex items-start gap-1 line-clamp-2">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-amber-700/70" aria-hidden />
                <span>
                  <span className="text-stone-400">{t("couponScope")}</span>{" "}
                  <span className="font-medium text-stone-700">{storeScope.join(", ")}</span>
                </span>
              </p>
            ) : null}
          </div>

          {isActive ? (
            <div className="relative mt-3.5 flex flex-wrap items-center gap-2">
              <MemberPortalCouponQrButton
                memberNo={memberNo}
                couponCode={coupon.couponCode}
                couponName={coupon.couponName}
                issueId={coupon.id}
                variant="light"
              />
              <CouponCopyButton text={coupon.couponCode} label={t("copyCode")} copiedLabel={t("copied")} />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
