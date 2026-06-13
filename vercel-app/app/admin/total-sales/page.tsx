"use client"

import Link from "next/link"
import { Suspense } from "react"
import { Layers } from "lucide-react"
import { TotalSalesTab } from "@/components/tabs/total-sales-tab"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { SalesPageHeader } from "@/components/erp/sales-page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

function TotalSalesBody() {
  const t = useT(useLang().lang)
  return (
    <>
      <SalesPageHeader
        title={t("totalSalesTitle") || "Total Sales"}
        subtitle={t("totalSalesSubtitle") || "메뉴 판매량·판매액 (4단계 집계)"}
        icon={Layers}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/sales-management">{t("totalSalesLinkSalesMgmt")}</Link>
          </Button>
        }
      />
      <TotalSalesTab />
    </>
  )
}

export default function TotalSalesPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          }
        >
          <TotalSalesBody />
        </Suspense>
      </div>
    </div>
  )
}
