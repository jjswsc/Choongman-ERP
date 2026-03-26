"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FileText } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { MarketingMonthlyReportPanel } from "@/components/marketing/marketing-monthly-report-panel"
import { MarketingPerformanceDashboardPanel } from "@/components/marketing/marketing-performance-dashboard-panel"
import { MarketingCostsHubPanel } from "@/components/marketing/marketing-costs-hub-panel"

const TAB_IDS = ["monthly", "performance", "costs"] as const
type ReportTab = (typeof TAB_IDS)[number]

function normalizeTab(raw: string | null): ReportTab {
  const t = (raw ?? "").trim()
  return t === "performance" || t === "costs" ? t : "monthly"
}

export default function MarketingReportHubPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const activeTab = normalizeTab(searchParams.get("tab"))

  const setTab = React.useCallback(
    (next: ReportTab) => {
      const p = new URLSearchParams(searchParams.toString())
      if (next === "monthly") p.delete("tab")
      else p.set("tab", next)
      const qs = p.toString()
      router.replace(qs ? `/admin/marketing/report?${qs}` : "/admin/marketing/report", { scroll: false })
    },
    [router, searchParams]
  )

  React.useEffect(() => {
    const raw = searchParams.get("tab")?.trim()
    if (raw && !TAB_IDS.includes(raw as ReportTab)) {
      const p = new URLSearchParams(searchParams.toString())
      p.delete("tab")
      const qs = p.toString()
      router.replace(qs ? `/admin/marketing/report?${qs}` : "/admin/marketing/report", { scroll: false })
    }
  }, [router, searchParams])

  const wide = activeTab !== "monthly"

  return (
    <div className="flex-1 overflow-auto">
      <div className={cn("mx-auto px-4 py-6 sm:px-6 lg:px-8", wide ? "max-w-7xl" : "max-w-4xl")}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">월간 리포트</h1>
              <p className="text-xs text-muted-foreground">월간 집계 · 실적 대시보드 · 비용 연계</p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setTab(normalizeTab(v))} className="w-full">
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            <TabsTrigger value="monthly" className="text-xs sm:text-sm">
              월간 리포트
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs sm:text-sm">
              실적 대시보드
            </TabsTrigger>
            <TabsTrigger value="costs" className="text-xs sm:text-sm">
              비용 연계
            </TabsTrigger>
          </TabsList>
          <TabsContent value="monthly" className="mt-0 focus-visible:outline-none">
            <MarketingMonthlyReportPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
          <TabsContent value="performance" className="mt-0 focus-visible:outline-none">
            <MarketingPerformanceDashboardPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
          <TabsContent value="costs" className="mt-0 focus-visible:outline-none">
            <MarketingCostsHubPanel campaignIdFromQuery={campaignIdFromQuery} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
