"use client"

import * as React from "react"
import { BarChart2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMarketingCampaign, getMarketingCampaignCosts, getMarketingCampaignResults } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { MarketingMetaInsightsPanel } from "@/components/marketing/marketing-meta-insights-panel"

export function MarketingCampaignResultsPanel({ campaignId }: { campaignId: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(false)
  const [since, setSince] = React.useState("")
  const [until, setUntil] = React.useState("")
  const [matchTopic, setMatchTopic] = React.useState("")
  const [metaCampaignId, setMetaCampaignId] = React.useState("")
  const [metaCampaignName, setMetaCampaignName] = React.useState("")
  const [cost, setCost] = React.useState<{
    bankCosts: number
    pettyCosts: number
    totalCosts: number
    attributionMode?: string
    attributionConfidence?: number
  } | null>(null)
  const [pos, setPos] = React.useState<{
    dineInOrders: number
    deliveryOrders: number
    carryOutOrders: number
    totalOrders: number
    dineInSales: number
    deliverySales: number
    carryOutSales: number
    totalSales: number
    attributionMode?: string
    attributionConfidence?: number
    linkedOrders?: number
    fallbackOrders?: number
  } | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [costsRes, posRes, camp] = await Promise.allSettled([
        getMarketingCampaignCosts(campaignId),
        getMarketingCampaignResults({ campaignId }),
        getMarketingCampaign(campaignId),
      ])
      if (costsRes.status === "fulfilled" && costsRes.value.success) {
        const r = costsRes.value
        setCost({
          bankCosts: r.bankCosts ?? 0,
          pettyCosts: r.pettyCosts ?? 0,
          totalCosts: r.totalCosts ?? 0,
          attributionMode: r.attributionMode,
          attributionConfidence: r.attributionConfidence,
        })
      }
      if (posRes.status === "fulfilled" && posRes.value.success) {
        const r = posRes.value
        setPos({
          dineInOrders: r.dineInOrders ?? 0,
          deliveryOrders: r.deliveryOrders ?? 0,
          carryOutOrders: r.carryOutOrders ?? 0,
          totalOrders: r.totalOrders ?? 0,
          dineInSales: r.dineInSales ?? 0,
          deliverySales: r.deliverySales ?? 0,
          carryOutSales: r.carryOutSales ?? 0,
          totalSales: r.totalSales ?? 0,
          attributionMode: r.attributionMode,
          attributionConfidence: r.attributionConfidence,
          linkedOrders: r.linkedOrders,
          fallbackOrders: r.fallbackOrders,
        })
      }
      if (camp.status === "fulfilled" && camp.value) {
        const c = camp.value
        setSince((c.startDate || "").slice(0, 10))
        setUntil((c.endDate || "").slice(0, 10))
        setMatchTopic(c.topic || "")
        setMetaCampaignId(c.metaCampaignId || "")
        setMetaCampaignName(c.metaCampaignName || "")
      }
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("marketingWsTabResults")}</h3>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="mr-1 h-3.5 w-3.5" />}
          {t("marketingWsLoadResults")}
        </Button>
      </div>

      {cost ? (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="mb-2 text-xs font-semibold">{t("marketingWsCostSummary")}</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("marketingWsBankOut")}</span>
            <span>฿{cost.bankCosts.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("marketingWsPetty")}</span>
            <span>฿{cost.pettyCosts.toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t pt-1 text-sm font-semibold">
            <span>{t("marketingWsTotal")}</span>
            <span>฿{cost.totalCosts.toLocaleString()}</span>
          </div>
        </div>
      ) : null}

      {pos ? (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold">{t("marketingWsPosResult")}</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              { label: t("marketingWsDineIn"), orders: pos.dineInOrders, sales: pos.dineInSales },
              { label: t("marketingWsDelivery"), orders: pos.deliveryOrders, sales: pos.deliverySales },
              { label: t("marketingWsTakeout"), orders: pos.carryOutOrders, sales: pos.carryOutSales },
              { label: t("marketingWsTotal"), orders: pos.totalOrders, sales: pos.totalSales },
            ].map((row) => (
              <div key={row.label} className="rounded bg-muted/50 px-2 py-1">
                <div className="text-xs text-muted-foreground">{row.label}</div>
                <div className="font-semibold">{row.orders.toLocaleString()}</div>
                <div className="text-xs">฿{row.sales.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <MarketingMetaInsightsPanel
        compact
        since={since || undefined}
        until={until || undefined}
        matchTopic={matchTopic}
        metaCampaignId={metaCampaignId}
        metaCampaignName={metaCampaignName}
      />
    </div>
  )
}
