"use client"

import { Cake, Crown, Percent, Ticket } from "lucide-react"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { resolveCouponBenefitDisplay } from "@/lib/member-portal-coupon-display"
import { MP_HOME_CARD_RADIUS, MP_HOME_PRIVILEGE_CARD_WIDTH } from "@/lib/member-portal-home-layout"
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
  const issued = coupons.filter((c) => c.status === "issued").slice(0, 6)
  if (!issued.length) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`text-[15px] font-bold tracking-tight ${MP_TEXT_PRIMARY}`}>{t("homeSpecialPrivileges")}</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 text-xs font-semibold text-amber-700 transition hover:text-amber-800"
        >
          {t("homeViewAll")}
        </button>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className={`flex ${MP_HOME_PRIVILEGE_CARD_WIDTH} shrink-0 snap-start flex-col items-center ${MP_HOME_CARD_RADIUS} border border-amber-100/80 bg-[#fff8ef] px-2.5 py-3.5 text-center shadow-[0_2px_12px_rgba(42,31,13,0.05)] transition hover:border-amber-200 hover:bg-white active:scale-[0.98]`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />
              </span>
              <p className={`mt-2 line-clamp-2 min-h-[2.5rem] text-[11px] font-semibold leading-snug ${MP_TEXT_PRIMARY}`}>
                {title}
              </p>
              <p className={`mt-0.5 line-clamp-2 text-[10px] leading-snug ${MP_TEXT_SECONDARY}`}>{subtitle}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
