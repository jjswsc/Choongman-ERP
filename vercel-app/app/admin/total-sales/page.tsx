"use client"

import { Layers } from "lucide-react"
import { TotalSalesTab } from "@/components/tabs/total-sales-tab"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function TotalSalesPage() {
  const t = useT(useLang().lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("totalSalesTitle") || "Total Sales"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("totalSalesSubtitle") || "메뉴 판매량·판매액 (4단계 집계)"}
            </p>
          </div>
        </div>
        <TotalSalesTab />
      </div>
    </div>
  )
}
