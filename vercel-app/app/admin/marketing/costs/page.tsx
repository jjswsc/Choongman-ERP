"use client"

import * as React from "react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Banknote, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getMarketingCampaigns, getMarketingCampaignCosts } from "@/lib/api-client"

type CampaignWithCosts = {
  id: string
  topic: string
  budgetTotal: number
  totalCosts: number
  bankCosts: number
  pettyCosts: number
}

export default function MarketingCostsPage() {
  const t = useT(useLang().lang)
  const [list, setList] = React.useState<CampaignWithCosts[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const campaigns = await getMarketingCampaigns()
      const withCosts = await Promise.all(
        campaigns.map(async (c) => {
          const res = await getMarketingCampaignCosts(c.id)
          return {
            id: c.id,
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
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const totalBudget = list.reduce((s, c) => s + c.budgetTotal, 0)
  const totalActual = list.reduce((s, c) => s + c.totalCosts, 0)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Banknote className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingCosts") || "비용 연계"}
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RotateCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>
        {loading && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        {!loading && list.length === 0 && (
          <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-12 text-center text-muted-foreground">
            <p className="text-sm">캠페인이 없습니다.</p>
          </div>
        )}
        {!loading && list.length > 0 && (() => {
          const overBudget = list.filter((c) => c.budgetTotal > 0 && c.totalCosts > c.budgetTotal)
          return (
          <>
          {overBudget.length > 0 && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm">
              <span className="font-medium text-destructive">예산 초과 알림:</span> {overBudget.length}건 (총 ฿{overBudget.reduce((s, c) => s + (c.totalCosts - c.budgetTotal), 0).toLocaleString()} 초과)
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {overBudget.slice(0, 5).map((c) => (
                  <li key={c.id}>{c.topic}</li>
                ))}
                {overBudget.length > 5 && <li>...외 {overBudget.length - 5}건</li>}
              </ul>
            </div>
          )}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3 flex justify-between items-center">
              <h3 className="text-sm font-semibold">캠페인별 예산 vs 실비</h3>
              <div className="text-xs text-muted-foreground">
                총 예산 ฿{totalBudget.toLocaleString()} · 실비 ฿{totalActual.toLocaleString()}
              </div>
            </div>
            <div className="divide-y overflow-x-auto">
              {list.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 font-medium">{c.topic}</div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      예산 ฿{c.budgetTotal.toLocaleString()}
                    </span>
                    <span>
                      실비 ฿{c.totalCosts.toLocaleString()}
                      {(c.bankCosts > 0 || c.pettyCosts > 0) && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (통장 ฿{c.bankCosts.toLocaleString()} / Petty ฿{c.pettyCosts.toLocaleString()})
                        </span>
                      )}
                    </span>
                    {c.budgetTotal > 0 && (
                      <span className={c.totalCosts > c.budgetTotal ? "text-destructive" : "text-muted-foreground"}>
                        {c.totalCosts <= c.budgetTotal ? "예산 이내" : "예산 초과"}
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
    </div>
  )
}
