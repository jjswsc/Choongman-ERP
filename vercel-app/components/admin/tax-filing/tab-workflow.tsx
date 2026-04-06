"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { AdminAccountingCompliance } from "@/components/admin/admin-accounting-compliance"

type Props = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

export function TaxFilingWorkflowTab(props: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const shared = {
    filingYearMonth: props.filingYearMonth,
    onFilingYearMonthChange: props.onFilingYearMonthChange,
    filingStoreFilter: props.filingStoreFilter,
    onFilingStoreFilterChange: props.onFilingStoreFilterChange,
  }
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("taxFilingWorkflowGuideTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {t("taxFilingWorkflowGuideBody")}
        </CardContent>
      </Card>
      <details className="rounded-lg border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("accCompTabScope")}</summary>
        <div className="mt-3">
          <AdminAccountingCompliance initialTab="scope" hideTabBar {...shared} />
        </div>
      </details>
      <details className="rounded-lg border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("accCompTabChannels")}</summary>
        <div className="mt-3">
          <AdminAccountingCompliance initialTab="channels" hideTabBar {...shared} />
        </div>
      </details>
      <details className="rounded-lg border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("accCompTabResp")}</summary>
        <div className="mt-3">
          <AdminAccountingCompliance initialTab="resp" hideTabBar {...shared} />
        </div>
      </details>
      <AdminAccountingCompliance initialTab="workflow" hideTabBar {...shared} />
    </div>
  )
}
