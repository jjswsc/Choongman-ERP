"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { TrendingUp, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  isFinancialStatementStoreNone,
} from "@/lib/financial-statement-store-options"
import { isAccountingRole, isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { canFranchiseeAggregateAllowedStores } from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootScrollableCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { IncomeStatementTab } from "@/components/tabs/income-statement-tab"
import { BalanceSheetTab } from "@/components/tabs/balance-sheet-tab"
import { LedgerReconciliationTab } from "@/components/tabs/ledger-reconciliation-tab"
import { ManagementMarginTab } from "@/components/tabs/management-margin-tab"
import { FinancialStatementStorePicker } from "@/components/financial-statements/financial-statement-store-picker"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { useErpPageActive, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  type FinancialStatementsTabId,
  financialStatementsPageViewCache,
} from "@/lib/financial-statements-view-cache"

const FS_TABS = ["income", "balance", "reconcile", "margin"] as const

function readFsPageCache(): ReturnType<typeof financialStatementsPageViewCache.read> {
  const snap = financialStatementsPageViewCache.read()
  if (!snap || snap.queryToken <= 0) return null
  if (!/^\d{4}-\d{2}$/.test(snap.yearMonthStart) || !/^\d{4}-\d{2}$/.test(snap.yearMonthEnd)) {
    return null
  }
  if (!FS_TABS.includes(snap.tab)) return null
  return snap
}

export default function FinancialStatementsPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList, storeLabels } = useStoreList()

  const { viewStore } = useStoreView()
  const isOffice = isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || "")
  const isManager = !isOffice && isManagerOrFranchiseeRole(auth?.role || "")
  const canFranchiseeMultiStore = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )
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
  const cachedPage = React.useMemo(() => readFsPageCache(), [])
  const [yearMonthStart, setYearMonthStart] = React.useState(
    () => cachedPage?.yearMonthStart ?? defaultYm
  )
  const [yearMonthEnd, setYearMonthEnd] = React.useState(
    () => cachedPage?.yearMonthEnd ?? defaultYm
  )
  const [storeFilter, setStoreFilter] = React.useState(() => {
    if (cachedPage?.storeFilter) return cachedPage.storeFilter
    return canFranchiseeMultiStore
      ? "All"
      : isManager && scopedStoreChoices[0]
        ? scopedStoreChoices[0]
        : "All"
  })
  const [tab, setTab] = useAdminUrlTab("tab", FS_TABS, "income")
  const [queryToken, setQueryToken] = React.useState(() => cachedPage?.queryToken ?? 0)
  const searchParams = useSearchParams()
  const pageActive = useErpPageActive()
  const pageActiveRef = useErpPageActiveRef()
  const urlAppliedRef = React.useRef(false)
  const tabRestoredRef = React.useRef(false)
  const storeSyncedFromViewRef = React.useRef(false)

  React.useEffect(() => {
    if (!pageActive) return
    if (urlAppliedRef.current) return
    urlAppliedRef.current = true
    const ymStart = searchParams.get("ymStart")
    const ymEnd = searchParams.get("ymEnd")
    const store = searchParams.get("store")
    if (ymStart && /^\d{4}-\d{2}$/.test(ymStart)) setYearMonthStart(ymStart)
    if (ymEnd && /^\d{4}-\d{2}$/.test(ymEnd)) setYearMonthEnd(ymEnd)
    if (store) setStoreFilter(store)
  }, [pageActive, searchParams])

  // URL에 tab이 없으면 캐시된 하위 탭 복원 (remount 시 default=income으로 떨어지지 않게)
  React.useLayoutEffect(() => {
    if (tabRestoredRef.current) return
    if (!pageActiveRef.current) return
    tabRestoredRef.current = true
    const raw = searchParams.get("tab")
    if (raw && FS_TABS.includes(raw as FinancialStatementsTabId)) return
    const snap = readFsPageCache()
    if (snap?.tab && snap.tab !== tab) setTab(snap.tab)
  }, [pageActiveRef, searchParams, setTab, tab])

  // pageActive를 deps에 넣으면 다른 메뉴 복귀 시 매장 필터가 덮여 조회가 어긋날 수 있음
  React.useEffect(() => {
    if (!pageActiveRef.current) return
    if (cachedPage && !storeSyncedFromViewRef.current) {
      storeSyncedFromViewRef.current = true
      return
    }
    storeSyncedFromViewRef.current = true
    if (!canFranchiseeMultiStore) {
      if (isManager && scopedStoreChoices[0]) setStoreFilter(scopedStoreChoices[0])
      return
    }
    const v = String(viewStore || "").trim()
    if (!v || v === "All") {
      setStoreFilter((prev) => (isFinancialStatementStoreNone(prev) ? prev : "All"))
      return
    }
    if (scopedStoreChoices.includes(v)) setStoreFilter(v)
  }, [
    cachedPage,
    canFranchiseeMultiStore,
    isManager,
    pageActiveRef,
    scopedStoreChoices,
    viewStore,
  ])

  React.useEffect(() => {
    // remount 직후 queryToken=0으로 캐시를 지우면 복원 전에 스냅샷이 사라짐
    if (queryToken <= 0) return
    financialStatementsPageViewCache.save({
      yearMonthStart,
      yearMonthEnd,
      storeFilter,
      queryToken,
      tab,
    })
  }, [yearMonthStart, yearMonthEnd, storeFilter, queryToken, tab])

  const franchiseStoreOptions = React.useMemo(
    () => buildFinancialStatementFranchiseStoreOptions(storeList, storeLabels),
    [storeList, storeLabels]
  )
  const managerStoreOptions = isManager ? scopedStoreChoices : []
  const managerFranchiseOptions = React.useMemo(
    () =>
      managerStoreOptions.map((code) => ({
        value: code,
        label: storeLabels[code] || code,
      })),
    [managerStoreOptions, storeLabels]
  )
  const showMultiStorePicker =
    isOffice || (canFranchiseeMultiStore && managerFranchiseOptions.length > 1)
  const storePickerOptions = isOffice ? franchiseStoreOptions : managerFranchiseOptions
  const storeAllLabel = isOffice
    ? t("all")
    : t("store_all_my_franchise_stores") || t("salesSelectMyFranchiseStoresAll") || "내 매장 전체"

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  return (
    <AccountingPageShell
      icon={TrendingUp}
      title={t("adminFinancialStatements")}
      subtitle={t("adminFinancialStatementsSub")}
    >
        <AdminFilterBar className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <AdminFilterField label={t("fs_periodStartMonth")} className="min-w-0 flex-1 sm:flex-none">
                <Select
                  value={yearMonthStart}
                  onValueChange={(v) => {
                    setYearMonthStart(v)
                    if (v > yearMonthEnd) setYearMonthEnd(v)
                  }}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[140px]">
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
              </AdminFilterField>
              <AdminFilterField label={t("fs_periodEndMonth")} className="min-w-0 flex-1 sm:flex-none">
                <Select
                  value={yearMonthEnd}
                  onValueChange={(v) => {
                    setYearMonthEnd(v)
                    if (v < yearMonthStart) setYearMonthStart(v)
                  }}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[140px]">
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
              </AdminFilterField>

              {(isOffice || isManager) && showMultiStorePicker ? (
                <AdminFilterField label={t("pL_store")} className="min-w-0 w-full sm:w-auto">
                  <FinancialStatementStorePicker
                    value={storeFilter}
                    onChange={setStoreFilter}
                    franchiseStoreOptions={storePickerOptions}
                    showOfficeOption={isOffice}
                    allLabel={storeAllLabel}
                    disabled={!isOffice && managerStoreOptions.length === 0}
                  />
                </AdminFilterField>
              ) : (isOffice || isManager) ? (
                <AdminFilterField label={t("pL_store")} className="min-w-0 flex-1 sm:flex-none">
                  <Select
                    value={storeFilter}
                    onValueChange={setStoreFilter}
                    disabled={isManager ? managerStoreOptions.length === 0 : false}
                  >
                    <SelectTrigger className="h-9 w-full sm:w-[160px]">
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
                      {isManager && canFranchiseeMultiStore ? (
                        <SelectItem value="All">{t("store_all_my_franchise_stores")}</SelectItem>
                      ) : null}
                      {isManager &&
                        managerStoreOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {storeLabels[s] || s}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </AdminFilterField>
              ) : null}

              <Button size="sm" className="h-9 w-full sm:w-auto" onClick={() => setQueryToken((v) => v + 1)}>
                <Search className="h-4 w-4 mr-1" />
                {t("btn_query")}
              </Button>
            </div>
        </AdminFilterBar>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as FinancialStatementsTabId)}
          className={adminTabsRootScrollableCn}
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
              <TabsTrigger value="margin" className={adminTabsTriggerCn}>
                {t("adminManagementMargin")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="income" className={cn(adminTabsContentCn, "space-y-3 max-sm:px-3 max-sm:py-3")}>
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
          <TabsContent value="margin" className={cn(adminTabsContentCn, "space-y-3")}>
            <ManagementMarginTab
              yearMonthStart={yearMonthStart}
              yearMonthEnd={yearMonthEnd}
              storeFilter={storeFilter}
              queryToken={queryToken}
            />
          </TabsContent>
        </Tabs>
    </AccountingPageShell>
  )
}
