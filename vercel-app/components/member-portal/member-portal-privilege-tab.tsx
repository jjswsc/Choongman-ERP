"use client"

import * as React from "react"
import { CalendarDays, Gift, History, Loader2, Sparkles, Star, Ticket } from "lucide-react"
import type { LangCode } from "@/lib/lang-context"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { MP_CARD_TEXT_MUTED, MP_CARD_TEXT_PRIMARY, MP_CARD_TEXT_SECONDARY, MP_CARD_TEXT_SUBTLE } from "@/lib/member-portal-design"
import {
  GlassCard,
  SectionTitle,
} from "@/components/member-portal/member-portal-premium-ui"
import { MemberPortalCouponCard } from "@/components/member-portal/member-portal-coupon-card"
import { MemberPortalCouponOfferCard } from "@/components/member-portal/member-portal-coupon-offer-card"
import { MemberPortalStampCard } from "@/components/member-portal/member-portal-stamp-card"
import { MemberPortalTierEntryButton } from "@/components/member-portal/member-portal-tier-guide"
import type { MemberStampCardStatus } from "@/lib/member-stamp-card"
import type { PortalCouponOfferRow } from "@/lib/member-portal-coupon-claim"
import {
  formatBaht,
  formatDateTime,
  formatVisitDateTimeCompact,
  formatPoints,
  type PortalCouponRow,
  type PortalDashboard,
  type PortalPointRow,
  type PortalVisitRow,
} from "@/components/member-portal/portal-ui"
import { memberPortalPointKindLabel } from "@/lib/member-portal-i18n"
import { cn } from "@/lib/utils"

type PrivilegeSection = "coupons" | "benefits" | "history"
type CouponWalletTab = "offers" | "wallet"
type CouponFilter = "active" | "used" | "all"

type MemberPortalPrivilegeTabProps = {
  lang: LangCode
  dateLocale: string
  memberNo: string
  member: { id: number; memberNo: string; pointBalance?: number; tierPoints?: number }
  dashboard: PortalDashboard
  coupons: PortalCouponRow[]
  offers: PortalCouponOfferRow[]
  offersLoading?: boolean
  claimingCode?: string | null
  visits: PortalVisitRow[]
  points: PortalPointRow[]
  stampStatus: MemberStampCardStatus | null
  stampLoading: boolean
  stampFoodImageUrl: string
  portalTiersCount: number
  pointRetentionYears?: number
  onOpenTierBenefits: () => void
  onClaimOffer: (couponCode: string) => void
  onPointBalanceChange?: (balance: number) => void
  stores: Array<{ storeCode: string; displayName?: string }>
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
}

function PrivilegeSegment({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition",
        active
          ? "bg-white text-amber-900 shadow-sm ring-1 ring-amber-200/80"
          : "text-stone-500 hover:bg-white/60 hover:text-stone-700"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )
}

function CouponFilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-amber-400/70 bg-amber-50 text-amber-900"
          : "border-stone-200/80 bg-white/70 text-stone-600 hover:border-amber-200"
      )}
    >
      {label}
      {count > 0 ? <span className="ml-1 tabular-nums opacity-70">({count})</span> : null}
    </button>
  )
}

export function MemberPortalPrivilegeTab({
  lang,
  dateLocale,
  memberNo,
  member,
  dashboard,
  coupons,
  offers,
  offersLoading = false,
  claimingCode = null,
  visits,
  points,
  stampStatus,
  stampLoading,
  stampFoodImageUrl,
  portalTiersCount,
  pointRetentionYears = 2,
  onOpenTierBenefits,
  onClaimOffer,
  stores,
  t,
}: MemberPortalPrivilegeTabProps) {
  const [section, setSection] = React.useState<PrivilegeSection>("coupons")
  const [walletTab, setWalletTab] = React.useState<CouponWalletTab>("offers")
  const [couponFilter, setCouponFilter] = React.useState<CouponFilter>("active")

  const activeCoupons = React.useMemo(
    () => coupons.filter((c) => c.status === "issued"),
    [coupons]
  )
  const usedCoupons = React.useMemo(
    () => coupons.filter((c) => c.status !== "issued"),
    [coupons]
  )
  const claimableOffers = React.useMemo(
    () => offers.filter((o) => o.status === "claimable"),
    [offers]
  )

  const filteredCoupons = React.useMemo(() => {
    if (couponFilter === "active") return activeCoupons
    if (couponFilter === "used") return usedCoupons
    return coupons
  }, [couponFilter, activeCoupons, usedCoupons, coupons])

  const storeName = (code: string) =>
    stores.find((s) => s.storeCode === code)?.displayName || t("store")

  return (
    <div className="space-y-4">
      <SectionTitle title={t("privilegeTitle")} />

      <GlassCard soft className="overflow-hidden p-0">
        <div className="bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 px-4 py-4 text-white">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-50/90">
            {t("availablePoints")}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{formatPoints(member.pointBalance || 0)}</p>
          <p className="mt-2 text-xs text-amber-50/85">
            {t("cumulativeTierPoints")}{" "}
            <span className="font-semibold text-white">
              {formatPoints(member.tierPoints ?? dashboard.stats.tierQualificationPoints ?? 0)}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-stone-200/80 border-t border-stone-200/60 bg-white/80">
          <div className="px-3 py-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${MP_CARD_TEXT_PRIMARY}`}>
              {activeCoupons.length}
            </p>
            <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wide ${MP_CARD_TEXT_SUBTLE}`}>
              {t("statCoupons")}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${MP_CARD_TEXT_PRIMARY}`}>
              {claimableOffers.length}
            </p>
            <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wide ${MP_CARD_TEXT_SUBTLE}`}>
              {t("couponOffersAvailable")}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className={`text-lg font-bold tabular-nums ${MP_CARD_TEXT_PRIMARY}`}>
              {dashboard.stats.visitCount}
            </p>
            <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-wide ${MP_CARD_TEXT_SUBTLE}`}>
              {t("statVisits")}
            </p>
          </div>
        </div>
      </GlassCard>

      <div className="flex gap-1.5 rounded-2xl border border-stone-200/70 bg-stone-100/60 p-1">
        <PrivilegeSegment
          active={section === "coupons"}
          label={t("privilegeTabCoupons")}
          icon={Ticket}
          onClick={() => setSection("coupons")}
        />
        <PrivilegeSegment
          active={section === "benefits"}
          label={t("privilegeTabBenefits")}
          icon={Gift}
          onClick={() => setSection("benefits")}
        />
        <PrivilegeSegment
          active={section === "history"}
          label={t("privilegeTabHistory")}
          icon={History}
          onClick={() => setSection("history")}
        />
      </div>

      {section === "coupons" ? (
        <div className="space-y-3">
          <div className="flex gap-1.5 rounded-xl border border-stone-200/70 bg-white/70 p-1">
            <button
              type="button"
              onClick={() => setWalletTab("offers")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition",
                walletTab === "offers"
                  ? "bg-amber-100 text-amber-900"
                  : "text-stone-500 hover:bg-stone-50"
              )}
            >
              {t("couponTabOffers")}
              {offers.length > 0 ? (
                <span className="ml-1 tabular-nums opacity-70">({offers.length})</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setWalletTab("wallet")}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition",
                walletTab === "wallet"
                  ? "bg-emerald-100 text-emerald-900"
                  : "text-stone-500 hover:bg-stone-50"
              )}
            >
              {t("couponTabWallet")}
              {activeCoupons.length > 0 ? (
                <span className="ml-1 tabular-nums opacity-70">({activeCoupons.length})</span>
              ) : null}
            </button>
          </div>

          {walletTab === "offers" ? (
            offersLoading ? (
              <GlassCard soft className={`flex items-center justify-center gap-2 px-5 py-12 ${MP_CARD_TEXT_MUTED}`}>
                <Loader2 className="h-5 w-5 animate-spin text-amber-500" aria-hidden />
                {t("loginChecking")}
              </GlassCard>
            ) : offers.length === 0 ? (
              <GlassCard soft className={`px-5 py-12 text-center ${MP_CARD_TEXT_MUTED}`}>
                <Sparkles className="mx-auto mb-3 h-8 w-8 text-amber-300/80" aria-hidden />
                {t("noCouponOffers")}
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {offers.map((offer) => (
                  <MemberPortalCouponOfferCard
                    key={offer.couponCode}
                    offer={offer}
                    lang={lang}
                    dateLocale={dateLocale}
                    claiming={claimingCode === offer.couponCode}
                    t={t}
                    onClaim={onClaimOffer}
                  />
                ))}
              </div>
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <CouponFilterPill
                  active={couponFilter === "active"}
                  label={t("couponFilterActive")}
                  count={activeCoupons.length}
                  onClick={() => setCouponFilter("active")}
                />
                <CouponFilterPill
                  active={couponFilter === "used"}
                  label={t("couponFilterUsed")}
                  count={usedCoupons.length}
                  onClick={() => setCouponFilter("used")}
                />
                <CouponFilterPill
                  active={couponFilter === "all"}
                  label={t("couponFilterAll")}
                  count={coupons.length}
                  onClick={() => setCouponFilter("all")}
                />
              </div>

              {filteredCoupons.length === 0 ? (
                <GlassCard soft className={`px-5 py-12 text-center ${MP_CARD_TEXT_MUTED}`}>
                  {t("noCoupons")}
                </GlassCard>
              ) : (
                <div className="space-y-3">
                  {filteredCoupons.map((c) => (
                    <MemberPortalCouponCard
                      key={c.id}
                      coupon={c}
                      memberNo={memberNo}
                      lang={lang}
                      dateLocale={dateLocale}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {section === "benefits" ? (
        <div className="space-y-3">
          <MemberPortalStampCard
            lang={lang}
            memberId={member.id}
            status={stampStatus}
            loading={stampLoading}
            foodImageUrl={stampFoodImageUrl}
            onGoCoupons={() => {
              setSection("coupons")
              setWalletTab("offers")
            }}
          />
          <GlassCard soft className={`px-4 py-3 ${MP_CARD_TEXT_SUBTLE}`}>
            <p className={`text-xs font-semibold ${MP_CARD_TEXT_SECONDARY}`}>{t("tierPointExpiryPolicyTitle")}</p>
            <p className={`mt-1.5 text-xs leading-relaxed ${MP_CARD_TEXT_MUTED}`}>
              {t("tierPointExpiryPolicyDesc", { years: String(pointRetentionYears) })}
            </p>
          </GlassCard>
          {portalTiersCount > 0 ? (
            <MemberPortalTierEntryButton
              title={t("tierBenefitsTitle")}
              description={t("tierBenefitsDesc")}
              onClick={onOpenTierBenefits}
            />
          ) : null}
        </div>
      ) : null}

      {section === "history" ? (
        <div className="space-y-5">
          <div>
            <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${MP_CARD_TEXT_SECONDARY}`}>
              <Star className="h-4 w-4 text-amber-600" aria-hidden />
              {t("recentOrders")}
            </h3>
            <div className="space-y-2">
              {visits.length === 0 ? (
                <GlassCard soft className={`px-5 py-10 text-center ${MP_CARD_TEXT_MUTED}`}>
                  {t("noOrders")}
                </GlassCard>
              ) : (
                visits.map((v) => (
                  <GlassCard key={v.orderId} soft className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-sm ${MP_CARD_TEXT_PRIMARY}`}>
                        <span className="font-medium">{storeName(v.storeCode)}</span>
                        <span className={`mx-1.5 ${MP_CARD_TEXT_MUTED}`}>·</span>
                        <span className={`text-xs font-normal ${MP_CARD_TEXT_MUTED}`}>
                          {formatVisitDateTimeCompact(v.visitedAt, dateLocale)}
                        </span>
                      </p>
                      <p className={`shrink-0 text-sm font-semibold tabular-nums ${MP_CARD_TEXT_PRIMARY}`}>
                        {formatBaht(v.total)}
                      </p>
                    </div>
                  </GlassCard>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${MP_CARD_TEXT_SECONDARY}`}>
              <CalendarDays className="h-4 w-4 text-rose-600" aria-hidden />
              {t("pointsHistory")}
            </h3>
            <div className="space-y-2">
              {points.length === 0 ? (
                <GlassCard soft className={`px-5 py-10 text-center ${MP_CARD_TEXT_MUTED}`}>
                  {t("noPoints")}
                </GlassCard>
              ) : (
                points.map((p) => (
                  <GlassCard key={p.id} soft className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`font-medium ${p.points >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {p.points >= 0 ? "+" : ""}
                          {formatPoints(p.points)}
                        </p>
                        <p className={`text-xs ${MP_CARD_TEXT_MUTED}`}>
                          {memberPortalPointKindLabel(lang, p.kind)} · {p.note || "-"}
                        </p>
                      </div>
                      <p className={`text-xs ${MP_CARD_TEXT_MUTED}`}>
                        {formatDateTime(p.createdAt, dateLocale)}
                      </p>
                    </div>
                  </GlassCard>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
