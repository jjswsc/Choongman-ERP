"use client"

import * as React from "react"
import { SalesManagementTab } from "@/components/tabs/sales-management-tab"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { BarChart3 } from "lucide-react"

const SalesTab = SalesManagementTab as React.ComponentType<{ offlineAware?: boolean }>

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
        <SalesTab />
      </div>
    </div>
  )
}
