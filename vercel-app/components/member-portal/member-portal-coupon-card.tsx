"use client"

import * as React from "react"
import Image from "next/image"
import { CalendarDays, Copy, MapPin, Ticket } from "lucide-react"
import { MemberPortalCouponQrButton } from "@/components/member-portal/member-portal-coupon-qr-sheet"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import { formatDateTime } from "@/components/member-portal/portal-ui"
import type { LangCode } from "@/lib/lang-context"
import { memberPortalCouponStatusLabel, type MemberPortalKey } from "@/lib/member-portal-i18n"
import { resolveCouponBenefitDisplay } from "@/lib/member-portal-coupon-display"
import { cn } from "@/lib/utils"

type MemberPortalCouponCardProps = {
  coupon: PortalCouponRow
  memberNo: string
  lang: LangCode
  dateLocale: string
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
}

function CouponCopyButton({
  text,
  label,
  copiedLabel,
  className,
}: {
  text: string
  label: string
  copiedLabel: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-[10px] font-semibold leading-none text-stone-600 transition hover:border-amber-300 hover:text-amber-900",
        className
      )}
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
      <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{copied ? copiedLabel : label}</span>
    </button>
  )
}

function CouponImageFallback({ headline, badge }: { headline: string; badge: string }) {
  return (
    <div className="relative flex h-full min-h-[7.5rem] w-full flex-col items-center justify-center bg-gradient-to-br from-[#1f1608] via-[#3d2a14] to-[#7a5c18] px-2 py-3 text-center">
      <Ticket className="mb-1 h-4 w-4 text-amber-300/55" aria-hidden />
      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-200/75">{badge}</p>
      <p className="mt-1 bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-xl font-extrabold leading-none text-transparent">
        {headline}
      </p>
    </div>
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
  const portalImageUrl = String(coupon.portalImageUrl || "").trim()

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_8px_28px_rgba(42,31,13,0.08)] transition",
        isActive ? "hover:shadow-[0_12px_32px_rgba(42,31,13,0.12)]" : "opacity-75 saturate-[0.7]"
      )}
    >
      {!isActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="rotate-[-12deg] rounded-lg border-2 border-stone-400/35 bg-white/60 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-stone-500 backdrop-blur-[1px]">
            {statusLabel}
          </span>
        </div>
      ) : null}

      <div className="relative flex">
        <div className="relative w-[7.5rem] shrink-0 overflow-hidden border-r border-stone-100 sm:w-[8.5rem]">
          {portalImageUrl ? (
            <Image
              src={portalImageUrl}
              alt=""
              width={340}
              height={340}
              className="h-full min-h-[7.5rem] w-full object-cover"
              unoptimized
            />
          ) : (
            <CouponImageFallback headline={benefit.headline} badge={benefit.badge} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-3.5 py-3 sm:px-4">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-bold leading-snug text-stone-900">{displayName}</p>
            <p className="mt-1 text-xs font-semibold text-amber-800">{benefit.headline}</p>
            {benefit.subline ? (
              <p className="mt-0.5 text-[11px] text-stone-500">{benefit.subline}</p>
            ) : null}
          </div>

          {isActive ? (
            <div className="mt-2.5 flex items-center gap-1.5">
              <MemberPortalCouponQrButton
                memberNo={memberNo}
                couponCode={coupon.couponCode}
                couponName={coupon.couponName}
                issueId={coupon.id}
                variant="light"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border border-rose-200/80 bg-gradient-to-r from-rose-600 to-rose-500 px-2 text-[10px] font-semibold leading-none text-white shadow-sm hover:from-rose-700 hover:to-rose-600"
              />
              <CouponCopyButton text={coupon.couponCode} label={t("copyCode")} copiedLabel={t("copied")} />
              <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-800 ring-1 ring-emerald-200/80">
                {statusLabel}
              </span>
            </div>
          ) : null}

          <div className="mt-auto space-y-1 pt-2 text-[11px] text-stone-600">
            {expiresRaw ? (
              <p className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-700/70" aria-hidden />
                <span className="text-stone-400">{t("couponExpiresAt")}</span>
                <span className="font-medium text-stone-800">{formatDateTime(expiresRaw, dateLocale)}</span>
              </p>
            ) : null}
            {minOrderAmt > 0 ? (
              <p>
                <span className="text-stone-400">{t("couponMinOrder")}</span>{" "}
                <span className="font-medium text-stone-700">฿{Math.round(minOrderAmt)}</span>
              </p>
            ) : null}
            {storeScope.length > 0 ? (
              <p className="flex items-start gap-1 line-clamp-2">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-amber-700/70" aria-hidden />
                <span className="font-medium text-stone-700">{storeScope.join(", ")}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}
