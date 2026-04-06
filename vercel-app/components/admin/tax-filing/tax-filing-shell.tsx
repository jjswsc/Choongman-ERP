"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStoreList } from "@/lib/api-client"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { TaxFilingVatTab } from "@/components/admin/tax-filing/tab-vat"
import { TaxFilingWhtTab } from "@/components/admin/tax-filing/tab-wht"
import { TaxFilingCitTab } from "@/components/admin/tax-filing/tab-cit"
import { TaxFilingSsoTab } from "@/components/admin/tax-filing/tab-sso"
import { TaxFilingDbdTab } from "@/components/admin/tax-filing/tab-dbd"
import { TaxFilingWorkflowTab } from "@/components/admin/tax-filing/tab-workflow"

export function TaxFilingShell() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()
  const role = auth?.role || ""
  const isOffice = isOfficeRole(role)
  const isManager = isManagerOrFranchiseeRole(role)
  const managerStore = (auth?.store || "").trim()

  const [tab, setTab] = React.useState("vat")
  const [filingYearMonth, setFilingYearMonth] = React.useState(() => getBangkokRecentYearMonths(1)[0])
  const [filingStoreFilter, setFilingStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )

  React.useEffect(() => {
    if (isManager && managerStore) setFilingStoreFilter(managerStore)
  }, [isManager, managerStore])

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    return [
      "All",
      ...((storeList || []).filter(
        (s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office")
      ) || []),
    ]
  }, [isOffice, isManager, managerStore, storeList])

  const storeOptionLabel = React.useCallback((code: string) => (code === "All" ? t("all") : code), [t])

  const sharedFiling = {
    filingYearMonth,
    onFilingYearMonthChange: setFilingYearMonth,
    filingStoreFilter,
    onFilingStoreFilterChange: setFilingStoreFilter,
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
              <Input
                type="month"
                className="h-9 w-[160px]"
                value={filingYearMonth}
                onChange={(e) => setFilingYearMonth(e.target.value)}
              />
            </div>
            {isOffice ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                <Select value={filingStoreFilter} onValueChange={setFilingStoreFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {storeOptionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : isManager && managerStore ? (
              <div className="text-sm text-muted-foreground pb-1">
                {t("accCompStore")}: <span className="text-foreground font-medium">{managerStore}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="vat" className={adminTabsTriggerCn}>
                {t("taxFilingTabVat")}
              </TabsTrigger>
              <TabsTrigger value="wht" className={adminTabsTriggerCn}>
                {t("taxFilingTabWht")}
              </TabsTrigger>
              <TabsTrigger value="cit" className={adminTabsTriggerCn}>
                {t("taxFilingTabCit")}
              </TabsTrigger>
              <TabsTrigger value="sso" className={adminTabsTriggerCn}>
                {t("taxFilingTabSso")}
              </TabsTrigger>
              <TabsTrigger value="dbd" className={adminTabsTriggerCn}>
                {t("taxFilingTabDbd")}
              </TabsTrigger>
              <TabsTrigger value="workflow" className={adminTabsTriggerCn}>
                {t("taxFilingTabWorkflow")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="vat" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingVatTab {...sharedFiling} />
        </TabsContent>
        <TabsContent value="wht" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab {...sharedFiling} />
        </TabsContent>
        <TabsContent value="cit" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingCitTab {...sharedFiling} />
        </TabsContent>
        <TabsContent value="sso" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingSsoTab {...sharedFiling} />
        </TabsContent>
        <TabsContent value="dbd" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingDbdTab {...sharedFiling} />
        </TabsContent>
        <TabsContent value="workflow" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWorkflowTab {...sharedFiling} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
