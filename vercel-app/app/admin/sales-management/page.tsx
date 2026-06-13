"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { BarChart3 } from "lucide-react"
import { SalesPageHeader } from "@/components/erp/sales-page-header"

const SalesTab = SalesManagementTab as React.ComponentType<{ offlineAware?: boolean }>

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
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <SalesPageHeader
          title={t("salesManagementTitle") || "매출 관리"}
          subtitle={t("salesManagementPageSub")}
          icon={BarChart3}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/total-sales">{t("adminTotalSales")}</Link>
            </Button>
          }
        />
        <Suspense fallback={<SalesTabFallback />}>
          <SalesTab offlineAware />
        </Suspense>
      </div>
    </div>
  )
}
