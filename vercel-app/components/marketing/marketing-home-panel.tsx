"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Megaphone,
  Package,
  RotateCw,
  Store,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingInfluencers,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  useStoreList,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
  type MarketingMaterialStoreCheck,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"
import {
  countPendingInstallStores,
  isCampaignInProgress,
  listPendingDeliveries,
  listPendingInfluencers,
} from "@/lib/marketing-ops-board"
import { resolveStoreMaterialTaskPhase } from "@/lib/marketing-material-checklist-utils"
import {
  defaultMarketingMaterialTypeOptions,
  loadMarketingMaterialTypeOptions,
  resolveMaterialTypeLabel,
} from "@/lib/marketing-material-type-options"

export function MarketingHomePanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const today = React.useMemo(() => getBangkokTodayDateString(), [])
  const { formatStoreLabel } = useStoreList()
  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )
  const hqLabel = tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")

  const [loading, setLoading] = React.useState(true)
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [checks, setChecks] = React.useState<MarketingMaterialStoreCheck[]>([])
  const [influencers, setInfluencers] = React.useState<MarketingInfluencer[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [camp, mats, chk, inf] = await Promise.all([
        getMarketingCampaigns(),
        getMarketingMaterials().catch(() => []),
        getMarketingMaterialStoreChecks().catch(() => []),
        getMarketingInfluencers().catch(() => []),
      ])
      setCampaigns(Array.isArray(camp) ? camp : [])
      setMaterials(Array.isArray(mats) ? mats : [])
      setChecks(Array.isArray(chk) ? chk : [])
      setInfluencers(Array.isArray(inf) ? inf : [])
    } catch {
      setCampaigns([])
      setMaterials([])
      setChecks([])
      setInfluencers([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const typeOptions = React.useMemo(() => {
    if (typeof window === "undefined") return defaultMarketingMaterialTypeOptions()
    return loadMarketingMaterialTypeOptions()
  }, [])

  const ongoing = campaigns.filter((c) => isCampaignInProgress(c, today))
  const deliveries = React.useMemo(
    () =>
      listPendingDeliveries({
        campaigns,
        materials,
        checks,
        hqLabel,
        today,
        inProgressOnly: true,
      }),
    [campaigns, materials, checks, hqLabel, today]
  )
  const pendingInfluencers = React.useMemo(
    () =>
      listPendingInfluencers({
        influencers,
        campaigns,
        today,
        inProgressOnly: true,
      }),
    [influencers, campaigns, today]
  )
  const pendingInstall = countPendingInstallStores(deliveries)

  const phaseLabel = (phase: ReturnType<typeof resolveStoreMaterialTaskPhase>) => {
    if (phase === "waiting_production") return t("marketingMaterialChecklistWaitingProduction")
    if (phase === "receive") return t("marketingHomePhaseReceive")
    if (phase === "install") return t("marketingHomePhaseInstall")
    return t("marketingMaterialChecklistDone")
  }

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatOngoing")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : ongoing.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatPendingShip")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : deliveries.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Store className="h-3 w-3" />
            {t("marketingHomeStatPendingInstall")}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : pendingInstall}</div>
        </div>
        <div
          className={cn(
            "rounded-lg border px-3 py-3",
            pendingInfluencers.length > 0 ? "border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20" : "bg-card"
          )}
        >
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {pendingInfluencers.length > 0 ? <AlertTriangle className="h-3 w-3 text-amber-600" /> : null}
            {t("marketingHomeStatOpenInfluencers")}
          </div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : pendingInfluencers.length}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Megaphone className="h-4 w-4 text-primary" />
              {t("marketingHomeRecentOngoing")}
            </h2>
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link href="/admin/marketing/campaigns">{t("marketingHomeViewAll")}</Link>
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : ongoing.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("marketingHomeNoOngoing")}</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {ongoing.slice(0, 8).map((c) => (
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
                    <Link href={marketingCampaignWorkspaceHref(c.id)}>{t("marketingCampaignOpenWorkspace")}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Package className="h-4 w-4 text-primary" />
            {t("marketingHomeDeliveryTitle")}
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("marketingHomeDeliveryEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              {deliveries.slice(0, 8).map((row) => (
                <li key={row.materialId} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.materialName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {resolveMaterialTypeLabel(row.materialType, typeOptions, tr)}
                        {row.campaignNo ? ` · [${row.campaignNo}] ` : " · "}
                        {row.campaignTopic}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 text-[11px]" asChild>
                      <Link href={marketingCampaignWorkspaceHref(row.campaignId, "tasks")}>
                        {t("marketingCampaignOpenWorkspace")}
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.pendingStores.slice(0, 8).map((s) => (
                      <span
                        key={`${row.materialId}-${s.store}`}
                        className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border"
                      >
                        {formatStoreLabel(s.store)} · {phaseLabel(s.phase)}
                      </span>
                    ))}
                    {row.pendingStores.length > 8 ? (
                      <span className="text-[10px] text-muted-foreground">+{row.pendingStores.length - 8}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t("marketingHomeNextActions")}
          </h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : pendingInfluencers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("marketingHomeNoOpenInfluencers")}</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {pendingInfluencers.slice(0, 6).map((row) => (
                <li key={row.influencer.id} className="flex items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {row.influencer.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.campaignTopic || "—"}
                      {row.influencer.publishDate ? ` · ${row.influencer.publishDate}` : ""}
                    </p>
                  </div>
                  {row.influencer.campaignId ? (
                    <Button variant="secondary" size="sm" className="h-8 shrink-0 text-xs" asChild>
                      <Link href={marketingCampaignWorkspaceHref(row.influencer.campaignId, "tasks")}>
                        {t("marketingCampaignOpenWorkspace")}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("marketingHomeQuickLinks")}</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { href: "/admin/marketing/campaigns", label: t("adminMarketingCampaigns"), icon: Megaphone },
                { href: "/admin/marketing/ads?tab=meta", label: t("adminMarketingAds"), icon: TrendingUp },
                { href: "/admin/marketing/calendar", label: t("adminMarketingCalendar"), icon: CalendarDays },
                { href: "/admin/marketing/integrations", label: t("adminMarketingIntegrations"), icon: TrendingUp },
              ] as const
            ).map(({ href, label, icon: Icon }) => (
              <Button key={href} variant="outline" size="sm" className="h-9 gap-1.5" asChild>
                <Link href={href}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
