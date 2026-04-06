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

export function TaxFilingDbdTab(props: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("taxFilingDbdGuideTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {t("taxFilingDbdGuideBody")}
        </CardContent>
      </Card>
      <AdminAccountingCompliance
        initialTab="scope"
        hideTabBar
        filingYearMonth={props.filingYearMonth}
        onFilingYearMonthChange={props.onFilingYearMonthChange}
        filingStoreFilter={props.filingStoreFilter}
        onFilingStoreFilterChange={props.onFilingStoreFilterChange}
      />
    </div>
  )
}
