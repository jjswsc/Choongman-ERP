"use client"

import * as React from "react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { getMarketingCampaigns, getMarketingCampaignCosts, type MarketingCampaign } from "@/lib/api-client"

type CampaignWithCosts = {
  id: string
  campaignNo: string
  topic: string
  budgetTotal: number
  totalCosts: number
  bankCosts: number
  pettyCosts: number
}

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

export type MarketingCostsHubPanelProps = {
  campaignIdFromQuery?: string
}

export function MarketingCostsHubPanel({ campaignIdFromQuery = "" }: MarketingCostsHubPanelProps) {
  const t = useT(useLang().lang)

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [list, setList] = React.useState<CampaignWithCosts[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (campaignIdFromQuery) setCampaignFilter(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const all = await getMarketingCampaigns()
      setCampaigns(Array.isArray(all) ? all : [])
      const cid = campaignFilter.trim()
      const scoped = cid ? (all || []).filter((c) => c.id === cid) : all || []
      const withCosts = await Promise.all(
        scoped.map(async (c) => {
          const res = await getMarketingCampaignCosts(c.id)
          return {
            id: c.id,
            campaignNo: (c.campaignNo ?? "").trim(),
            topic: c.topic,
            budgetTotal: c.budgetTotal ?? 0,
            totalCosts: res.totalCosts ?? 0,
            bankCosts: res.bankCosts ?? 0,
            pettyCosts: res.pettyCosts ?? 0,
          }
        })
      )
      setList(withCosts)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [campaignFilter])

  React.useEffect(() => {
    void load()
  }, [load])

  const totalBudget = list.reduce((s, c) => s + c.budgetTotal, 0)
  const totalActual = list.reduce((s, c) => s + c.totalCosts, 0)
  const overCount = list.filter((c) => c.budgetTotal > 0 && c.totalCosts > c.budgetTotal).length

  const chartRows = React.useMemo(() => {
    const withMoney = list.filter((c) => c.budgetTotal > 0 || c.totalCosts > 0)
    const sorted = [...withMoney].sort((a, b) => b.totalCosts - a.totalCosts)
    return sorted.slice(0, 14).map((c) => ({
      name: (c.campaignNo ? `[${c.campaignNo}] ` : "") + (c.topic.length > 14 ? c.topic.slice(0, 14) + "…" : c.topic),
      budget: c.budgetTotal,
      actual: c.totalCosts,
    }))
  }, [list])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-9 max-w-xs rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("marketingCostsAllCampaigns")}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {campaignListLabel(c)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RotateCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {t("marketingCostsHubNoteLead")}{" "}
        <strong className="text-foreground">{t("marketingCostsHubNoteBold")}</strong>
        {t("marketingCostsHubNoteTrail")}
        {campaignIdFromQuery && (
          <span className="ml-1 text-primary">{t("marketingCostsHubFilterHint")}</span>
        )}
      </div>

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingCostsStatCampaignCount")}</div>
            <div className="text-lg font-semibold">
              {list.length}
              {t("marketingCountUnit")}
            </div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingCostsStatBudgetTotal")}</div>
            <div className="text-lg font-semibold tabular-nums">฿{totalBudget.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingCostsStatActualTotal")}</div>
            <div className="text-lg font-semibold tabular-nums">฿{totalActual.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("marketingCostsStatOverBudget")}</div>
            <div className={cn("text-lg font-semibold", overCount > 0 ? "text-destructive" : "")}>
              {overCount}
              {t("marketingCountUnit")}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      )}
      {!loading && list.length === 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
          <p className="text-sm">{t("marketingCostsEmpty")}</p>
        </div>
      )}
      {!loading && chartRows.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("marketingCostsChartTopTitle")}</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => `฿${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="budget" fill="#94a3b8" name={t("marketingCostsSeriesBudget")} />
                <Bar dataKey="actual" fill="#f97316" name={t("marketingCostsSeriesActual")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!loading &&
        list.length > 0 &&
        (() => {
          const overBudget = list.filter((c) => c.budgetTotal > 0 && c.totalCosts > c.budgetTotal)
          return (
            <>
              {overBudget.length > 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm">
                  <span className="font-medium text-destructive">{t("marketingCostsOverAlertTitle")}</span>{" "}
                  {t("marketingCostsOverAlertBody")
                    .replace("{count}", String(overBudget.length))
                    .replace(
                      "{amount}",
                      overBudget.reduce((s, c) => s + (c.totalCosts - c.budgetTotal), 0).toLocaleString()
                    )}
                  <ul className="mt-1 list-inside list-disc text-muted-foreground">
                    {overBudget.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        {c.campaignNo ? `[${c.campaignNo}] ` : ""}
                        {c.topic}
                      </li>
                    ))}
                    {overBudget.length > 5 && (
                      <li>{t("marketingCostsOverMore").replace("{n}", String(overBudget.length - 5))}</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">{t("marketingCostsTableTitle")}</h3>
                  <div className="text-xs text-muted-foreground">
                    {t("marketingCostsTotalsLine")
                      .replace("{b}", totalBudget.toLocaleString())
                      .replace("{a}", totalActual.toLocaleString())}
                  </div>
                </div>
                <div className="divide-y overflow-x-auto">
                  {list.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium">{c.topic}</div>
                        {c.campaignNo && (
                          <div className="font-mono text-[10px] text-muted-foreground">{c.campaignNo}</div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {t("marketingCostsRowBudgetLabel")} ฿{c.budgetTotal.toLocaleString()}
                        </span>
                        <span>
                          {t("marketingCostsRowActualLabel")} ฿{c.totalCosts.toLocaleString()}
                          {(c.bankCosts > 0 || c.pettyCosts > 0) && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {t("marketingCostsRowBankPetty")
                                .replace("{bank}", c.bankCosts.toLocaleString())
                                .replace("{petty}", c.pettyCosts.toLocaleString())}
                            </span>
                          )}
                        </span>
                        {c.budgetTotal > 0 && (
                          <span
                            className={c.totalCosts > c.budgetTotal ? "text-destructive" : "text-muted-foreground"}
                          >
                            {c.totalCosts <= c.budgetTotal
                              ? t("marketingCostsWithinBudget")
                              : t("marketingCostsOverBudgetLabel")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        })()}
    </div>
  )
}
