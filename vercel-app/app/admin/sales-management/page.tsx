"use client"

import * as React from "react"
import { Suspense } from "react"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { BarChart3 } from "lucide-react"

const SalesTab = SalesManagementTab as React.ComponentType<{ offlineAware?: boolean }>

/** useSearchParams — Next/React 19에서 Suspense 밖이면 마운트 전 상태 갱신 경고가 날 수 있음 */
function SalesTabFallback() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="rounded-lg border p-4 space-y-3">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}

export default function SalesManagementPage() {
  const t = useT(useLang().lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("salesManagementTitle") || "매출 관리"}
          </h1>
        </div>
        <Suspense fallback={<SalesTabFallback />}>
          <SalesTab />
        </Suspense>
      </div>
    </div>
  )
}
