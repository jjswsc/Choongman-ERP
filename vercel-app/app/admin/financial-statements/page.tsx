"use client"

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
import { useStoreList, getIncomeStatement, getBalanceSheet } from "@/lib/api-client"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { IncomeStatementTab } from "@/components/tabs/income-statement-tab"
import { BalanceSheetTab } from "@/components/tabs/balance-sheet-tab"
import { cn } from "@/lib/utils"

export default function FinancialStatementsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const defaultYm = getBangkokRecentYearMonths(1)[0]
  const [yearMonthStart, setYearMonthStart] = React.useState(() => defaultYm)
  const [yearMonthEnd, setYearMonthEnd] = React.useState(() => defaultYm)
  const [storeFilter, setStoreFilter] = React.useState(() => (isManager && managerStore ? managerStore : "All"))
  const [loadingSummary, setLoadingSummary] = React.useState(false)
  const [tab, setTab] = React.useState<"income" | "balance">("income")
  const [queryToken, setQueryToken] = React.useState(0)
  const [sales, setSales] = React.useState(0)
  const [netProfit, setNetProfit] = React.useState(0)
  const [assets, setAssets] = React.useState(0)
  const [liabilities, setLiabilities] = React.useState(0)
  const [equity, setEquity] = React.useState(0)

  React.useEffect(() => {
    if (isManager && managerStore) setStoreFilter(managerStore)
  }, [isManager, managerStore])

  const storeOptions = isOffice
    ? [
        "본사",
        ...((storeList || []).filter(
          (s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office")
        ) || []),
      ]
    : isManager && managerStore
      ? [managerStore]
      : []

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  const formatBaht = (n: number) => `฿${(n || 0).toLocaleString()}`

  const loadSummary = React.useCallback(async () => {
    setLoadingSummary(true)
    const effectiveStore = storeFilter !== "All" ? storeFilter : undefined
    try {
      const [inc, bs] = await Promise.all([
        getIncomeStatement({
          yearMonth: yearMonthEnd,
          storeFilter: effectiveStore,
          userStore: auth?.store,
          userRole: auth?.role,
        }),
        getBalanceSheet({
          yearMonth: yearMonthEnd,
          storeFilter: effectiveStore,
          userStore: auth?.store,
          userRole: auth?.role,
        }),
      ])
      setSales(Number(inc.sales || 0))
      setNetProfit(Number(inc.netProfit || 0))
      setAssets(Number(bs.assets?.total || 0))
      setLiabilities(Number(bs.liabilities?.total || 0))
      setEquity(Number(bs.equity?.total || 0))
    } catch {
      setSales(0)
      setNetProfit(0)
      setAssets(0)
      setLiabilities(0)
      setEquity(0)
    } finally {
      setLoadingSummary(false)
    }
  }, [yearMonthEnd, storeFilter, auth?.store, auth?.role])

  React.useEffect(() => {
    void loadSummary()
  }, [loadSummary])

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
          <CardContent className="pt-4 space-y-4">
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
                  disabled={isManager || !storeOptions.length}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("pL_store")} />
                  </SelectTrigger>
                  <SelectContent>
                    {isOffice && <SelectItem value="All">{t("all")}</SelectItem>}
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                size="sm"
                onClick={() => {
                  void loadSummary()
                  setQueryToken((v) => v + 1)
                }}
                disabled={loadingSummary}
              >
                <Search className="h-4 w-4 mr-1" />
                {t("btn_query")}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <button
                type="button"
                className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setTab("income")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{t("pL_sales")}</div>
                  <span className="text-[11px] text-primary underline">{t("receivPayViewDetail")}</span>
                </div>
                <div className="text-base font-semibold mt-1">{loadingSummary ? t("loading") : formatBaht(sales)}</div>
              </button>
              <button
                type="button"
                className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setTab("income")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{t("pL_netProfit")}</div>
                  <span className="text-[11px] text-primary underline">{t("receivPayViewDetail")}</span>
                </div>
                <div className="text-base font-semibold mt-1">
                  {loadingSummary ? t("loading") : formatBaht(netProfit)}
                </div>
              </button>
              <button
                type="button"
                className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setTab("balance")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{t("bs_assets")}</div>
                  <span className="text-[11px] text-primary underline">{t("receivPayViewDetail")}</span>
                </div>
                <div className="text-base font-semibold mt-1">
                  {loadingSummary ? t("loading") : formatBaht(assets)}
                </div>
              </button>
              <button
                type="button"
                className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setTab("balance")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{t("bs_liabilities")}</div>
                  <span className="text-[11px] text-primary underline">{t("receivPayViewDetail")}</span>
                </div>
                <div className="text-base font-semibold mt-1">
                  {loadingSummary ? t("loading") : formatBaht(liabilities)}
                </div>
              </button>
              <button
                type="button"
                className="rounded-lg border p-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setTab("balance")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{t("bs_equity")}</div>
                  <span className="text-[11px] text-primary underline">{t("receivPayViewDetail")}</span>
                </div>
                <div className="text-base font-semibold mt-1">
                  {loadingSummary ? t("loading") : formatBaht(equity)}
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "income" | "balance")} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="income" className={adminTabsTriggerCn}>
                  {t("adminIncomeStatement")}
                </TabsTrigger>
                <TabsTrigger value="balance" className={adminTabsTriggerCn}>
                  {t("adminBalanceSheet")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

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
        </Tabs>
      </div>
    </div>
  )
}
