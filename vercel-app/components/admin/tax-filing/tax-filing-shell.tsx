"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { isManagerOrFranchiseeRole, isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { isHeadOfficeLikeStoreName } from "@/lib/internal-outbound"
import { TaxFilingVatTab } from "@/components/admin/tax-filing/tab-vat"
import { TaxFilingWhtTab } from "@/components/admin/tax-filing/tab-wht"
import { TaxFilingCitTab } from "@/components/admin/tax-filing/tab-cit"
import { TaxFilingSsoTab } from "@/components/admin/tax-filing/tab-sso"
import { TaxFilingStoreProfilesTab } from "@/components/admin/tax-filing/tab-store-profiles"

type FilingTabKey =
  | "pp30"
  | "pp36"
  | "pnd1"
  | "pnd3"
  | "pnd5051"
  | "pnd53"
  | "pnd54"
  | "sso"
  | "storeProfiles"

type FilingFilterProps = {
  filingYearMonth: string
  onFilingYearMonthChange: (v: string) => void
  filingStoreFilter: string
  onFilingStoreFilterChange: (v: string) => void
}

function useYmStoreFilter(defaultYm: () => string, defaultStore: () => string) {
  const [yearMonth, setYearMonth] = React.useState(defaultYm)
  const [store, setStore] = React.useState(defaultStore)
  return {
    filingYearMonth: yearMonth,
    onFilingYearMonthChange: setYearMonth,
    filingStoreFilter: store,
    onFilingStoreFilterChange: setStore,
    setStore,
  }
}

function useFilingTabFilters(
  storeOptions: string[],
  isOffice: boolean,
  isManager: boolean,
  managerStore: string,
  storeOptionLabel: (code: string) => string,
  tAccCompYearMonth: string,
  tAccCompStore: string,
  tSearch: string
) {
  const defaultYm = React.useCallback(() => getBangkokRecentYearMonths(1)[0], [])
  const defaultStore = React.useCallback(
    () => (isManager && managerStore ? managerStore : "All"),
    [isManager, managerStore]
  )

  const pp30 = useYmStoreFilter(defaultYm, defaultStore)
  const pp36 = useYmStoreFilter(defaultYm, defaultStore)
  const pnd1 = useYmStoreFilter(defaultYm, defaultStore)
  const pnd3 = useYmStoreFilter(defaultYm, defaultStore)
  const pnd5051 = useYmStoreFilter(defaultYm, defaultStore)
  const pnd53 = useYmStoreFilter(defaultYm, defaultStore)
  const pnd54 = useYmStoreFilter(defaultYm, defaultStore)
  const sso = useYmStoreFilter(defaultYm, defaultStore)
  const [storeProfilesStore, setStoreProfilesStore] = React.useState(defaultStore)

  React.useEffect(() => {
    if (isManager && managerStore) {
      pp30.setStore(managerStore)
      pp36.setStore(managerStore)
      pnd1.setStore(managerStore)
      pnd3.setStore(managerStore)
      pnd5051.setStore(managerStore)
      pnd53.setStore(managerStore)
      pnd54.setStore(managerStore)
      sso.setStore(managerStore)
      setStoreProfilesStore(managerStore)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync manager store once when auth store changes
  }, [isManager, managerStore])

  const FilingFiltersCard = React.useCallback(
    ({
      tabKey,
      yearMonth,
      onYearMonthChange,
      storeFilter,
      onStoreFilterChange,
      onSearch,
      searchDisabled,
    }: {
      tabKey: FilingTabKey
      yearMonth: string
      onYearMonthChange: (v: string) => void
      storeFilter: string
      onStoreFilterChange: (v: string) => void
      onSearch?: () => void
      searchDisabled?: boolean
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
            {onSearch ? (
              <div className="shrink-0">
                <Button
                  type="button"
                  variant="default"
                  className={cn(
                    "h-9 min-w-[88px] font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                  )}
                  disabled={searchDisabled}
                  onClick={onSearch}
                >
                  {tSearch}
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    ),
    [isOffice, isManager, managerStore, storeOptionLabel, storeOptions, tAccCompStore, tAccCompYearMonth, tSearch]
  )

  const pick = (f: ReturnType<typeof useYmStoreFilter>): FilingFilterProps => ({
    filingYearMonth: f.filingYearMonth,
    onFilingYearMonthChange: f.onFilingYearMonthChange,
    filingStoreFilter: f.filingStoreFilter,
    onFilingStoreFilterChange: f.onFilingStoreFilterChange,
  })

  const tabProps = React.useMemo(
    () => ({
      pp30: pick(pp30),
      pp36: pick(pp36),
      pnd1: pick(pnd1),
      pnd3: pick(pnd3),
      pnd5051: pick(pnd5051),
      pnd53: pick(pnd53),
      pnd54: pick(pnd54),
      sso: pick(sso),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- individual filter fields listed below
    [
      pp30.filingYearMonth,
      pp30.filingStoreFilter,
      pp36.filingYearMonth,
      pp36.filingStoreFilter,
      pnd1.filingYearMonth,
      pnd1.filingStoreFilter,
      pnd3.filingYearMonth,
      pnd3.filingStoreFilter,
      pnd5051.filingYearMonth,
      pnd5051.filingStoreFilter,
      pnd53.filingYearMonth,
      pnd53.filingStoreFilter,
      pnd54.filingYearMonth,
      pnd54.filingStoreFilter,
      sso.filingYearMonth,
      sso.filingStoreFilter,
    ]
  )

  return { FilingFiltersCard, tabProps, storeProfilesStore, setStoreProfilesStore }
}

function openStoreProfilesFrom(
  setTab: (v: string) => void,
  setStoreProfilesStore: (v: string) => void,
  storeFilter: string
) {
  if (storeFilter && storeFilter !== "All") setStoreProfilesStore(storeFilter)
  setTab("storeProfiles")
}

export function TaxFilingShell() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: storeList } = useStoreList()
  const role = auth?.role || ""
  const managerStore = (auth?.store || "").trim()
  const officeByStore = isOfficeStore(managerStore) || isHeadOfficeLikeStoreName(managerStore)
  const isOffice = isOfficeRole(role) || officeByStore
  const isManager = !isOffice && isManagerOrFranchiseeRole(role)

  const searchParams = useSearchParams()
  const [tab, setTab] = React.useState("pp30")

  React.useEffect(() => {
    const q = String(searchParams.get("tab") || "").trim()
    if (
      q === "storeProfiles" ||
      q === "pp30" ||
      q === "pp36" ||
      q === "pnd1" ||
      q === "pnd3" ||
      q === "pnd5051" ||
      q === "pnd53" ||
      q === "pnd54" ||
      q === "sso"
    ) {
      setTab(q)
      return
    }
    // 이전 링크 호환성
    if (q === "vat" || q === "pp30pp36") {
      setTab("pp30")
    } else if (q === "wht" || q === "pnd1391") {
      setTab("pnd1")
    } else if (q === "cit") {
      setTab("pnd5051")
    } else if (q === "dbd" || q === "workflow" || q === "pnd5354") {
      setTab("pnd53")
    }
  }, [searchParams])

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    const uniq = Array.from(
      new Set((storeList || []).map((s) => String(s).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    return ["All", ...uniq]
  }, [isOffice, isManager, managerStore, storeList])

  const storeOptionLabel = React.useCallback((code: string) => (code === "All" ? t("all") : code), [t])

  const [ssoSearchTick, setSsoSearchTick] = React.useState(0)

  const { FilingFiltersCard, tabProps, storeProfilesStore, setStoreProfilesStore } = useFilingTabFilters(
    storeOptions,
    isOffice,
    isManager,
    managerStore,
    storeOptionLabel,
    t("accCompYearMonth"),
    t("accCompStore"),
    t("search")
  )

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="storeProfiles" className={adminTabsTriggerCn}>
              {t("taxFilingTabStoreProfiles")}
            </TabsTrigger>
            <TabsTrigger value="pp30" className={adminTabsTriggerCn}>
              {t("taxFilingTabPp30")}
            </TabsTrigger>
            <TabsTrigger value="pp36" className={adminTabsTriggerCn}>
              {t("taxFilingTabPp36")}
            </TabsTrigger>
            <TabsTrigger value="pnd1" className={adminTabsTriggerCn}>
              {t("taxFilingTabPnd1")}
            </TabsTrigger>
            <TabsTrigger value="pnd3" className={adminTabsTriggerCn}>
              {t("taxFilingTabPnd3")}
            </TabsTrigger>
            <TabsTrigger value="pnd5051" className={adminTabsTriggerCn}>
              {t("taxFilingTabPnd5051")}
            </TabsTrigger>
            <TabsTrigger value="pnd53" className={adminTabsTriggerCn}>
              {t("taxFilingTabPnd53")}
            </TabsTrigger>
            <TabsTrigger value="pnd54" className={adminTabsTriggerCn}>
              {t("taxFilingTabPnd54")}
            </TabsTrigger>
            <TabsTrigger value="sso" className={adminTabsTriggerCn}>
              {t("taxFilingTabSso")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="storeProfiles" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingStoreProfilesTab
            filingStoreFilter={storeProfilesStore}
            onFilingStoreFilterChange={setStoreProfilesStore}
          />
        </TabsContent>
        <TabsContent value="pp30" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingVatTab
            {...tabProps.pp30}
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pp30.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pp36" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab
            {...tabProps.pp36}
            whtFocusMode="pp36"
            initialWhtSubmissionFormHint="ALL"
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pp36.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pnd1" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab
            {...tabProps.pnd1}
            whtFocusMode="pnd1"
            initialWhtSubmissionFormHint="ALL"
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pnd1.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pnd3" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab
            {...tabProps.pnd3}
            whtFocusMode="pnd3"
            initialWhtSubmissionFormHint="PND3"
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pnd3.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pnd5051" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingCitTab
            {...tabProps.pnd5051}
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pnd5051.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pnd53" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab
            {...tabProps.pnd53}
            whtFocusMode="pnd53"
            initialWhtSubmissionFormHint="PND53"
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pnd53.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="pnd54" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingWhtTab
            {...tabProps.pnd54}
            whtFocusMode="pnd54"
            initialWhtSubmissionFormHint="ALL"
            onOpenStoreProfiles={() =>
              openStoreProfilesFrom(setTab, setStoreProfilesStore, tabProps.pnd54.filingStoreFilter)
            }
          />
        </TabsContent>
        <TabsContent value="sso" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="sso"
            yearMonth={tabProps.sso.filingYearMonth}
            onYearMonthChange={tabProps.sso.onFilingYearMonthChange}
            storeFilter={tabProps.sso.filingStoreFilter}
            onStoreFilterChange={tabProps.sso.onFilingStoreFilterChange}
            onSearch={() => setSsoSearchTick((n) => n + 1)}
          />
          <TaxFilingSsoTab {...tabProps.sso} filingSearchTick={ssoSearchTick} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
