"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarDays,
  Megaphone,
  RotateCw,
  Tag,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingSubnav } from "@/components/marketing/marketing-subnav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingCampaignCosts,
  type MarketingCampaign,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"

function touchesToday(c: MarketingCampaign, today: string): boolean {
  const s = (c.startDate ?? c.designStartDate ?? "").trim()
  const e = (c.endDate ?? c.designEndDate ?? "").trim()
  if (!s && !e) return c.status === "ongoing"
  const from = s || "1970-01-01"
  const to = e || s || "2999-12-31"
  return today >= from && today <= to
}

export function MarketingHomePanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const today = React.useMemo(() => getBangkokTodayDateString(), [])

  const [loading, setLoading] = React.useState(true)
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [overBudgetCount, setOverBudgetCount] = React.useState(0)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const list = await getMarketingCampaigns()
      const rows = Array.isArray(list) ? list : []
      setCampaigns(rows)
      const withBudget = rows.filter((c) => (c.budgetTotal ?? 0) > 0)
      const costs = await Promise.all(
        withBudget.slice(0, 40).map(async (c) => {
          const r = await getMarketingCampaignCosts(c.id).catch(() => null)
          const budget = c.budgetTotal ?? 0
          const actual = r?.totalCosts ?? 0
          return budget > 0 && actual > budget
        })
      )
      setOverBudgetCount(costs.filter(Boolean).length)
    } catch {
      setCampaigns([])
      setOverBudgetCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const ongoing = campaigns.filter((c) => c.status === "ongoing")
  const todayActive = campaigns.filter((c) => touchesToday(c, today))
  const recentOngoing = ongoing.slice(0, 5)

  const quickLinks = [
    { href: "/admin/marketing/campaigns", label: t("adminMarketingCampaigns"), icon: Megaphone },
    { href: "/admin/marketing/promos", label: t("adminMarketingPromos"), icon: Tag },
    { href: "/admin/marketing/ads", label: t("adminMarketingAds"), icon: TrendingUp },
    { href: "/admin/marketing/calendar", label: t("adminMarketingCalendar"), icon: CalendarDays },
    { href: "/admin/marketing/report?tab=performance", label: t("marketingReportTabPerformance"), icon: TrendingUp },
  ] as const

  return (
    <>
      <MarketingPageHero
        icon={Megaphone}
        title={t("marketingHomeTitle")}
        description={t("marketingHomeDesc")}
        badge={
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t("marketingHomeBangkokBadge")}
          </span>
        }
        actions={
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void load()} disabled={loading}>
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh")}
          </Button>
        }
      />
      <MarketingSubnav />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatOngoing")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : ongoing.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatToday")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : todayActive.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatTotal")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : campaigns.length}</div>
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-3",
            overBudgetCount > 0 ? "border-destructive/40 bg-destructive/5" : "bg-card"
          )}
        >
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {overBudgetCount > 0 ? <AlertTriangle className="h-3 w-3 text-destructive" /> : null}
            {t("marketingHomeStatOverBudget")}
          </div>
          <div className={cn("text-2xl font-semibold tabular-nums", overBudgetCount > 0 && "text-destructive")}>
            {loading ? "…" : overBudgetCount}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("marketingHomeQuickLinks")}</h2>
          <div className="flex flex-wrap gap-2">
            {quickLinks.map(({ href, label, icon: Icon }) => (
              <Button key={href} variant="outline" size="sm" className="h-9 gap-1.5" asChild>
                <Link href={href}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t("marketingHomeRecentOngoing")}</h2>
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link href="/admin/marketing/campaigns">{t("marketingHomeViewAll")}</Link>
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : recentOngoing.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("marketingHomeNoOngoing")}</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {recentOngoing.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {c.campaignNo ? (
                        <span className="font-mono text-xs text-primary">[{c.campaignNo}] </span>
                      ) : null}
                      {c.topic}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(c.startDate || "—") + " ~ " + (c.endDate || "—")}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" className="h-8 shrink-0 text-xs" asChild>
                    <Link href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(c.id)}`}>
                      {t("posEdit")}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
