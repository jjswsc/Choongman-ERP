"use client"

import * as React from "react"
import Image from "next/image"
import { CalendarDays, Loader2, Ticket } from "lucide-react"
import type { PortalCouponOfferRow } from "@/lib/member-portal-coupon-claim"
import { resolveCouponBenefitDisplay } from "@/lib/member-portal-coupon-display"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import { formatDateTime } from "@/components/member-portal/portal-ui"
import type { LangCode } from "@/lib/lang-context"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { cn } from "@/lib/utils"

type MemberPortalCouponOfferCardProps = {
  offer: PortalCouponOfferRow
  lang: LangCode
  dateLocale: string
  claiming?: boolean
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
  onClaim: (couponCode: string) => void
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

export function MemberPortalCouponOfferCard({
  offer,
  dateLocale,
  claiming = false,
  t,
  onClaim,
}: MemberPortalCouponOfferCardProps) {
  const benefit = resolveCouponBenefitDisplay(offer as unknown as PortalCouponRow)
  const portalImageUrl = String(offer.portalImageUrl || "").trim()
  const expiresRaw = offer.validTo || ""
  const disabled = offer.status !== "claimable" || claiming

  const actionLabel = (() => {
    if (offer.status === "active_in_wallet") return t("couponOfferInWallet")
    if (offer.status === "max_claims_reached") return t("couponOfferMaxReached")
    if (offer.status === "insufficient_points") {
      return t("couponOfferNeedPoints", { count: String(offer.pointsNeeded) })
    }
    if (offer.claimMode === "points") {
      return t("couponOfferRedeemPoints", { count: String(offer.pointCost) })
    }
    return t("couponOfferCollect")
  })()

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_8px_28px_rgba(42,31,13,0.08)]">
      <div className="relative flex">
        <div className="relative w-[7.5rem] shrink-0 overflow-hidden border-r border-stone-100 sm:w-[8.5rem]">
          {portalImageUrl ? (
            <Image
              src={portalImageUrl}
              alt=""
              width={340}
              height={340}
              className={cn(
                "h-full min-h-[7.5rem] w-full object-cover",
                disabled && offer.status === "insufficient_points" && "opacity-55"
              )}
              unoptimized
            />
          ) : (
            <CouponImageFallback headline={benefit.headline} badge={benefit.badge} />
          )}
          {offer.status === "insufficient_points" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-900/45 p-2">
              <span className="rounded-lg bg-white/90 px-2 py-1 text-center text-[10px] font-bold leading-snug text-stone-700">
                {t("couponOfferNeedPoints", { count: String(offer.pointsNeeded) })}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-3.5 py-3 sm:px-4">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-stone-900">{offer.couponName}</p>
          <p className="mt-1 text-xs font-semibold text-amber-800">{benefit.headline}</p>
          {offer.claimMode === "points" && offer.pointCost > 0 ? (
            <p className="mt-1 text-[11px] font-medium text-rose-700">
              {t("couponOfferPointCost", { count: String(offer.pointCost) })}
            </p>
          ) : null}
          {expiresRaw ? (
            <p className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] text-stone-600">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-700/70" aria-hidden />
              <span className="text-stone-400">{t("couponExpiresAt")}</span>
              <span className="font-medium text-stone-800">{formatDateTime(expiresRaw, dateLocale)}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-t border-stone-100 bg-stone-50/80 px-3.5 py-2.5 sm:px-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onClaim(offer.couponCode)}
          className={cn(
            "flex min-h-9 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
            offer.status === "claimable"
              ? "bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-sm hover:from-rose-700 hover:to-rose-600"
              : "cursor-not-allowed bg-stone-200 text-stone-500",
            claiming && "opacity-70"
          )}
        >
          {claiming ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {actionLabel}
        </button>
      </div>
    </article>
  )
}
