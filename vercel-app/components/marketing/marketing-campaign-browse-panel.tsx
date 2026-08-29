"use client"

import * as React from "react"
import { Megaphone, Plus, RotateCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { MarketingCampaignCardGrid } from "@/components/marketing/marketing-campaign-card-grid"
import { MarketingCampaignCreateForm } from "@/components/marketing/marketing-campaign-create-form"
import {
  getMarketingCampaigns,
  type MarketingCampaign,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useErpRefetchOnActivate } from "@/lib/erp-page-visibility"
import { fetchMarketingCampaignHubLinkSets } from "@/lib/marketing-campaign-hub-link-data"
import {
  emptyMarketingCampaignHubLinkSets,
  normalizeCampaignStatusForListFilter,
  type MarketingCampaignHubLinkSets,
} from "@/lib/marketing-campaign-list-query"

type StatusChip = "all" | "ongoing" | "draft" | "finish"

export function MarketingCampaignBrowsePanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(true)
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [hubLinkSets, setHubLinkSets] = React.useState<MarketingCampaignHubLinkSets>(emptyMarketingCampaignHubLinkSets())
  const [q, setQ] = React.useState("")
  const [status, setStatus] = React.useState<StatusChip>("all")
  const [creating, setCreating] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [camps, links] = await Promise.all([
        getMarketingCampaigns(),
        fetchMarketingCampaignHubLinkSets(),
      ])
      setCampaigns(Array.isArray(camps) ? camps : [])
      setHubLinkSets(links)
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])
  useErpRefetchOnActivate(() => {
    void load()
  })

  const statusLabel = React.useCallback(
    (raw: string) => {
      const n = normalizeCampaignStatusForListFilter(raw)
      if (n === "ongoing") return t("marketingBrowseOngoing")
      if (n === "finish") return t("marketingBrowseDone")
      return t("marketingBrowsePlanned")
    },
    [t]
  )

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return campaigns.filter((c) => {
      const n = normalizeCampaignStatusForListFilter(c.status)
      if (status !== "all" && n !== status) return false
      if (!needle) return true
      return (
        String(c.topic || "").toLowerCase().includes(needle) ||
        String(c.campaignNo || "").toLowerCase().includes(needle)
      )
    })
  }, [campaigns, q, status])

  const chips: { id: StatusChip; label: string }[] = [
    { id: "all", label: t("marketingBrowseAll") },
    { id: "ongoing", label: t("marketingBrowseOngoing") },
    { id: "draft", label: t("marketingBrowsePlanned") },
    { id: "finish", label: t("marketingBrowseDone") },
  ]

  return (
    <MarketingPageShell maxWidthClass="max-w-7xl">
      <MarketingPageHero
        icon={Megaphone}
        title={t("adminMarketingCampaigns")}
        description={t("marketingBrowseHint")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4" />
              {t("marketingBrowseCreate")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void load()} disabled={loading}>
              <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {t("posRefresh")}
            </Button>
          </div>
        }
      />
      <MarketingCampaignCreateForm open={creating} onClose={() => setCreating(false)} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("marketingBrowseSearch")}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={cn(
                "rounded-full px-3 py-1 text-xs ring-1",
                status === chip.id
                  ? "bg-primary/10 text-primary ring-primary/30"
                  : "bg-muted/40 text-muted-foreground ring-border"
              )}
              onClick={() => setStatus(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      <MarketingCampaignCardGrid
        campaigns={shown}
        lang={lang}
        statusLabel={statusLabel}
        formatBranchCount={(c) =>
          c.branches && c.branches.length > 0 ? String(c.branches.length) : t("marketingBrowseAll")
        }
        hubLinkSets={hubLinkSets}
        openLabel={t("marketingCampaignOpenWorkspace")}
        budgetLabel={t("marketingWsBudget")}
        kpiLabel={t("marketingWsKpi")}
        loading={loading}
        loadingLabel={t("loading")}
        shortcuts={{
          promos: t("marketingCardOpenPromos"),
          collab: t("marketingCardOpenCollab"),
          tasks: t("marketingCardOpenTasks"),
          results: t("marketingCardOpenResults"),
        }}
        empty={<p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("marketingBrowseEmpty")}</p>}
      />
    </MarketingPageShell>
  )
}
