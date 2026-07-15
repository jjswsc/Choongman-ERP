"use client"

import * as React from "react"
import { ArrowRight, Percent, Sparkles, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { resolveTierFamily, type TierFamily } from "@/lib/member-portal-tier-visual"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { formatTierRatePercentInput } from "@/lib/member-tier-rate-percent"

type TierRow = {
  code: string
  name: string
  min_amount: number
  min_points: number
  point_rate: number
  discount_rate: number
  sort_order: number
}

/** 관리자 화면용 라이트 톤 (회원앱 다크 카드와 구분) */
const ADMIN_TIER_TONE: Record<
  TierFamily,
  { card: string; badge: string; icon: string; bar: string; accent: string }
> = {
  bronze: {
    card: "border-amber-300/70 bg-gradient-to-br from-amber-50 via-orange-50/70 to-white",
    badge: "bg-amber-700/15 text-amber-900 ring-amber-700/20",
    icon: "bg-amber-600/15 text-amber-800",
    bar: "from-amber-600 to-amber-400",
    accent: "text-amber-800",
  },
  silver: {
    card: "border-slate-300/80 bg-gradient-to-br from-slate-50 via-zinc-50 to-white",
    badge: "bg-slate-500/15 text-slate-800 ring-slate-400/25",
    icon: "bg-slate-400/20 text-slate-700",
    bar: "from-slate-500 to-slate-300",
    accent: "text-slate-700",
  },
  gold: {
    card: "border-yellow-300/80 bg-gradient-to-br from-yellow-50 via-amber-50/80 to-white",
    badge: "bg-yellow-500/20 text-yellow-900 ring-yellow-500/25",
    icon: "bg-yellow-400/25 text-yellow-800",
    bar: "from-yellow-600 to-amber-400",
    accent: "text-yellow-800",
  },
  platinum: {
    card: "border-sky-300/70 bg-gradient-to-br from-sky-50 via-slate-50 to-white",
    badge: "bg-sky-500/15 text-sky-900 ring-sky-400/25",
    icon: "bg-sky-400/20 text-sky-800",
    bar: "from-sky-600 to-sky-300",
    accent: "text-sky-800",
  },
  diamond: {
    card: "border-violet-300/70 bg-gradient-to-br from-violet-50 via-fuchsia-50/50 to-white",
    badge: "bg-violet-500/15 text-violet-900 ring-violet-400/25",
    icon: "bg-violet-400/20 text-violet-800",
    bar: "from-violet-600 to-fuchsia-400",
    accent: "text-violet-800",
  },
  vip: {
    card: "border-rose-300/70 bg-gradient-to-br from-rose-50 via-red-50/60 to-white",
    badge: "bg-rose-500/15 text-rose-900 ring-rose-400/25",
    icon: "bg-rose-400/20 text-rose-800",
    bar: "from-rose-600 to-rose-400",
    accent: "text-rose-800",
  },
  default: {
    card: "border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white",
    badge: "bg-amber-500/15 text-amber-900 ring-amber-400/20",
    icon: "bg-amber-500/15 text-amber-800",
    bar: "from-amber-500 to-orange-400",
    accent: "text-amber-800",
  },
}

export function CrmTierLadder({ rows, upgradeBasis }: { rows: TierRow[]; upgradeBasis: "amount" | "points" }) {
  const { lang } = useLang()
  const t = useT(lang)
  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [rows]
  )
  if (!sorted.length) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-950">{t("crmPointsTierLadder")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("crmPointsTierLadderHint")}</p>
          </div>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80">
          {upgradeBasis === "amount" ? t("memberTierUpgradeBasisAmount") : t("memberTierUpgradeBasisPoints")}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {sorted.map((tier, idx) => {
          const family = resolveTierFamily(tier.code)
          const tone = ADMIN_TIER_TONE[family]
          const isTop = idx === sorted.length - 1
          return (
            <React.Fragment key={tier.code}>
              <div
                className={cn(
                  "relative flex-1 rounded-xl border p-3.5 shadow-sm transition hover:shadow-md",
                  tone.card,
                  isTop && "ring-2 ring-amber-400/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.icon)}>
                      <Star className="h-4 w-4" fill="currentColor" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("truncate font-semibold", tone.accent)}>{tier.name || tier.code}</p>
                      <span
                        className={cn(
                          "mt-0.5 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ring-1",
                          tone.badge
                        )}
                      >
                        {tier.code}
                      </span>
                    </div>
                  </div>
                  {isTop ? (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      TOP
                    </span>
                  ) : null}
                </div>

                <div className={cn("mt-3 h-1 rounded-full bg-gradient-to-r opacity-80", tone.bar)} />

                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {upgradeBasis === "amount" ? t("memberTierMinAmount") : t("memberTierMinPoints")}
                    </dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {upgradeBasis === "amount"
                        ? Number(tier.min_amount || 0).toLocaleString()
                        : Number(tier.min_points || 0).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <Percent className="h-3 w-3" />
                      {t("memberTierPointRate")}
                    </dt>
                    <dd className="font-semibold tabular-nums text-emerald-700">
                      {formatTierRatePercentInput(tier.point_rate)}%
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{t("memberTierDiscountRate")}</dt>
                    <dd className="font-semibold tabular-nums text-orange-700">
                      {formatTierRatePercentInput(tier.discount_rate)}%
                    </dd>
                  </div>
                </dl>
              </div>
              {idx < sorted.length - 1 ? (
                <div className="flex items-center justify-center text-amber-400 sm:px-0.5" aria-hidden>
                  <ArrowRight className="hidden h-4 w-4 sm:block" />
                  <div className="h-4 w-px bg-amber-200 sm:hidden" />
                </div>
              ) : null}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
