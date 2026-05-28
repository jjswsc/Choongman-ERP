"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { TrendingUp, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStoreList } from "@/lib/api-client"
import {
  buildFinancialStatementFranchiseStoreOptions,
} from "@/lib/financial-statement-store-options"
import { isAccountingRole, isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { IncomeStatementTab } from "@/components/tabs/income-statement-tab"
import { BalanceSheetTab } from "@/components/tabs/balance-sheet-tab"
import { LedgerReconciliationTab } from "@/components/tabs/ledger-reconciliation-tab"
import { cn } from "@/lib/utils"

export default function FinancialStatementsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList, storeLabels } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || "")
  const isManager = !isOffice && isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()
  const scopedStoreChoices = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of [...(auth?.allowedStores || []), managerStore]) {
      const t = String(s || "").trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out
  }, [auth?.allowedStores, managerStore])

  const defaultYm = getBangkokRecentYearMonths(1)[0]
  const [yearMonthStart, setYearMonthStart] = React.useState(() => defaultYm)
  const [yearMonthEnd, setYearMonthEnd] = React.useState(() => defaultYm)
  const [storeFilter, setStoreFilter] = React.useState(() =>
    isManager && scopedStoreChoices[0] ? scopedStoreChoices[0] : "All"
  )
  const [tab, setTab] = React.useState<"income" | "balance" | "reconcile">("income")
  const [queryToken, setQueryToken] = React.useState(0)

  React.useEffect(() => {
    if (isManager && scopedStoreChoices[0]) setStoreFilter(scopedStoreChoices[0])
  }, [isManager, scopedStoreChoices])

  const franchiseStoreOptions = React.useMemo(
    () => buildFinancialStatementFranchiseStoreOptions(storeList, storeLabels),
    [storeList, storeLabels]
  )
  const managerStoreOptions = isManager ? scopedStoreChoices : []

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  React.useEffect(() => {
    setQueryToken((v) => v + 1)
  }, [yearMonthStart, yearMonthEnd, storeFilter])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("adminFinancialStatements")}</h1>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">{t("fs_periodStartMonth")}</span>
                <Select
                  value={yearMonthStart}
                  onValueChange={(v) => {
                    setYearMonthStart(v)
                    if (v > yearMonthEnd) setYearMonthEnd(v)
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder={t("fs_periodStartMonth")} />
                  </SelectTrigger>
                  <SelectContent>
                    {yearMonthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">~</span>
                <span className="text-xs text-muted-foreground shrink-0">{t("fs_periodEndMonth")}</span>
                <Select
                  value={yearMonthEnd}
                  onValueChange={(v) => {
                    setYearMonthEnd(v)
                    if (v < yearMonthStart) setYearMonthStart(v)
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder={t("fs_periodEndMonth")} />
                  </SelectTrigger>
                  <SelectContent>
                    {yearMonthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(isOffice || isManager) && (
                <Select
                  value={storeFilter}
                  onValueChange={setStoreFilter}
                  disabled={isManager ? managerStoreOptions.length === 0 : false}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("pL_store")} />
                  </SelectTrigger>
                  <SelectContent>
                    {isOffice && <SelectItem value="All">{t("all")}</SelectItem>}
                    {isOffice && (
                      <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                    )}
                    {isOffice &&
                      franchiseStoreOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    {isManager &&
                      managerStoreOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              <Button size="sm" onClick={() => setQueryToken((v) => v + 1)}>
                <Search className="h-4 w-4 mr-1" />
                {t("btn_query")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "income" | "balance" | "reconcile")}
          className={adminTabsRootCn}
        >
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="income" className={adminTabsTriggerCn}>
                {t("adminIncomeStatement")}
              </TabsTrigger>
              <TabsTrigger value="balance" className={adminTabsTriggerCn}>
                {t("adminBalanceSheet")}
              </TabsTrigger>
              <TabsTrigger value="reconcile" className={adminTabsTriggerCn}>
                {t("adminLedgerReconciliation")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="income" className={cn(adminTabsContentCn, "space-y-3")}>
            <IncomeStatementTab
              yearMonth={yearMonthEnd}
              yearMonthStart={yearMonthStart}
              yearMonthEnd={yearMonthEnd}
              storeFilter={storeFilter}
              hideControls
              queryToken={queryToken}
            />
          </TabsContent>
          <TabsContent value="balance" className={cn(adminTabsContentCn, "space-y-3")}>
            <BalanceSheetTab
              yearMonth={yearMonthEnd}
              yearMonthStart={yearMonthStart}
              yearMonthEnd={yearMonthEnd}
              storeFilter={storeFilter}
              hideControls
              queryToken={queryToken}
            />
          </TabsContent>
          <TabsContent value="reconcile" className={cn(adminTabsContentCn, "space-y-3")}>
            <LedgerReconciliationTab
              yearMonth={yearMonthEnd}
              storeFilter={storeFilter}
              hideControls
              queryToken={queryToken}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
