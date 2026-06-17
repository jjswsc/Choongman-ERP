"use client"

import { Cake, ChevronRight, Crown, Percent, Ticket } from "lucide-react"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { resolveCouponBenefitDisplay } from "@/lib/member-portal-coupon-display"
import { MP_HOME_CARD_RADIUS } from "@/lib/member-portal-home-layout"
import { MP_TEXT_PRIMARY, MP_TEXT_SECONDARY } from "@/lib/member-portal-design"

type MemberPortalHomePrivilegesProps = {
  coupons: PortalCouponRow[]
  t: (key: MemberPortalKey) => string
  onViewAll: () => void
}

const PRIVILEGE_ICONS = [Percent, Cake, Crown, Ticket]

function privilegeIcon(index: number) {
  return PRIVILEGE_ICONS[index % PRIVILEGE_ICONS.length]
}

export function MemberPortalHomePrivileges({ coupons, t, onViewAll }: MemberPortalHomePrivilegesProps) {
  const issued = coupons.filter((c) => c.status === "issued").slice(0, 3)
  if (!issued.length) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`text-[15px] font-bold tracking-tight ${MP_TEXT_PRIMARY}`}>{t("homeSpecialPrivileges")}</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-700 transition hover:text-amber-800"
        >
          {t("homeViewAll")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {issued.map((coupon, index) => {
          const Icon = privilegeIcon(index)
          const benefit = resolveCouponBenefitDisplay(coupon)
          const title =
            coupon.couponName && coupon.couponName !== coupon.couponCode ? coupon.couponName : benefit.summary
          const subtitle = title === benefit.summary ? coupon.couponCode : benefit.summary

          return (
            <button
              key={coupon.id}
              type="button"
              onClick={onViewAll}
              className={`flex flex-col items-center ${MP_HOME_CARD_RADIUS} border border-amber-100 bg-[#fff7ed] px-2 py-4 text-center shadow-[0_2px_12px_rgba(42,31,13,0.05)] transition hover:border-amber-200 hover:bg-[#fffaf2] active:scale-[0.98]`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100/70 text-amber-600">
                <Icon className="h-[1.3rem] w-[1.3rem]" strokeWidth={1.9} />
              </span>
              <p className={`mt-2.5 line-clamp-2 min-h-[2.25rem] text-[11px] font-bold leading-snug ${MP_TEXT_PRIMARY}`}>
                {title}
              </p>
              <p className={`mt-1 line-clamp-2 text-[10px] leading-snug ${MP_TEXT_SECONDARY}`}>{subtitle}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
