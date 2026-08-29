"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Facebook,
  Megaphone,
  Package,
  RotateCw,
  Store,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { appAlert } from "@/lib/app-message"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingInfluencers,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  saveMarketingMaterialStoreCheck,
  useStoreList,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
  type MarketingMaterialStoreCheck,
} from "@/lib/api-client"
import { getMetaConnectionStatus } from "@/lib/api-client/marketing-meta"
import { useAuth } from "@/lib/auth-context"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { isMarketingMaterialStoreScopedRole } from "@/lib/marketing-material-store-scope"
import { cn } from "@/lib/utils"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"
import {
  countPendingInstallStores,
  isCampaignInProgress,
  listDispatchLines,
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
  const { auth } = useAuth()
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
  const [metaConnected, setMetaConnected] = React.useState<boolean | null>(null)
  const [metaNeedPage, setMetaNeedPage] = React.useState(false)
  const [showAllDispatch, setShowAllDispatch] = React.useState(false)
  const [showAllInfluencers, setShowAllInfluencers] = React.useState(false)
  const [savingKey, setSavingKey] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [camp, mats, chk, inf, meta] = await Promise.all([
        getMarketingCampaigns(),
        getMarketingMaterials().catch(() => []),
        getMarketingMaterialStoreChecks().catch(() => []),
        getMarketingInfluencers().catch(() => []),
        getMetaConnectionStatus().catch(() => null),
      ])
      setCampaigns(Array.isArray(camp) ? camp : [])
      setMaterials(Array.isArray(mats) ? mats : [])
      setChecks(Array.isArray(chk) ? chk : [])
      setInfluencers(Array.isArray(inf) ? inf : [])
      setMetaConnected(meta ? Boolean(meta.connected) : null)
      setMetaNeedPage(Boolean(meta?.pendingPagePick))
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
  const dispatchLines = React.useMemo(
    () =>
      listDispatchLines({
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
  const dispatchShown = showAllDispatch ? dispatchLines : dispatchLines.slice(0, 20)
  const influencersShown = showAllInfluencers ? pendingInfluencers : pendingInfluencers.slice(0, 6)

  const canConfirmStore = React.useCallback(
    (store: string) => {
      const role = String(auth?.role || "")
      if (!role) return false
      if (!isMarketingMaterialStoreScopedRole(role)) return true
      const mine = String(auth?.store || "")
      if (storesMatchForGradeLookup(mine, store)) return true
      const allowed = Array.isArray(auth?.allowedStores) ? auth.allowedStores : []
      return allowed.some((s) => storesMatchForGradeLookup(String(s || ""), store))
    },
    [auth]
  )

  const markDispatch = async (
    row: (typeof dispatchLines)[number],
    phase: "receive" | "install"
  ) => {
    const key = `${row.materialId}-${row.store}-${phase}`
    const material = materials.find((m) => m.id === row.materialId)
    const existing = checks.find(
      (c) => c.materialId === row.materialId && storesMatchForGradeLookup(c.storeName, row.store)
    )
    const today = getBangkokTodayDateString()
    setSavingKey(key)
    try {
      const res = await saveMarketingMaterialStoreCheck({
        id: existing?.id,
        materialId: row.materialId,
        campaignId: row.campaignId,
        storeName: row.store,
        receivedOn: phase === "receive" ? today : existing?.receivedOn || today,
        installedOn: phase === "install" ? today : existing?.installedOn || null,
        materialType: material?.type || row.materialType,
      })
      if (!res.success) await appAlert(res.message || t("marketingWsSaveFail"))
      await load()
    } finally {
      setSavingKey("")
    }
  }

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

      {metaNeedPage ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-amber-950 dark:text-amber-100">
            <Facebook className="h-4 w-4 shrink-0" />
            {t("marketingHomeMetaNeedPage")}
          </p>
          <Button size="sm" className="h-8" asChild>
            <Link href="/admin/marketing/integrations">{t("adminMarketingIntegrations")}</Link>
          </Button>
        </div>
      ) : metaConnected === false ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-amber-950 dark:text-amber-100">
            <Facebook className="h-4 w-4 shrink-0" />
            {t("marketingHomeMetaNeedConnect")}
          </p>
          <Button size="sm" className="h-8" asChild>
            <Link href="/admin/marketing/integrations">{t("adminMarketingIntegrations")}</Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatOngoing")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : ongoing.length}</div>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3">
          <div className="text-[10px] text-muted-foreground">{t("marketingHomeStatPendingShip")}</div>
          <div className="text-2xl font-semibold tabular-nums">{loading ? "…" : dispatchLines.length}</div>
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

      <div className="mt-6 rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Package className="h-4 w-4 text-primary" />
            {t("marketingHomeDispatchTitle")}
          </h2>
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link href="/admin/marketing/campaigns">{t("marketingHomeViewAll")}</Link>
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : dispatchLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("marketingHomeDispatchEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">{t("marketingHomeDispatchColItem")}</th>
                  <th className="py-2 pr-2 font-medium">{t("adminMarketingCampaigns")}</th>
                  <th className="py-2 pr-2 font-medium">{t("marketingHomeDispatchColStore")}</th>
                  <th className="py-2 pr-2 font-medium">{t("marketingHomeDispatchColStatus")}</th>
                  <th className="py-2 pr-2 font-medium">{t("marketingWsQty")}</th>
                  <th className="py-2 font-medium">{t("marketingHomeDispatchColAction")}</th>
                </tr>
              </thead>
              <tbody>
                {dispatchShown.map((row) => (
                  <tr key={`${row.materialId}-${row.store}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-2">
                      <Link
                        className="font-medium text-foreground hover:text-primary"
                        href={marketingCampaignWorkspaceHref(row.campaignId, "tasks")}
                      >
                        {row.materialName}
                      </Link>
                      <p className="text-[11px] text-muted-foreground">
                        {resolveMaterialTypeLabel(row.materialType, typeOptions, tr)}
                      </p>
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {row.campaignNo ? `[${row.campaignNo}] ` : ""}
                      {row.campaignTopic}
                    </td>
                    <td className="py-2 pr-2">{formatStoreLabel(row.store)}</td>
                    <td className="py-2 pr-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{phaseLabel(row.phase)}</span>
                    </td>
                    <td className="py-2 pr-2 text-[11px] tabular-nums text-muted-foreground">
                      {row.quantity
                        ? (row.quantityEstimated ? t("marketingHomeQtyEstimate") : t("marketingHomeStoreQty")).replace(
                            "{qty}",
                            String(row.quantity)
                          )
                        : "—"}
                    </td>
                    <td className="py-2">
                      {canConfirmStore(row.store) && (row.phase === "receive" || row.phase === "install") ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={Boolean(savingKey)}
                          onClick={() => void markDispatch(row, row.phase === "install" ? "install" : "receive")}
                        >
                          {row.phase === "install"
                            ? t("marketingMaterialChecklistConfirmInstalled")
                            : t("marketingMaterialChecklistConfirmReceived")}
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && dispatchLines.length > 20 ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-8 w-full text-xs"
            onClick={() => setShowAllDispatch((v) => !v)}
          >
            {showAllDispatch ? t("marketingHomeShowLess") : t("marketingHomeShowMore")}
          </Button>
        ) : null}
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
              {influencersShown.map((row) => (
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
                        {t("marketingCardOpenTasks")}
                      </Link>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!loading && pendingInfluencers.length > 6 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 w-full text-xs"
              onClick={() => setShowAllInfluencers((v) => !v)}
            >
              {showAllInfluencers ? t("marketingHomeShowLess") : t("marketingHomeShowMore")}
            </Button>
          ) : null}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("marketingHomeQuickLinks")}</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { href: "/admin/marketing/campaigns", label: t("adminMarketingCampaigns"), icon: Megaphone },
                { href: "/admin/marketing/ads?tab=meta", label: t("adminMarketingAds"), icon: TrendingUp },
                { href: "/admin/marketing/calendar", label: t("adminMarketingCalendar"), icon: CalendarDays },
                { href: "/admin/marketing/integrations", label: t("adminMarketingIntegrations"), icon: Facebook },
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
          {ongoing.length > 0 ? (
            <ul className="mt-4 divide-y divide-border/60 text-sm">
              {ongoing.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">{c.topic}</span>
                  <Button variant="ghost" size="sm" className="h-7 shrink-0 text-[11px]" asChild>
                    <Link href={marketingCampaignWorkspaceHref(c.id)}>{t("marketingCampaignOpenWorkspace")}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </>
  )
}
