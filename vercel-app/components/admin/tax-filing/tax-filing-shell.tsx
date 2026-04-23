"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
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

type FilingTabKey = "vat" | "wht" | "cit" | "sso" | "dbd" | "workflow"

function useFilingTabFilters(
  storeOptions: string[],
  isOffice: boolean,
  isManager: boolean,
  managerStore: string,
  storeOptionLabel: (code: string) => string,
  tAccCompYearMonth: string,
  tAccCompStore: string
) {
  const defaultYm = React.useCallback(() => getBangkokRecentYearMonths(1)[0], [])
  const defaultStore = React.useCallback(
    () => (isManager && managerStore ? managerStore : "All"),
    [isManager, managerStore]
  )

  const [vatYm, setVatYm] = React.useState(defaultYm)
  const [vatStore, setVatStore] = React.useState(defaultStore)
  const [whtYm, setWhtYm] = React.useState(defaultYm)
  const [whtStore, setWhtStore] = React.useState(defaultStore)
  const [citYm, setCitYm] = React.useState(defaultYm)
  const [citStore, setCitStore] = React.useState(defaultStore)
  const [ssoYm, setSsoYm] = React.useState(defaultYm)
  const [ssoStore, setSsoStore] = React.useState(defaultStore)
  const [dbdYm, setDbdYm] = React.useState(defaultYm)
  const [dbdStore, setDbdStore] = React.useState(defaultStore)
  const [workflowYm, setWorkflowYm] = React.useState(defaultYm)
  const [workflowStore, setWorkflowStore] = React.useState(defaultStore)

  React.useEffect(() => {
    if (isManager && managerStore) {
      setVatStore(managerStore)
      setWhtStore(managerStore)
      setCitStore(managerStore)
      setSsoStore(managerStore)
      setDbdStore(managerStore)
      setWorkflowStore(managerStore)
    }
  }, [isManager, managerStore])

  const FilingFiltersCard = React.useCallback(
    ({
      tabKey,
      yearMonth,
      onYearMonthChange,
      storeFilter,
      onStoreFilterChange,
    }: {
      tabKey: FilingTabKey
      yearMonth: string
      onYearMonthChange: (v: string) => void
      storeFilter: string
      onStoreFilterChange: (v: string) => void
    }) => (
      <Card className="border-border/80">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{tAccCompYearMonth}</div>
              <Input
                type="month"
                className="h-9 w-[160px]"
                value={yearMonth}
                onChange={(e) => onYearMonthChange(e.target.value)}
              />
            </div>
            {isOffice ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{tAccCompStore}</div>
                <Select value={storeFilter} onValueChange={onStoreFilterChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={`${tabKey}-${s}`} value={s}>
                        {storeOptionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : isManager && managerStore ? (
              <div className="text-sm text-muted-foreground pb-1">
                {tAccCompStore}: <span className="text-foreground font-medium">{managerStore}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    ),
    [isOffice, isManager, managerStore, storeOptionLabel, storeOptions, tAccCompStore, tAccCompYearMonth]
  )

  const tabProps = React.useMemo(
    () => ({
      vat: {
        filingYearMonth: vatYm,
        onFilingYearMonthChange: setVatYm,
        filingStoreFilter: vatStore,
        onFilingStoreFilterChange: setVatStore,
      },
      wht: {
        filingYearMonth: whtYm,
        onFilingYearMonthChange: setWhtYm,
        filingStoreFilter: whtStore,
        onFilingStoreFilterChange: setWhtStore,
      },
      cit: {
        filingYearMonth: citYm,
        onFilingYearMonthChange: setCitYm,
        filingStoreFilter: citStore,
        onFilingStoreFilterChange: setCitStore,
      },
      sso: {
        filingYearMonth: ssoYm,
        onFilingYearMonthChange: setSsoYm,
        filingStoreFilter: ssoStore,
        onFilingStoreFilterChange: setSsoStore,
      },
      dbd: {
        filingYearMonth: dbdYm,
        onFilingYearMonthChange: setDbdYm,
        filingStoreFilter: dbdStore,
        onFilingStoreFilterChange: setDbdStore,
      },
      workflow: {
        filingYearMonth: workflowYm,
        onFilingYearMonthChange: setWorkflowYm,
        filingStoreFilter: workflowStore,
        onFilingStoreFilterChange: setWorkflowStore,
      },
    }),
    [vatYm, vatStore, whtYm, whtStore, citYm, citStore, ssoYm, ssoStore, dbdYm, dbdStore, workflowYm, workflowStore]
  )

  return { FilingFiltersCard, tabProps }
}

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

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    const uniq = Array.from(
      new Set((storeList || []).map((s) => String(s).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    return ["All", ...uniq]
  }, [isOffice, isManager, managerStore, storeList])

  const storeOptionLabel = React.useCallback((code: string) => (code === "All" ? t("all") : code), [t])

  const { FilingFiltersCard, tabProps } = useFilingTabFilters(
    storeOptions,
    isOffice,
    isManager,
    managerStore,
    storeOptionLabel,
    t("accCompYearMonth"),
    t("accCompStore")
  )

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
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
          </AdminTabsBarWithHelp>

        <TabsContent value="vat" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingVatTab {...tabProps.vat} />
        </TabsContent>
        <TabsContent value="wht" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab {...tabProps.wht} />
        </TabsContent>
        <TabsContent value="cit" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="cit"
            yearMonth={tabProps.cit.filingYearMonth}
            onYearMonthChange={tabProps.cit.onFilingYearMonthChange}
            storeFilter={tabProps.cit.filingStoreFilter}
            onStoreFilterChange={tabProps.cit.onFilingStoreFilterChange}
          />
          <TaxFilingCitTab {...tabProps.cit} />
        </TabsContent>
        <TabsContent value="sso" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="sso"
            yearMonth={tabProps.sso.filingYearMonth}
            onYearMonthChange={tabProps.sso.onFilingYearMonthChange}
            storeFilter={tabProps.sso.filingStoreFilter}
            onStoreFilterChange={tabProps.sso.onFilingStoreFilterChange}
          />
          <TaxFilingSsoTab {...tabProps.sso} />
        </TabsContent>
        <TabsContent value="dbd" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="dbd"
            yearMonth={tabProps.dbd.filingYearMonth}
            onYearMonthChange={tabProps.dbd.onFilingYearMonthChange}
            storeFilter={tabProps.dbd.filingStoreFilter}
            onStoreFilterChange={tabProps.dbd.onFilingStoreFilterChange}
          />
          <TaxFilingDbdTab {...tabProps.dbd} />
        </TabsContent>
        <TabsContent value="workflow" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="workflow"
            yearMonth={tabProps.workflow.filingYearMonth}
            onYearMonthChange={tabProps.workflow.onFilingYearMonthChange}
            storeFilter={tabProps.workflow.filingStoreFilter}
            onStoreFilterChange={tabProps.workflow.onFilingStoreFilterChange}
          />
          <TaxFilingWorkflowTab {...tabProps.workflow} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
