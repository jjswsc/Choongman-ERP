"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays, CheckSquare, Copy, Package, Store, Tag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MarketingCampaign } from "@/lib/api-client"
import type { MarketingCampaignHubLinkSets } from "@/lib/marketing-campaign-list-query"
import { getCampaignTypeLabel } from "@/lib/marketing-campaign-type-utils"
import { marketingCampaignWorkspaceHref } from "@/lib/marketing-campaign-create-ui"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"

export function MarketingCampaignCardGrid(props: {
  campaigns: MarketingCampaign[]
  lang: string
  statusLabel: (status: string) => string
  formatBranchCount: (c: MarketingCampaign) => string
  hubLinkSets?: MarketingCampaignHubLinkSets
  onDelete?: (c: MarketingCampaign) => void
  onCopy?: (c: MarketingCampaign) => void
  openLabel: string
  budgetLabel: string
  empty: React.ReactNode
  loading?: boolean
  loadingLabel?: string
}) {
  const {
    campaigns,
    lang,
    statusLabel,
    formatBranchCount,
    hubLinkSets,
    onDelete,
    onCopy,
    openLabel,
    budgetLabel,
    empty,
    loading,
    loadingLabel,
  } = props

  if (loading && campaigns.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{loadingLabel}</p>
  }
  if (campaigns.length === 0) {
    return empty
  }

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {campaigns.map((c) => {
        const status = String(c.status || "")
        const promoN = hubLinkSets?.promo.has(c.id) ? 1 : 0
        const taskN =
          (hubLinkSets?.influencer.has(c.id) ? 1 : 0) + (hubLinkSets?.materials.has(c.id) ? 1 : 0)
        return (
          <article
            key={c.id}
            className="flex h-full min-h-[16rem] flex-col rounded-2xl border border-primary/20 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {c.campaignNo || "—"} · {getCampaignTypeLabel(c.campaignType, lang)}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  status === "ongoing"
                    ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200"
                    : status === "finish"
                      ? "bg-muted text-muted-foreground"
                      : "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
                )}
              >
                {statusLabel(status)}
              </span>
            </div>
            <h3 className="line-clamp-2 text-base font-semibold leading-snug">{c.topic}</h3>
            {c.format ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.format}</p>
            ) : null}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {(c.startDate || "—") + " – " + (c.endDate || "—")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">{budgetLabel}</div>
                <div className="font-semibold tabular-nums">฿{(c.budgetTotal || 0).toLocaleString()}</div>
              </div>
              <div className="rounded-md bg-muted/40 px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">KPI</div>
                <div className="font-semibold tabular-nums">{(c.kpiTarget || 0).toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {promoN}
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="h-3 w-3" />
                {taskN}
              </span>
              <span className="inline-flex items-center gap-1">
                <Store className="h-3 w-3" />
                {formatBranchCount(c)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package className="h-3 w-3" />
                {hubLinkSets?.materials.has(c.id) ? 1 : 0}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {onCopy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault()
                      onCopy(c)
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault()
                      onDelete(c)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs`} asChild>
                  <Link href={marketingCampaignWorkspaceHref(c.id)}>{openLabel}</Link>
                </Button>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
