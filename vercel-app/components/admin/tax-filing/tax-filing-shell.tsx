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
  | "pp30pp36"
  | "pnd1391"
  | "pnd5051"
  | "pnd5354"
  | "sso"
  | "storeProfiles"

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

  const [pp30pp36Ym, setPp30pp36Ym] = React.useState(defaultYm)
  const [pp30pp36Store, setPp30pp36Store] = React.useState(defaultStore)
  const [pnd1391Ym, setPnd1391Ym] = React.useState(defaultYm)
  const [pnd1391Store, setPnd1391Store] = React.useState(defaultStore)
  const [pnd5051Ym, setPnd5051Ym] = React.useState(defaultYm)
  const [pnd5051Store, setPnd5051Store] = React.useState(defaultStore)
  const [pnd5354Ym, setPnd5354Ym] = React.useState(defaultYm)
  const [pnd5354Store, setPnd5354Store] = React.useState(defaultStore)
  const [ssoYm, setSsoYm] = React.useState(defaultYm)
  const [ssoStore, setSsoStore] = React.useState(defaultStore)
  const [storeProfilesStore, setStoreProfilesStore] = React.useState(defaultStore)

  React.useEffect(() => {
    if (isManager && managerStore) {
      setPp30pp36Store(managerStore)
      setPnd1391Store(managerStore)
      setPnd5051Store(managerStore)
      setPnd5354Store(managerStore)
      setSsoStore(managerStore)
      setStoreProfilesStore(managerStore)
    }
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

  const tabProps = React.useMemo(
    () => ({
      pp30pp36: {
        filingYearMonth: pp30pp36Ym,
        onFilingYearMonthChange: setPp30pp36Ym,
        filingStoreFilter: pp30pp36Store,
        onFilingStoreFilterChange: setPp30pp36Store,
      },
      pnd1391: {
        filingYearMonth: pnd1391Ym,
        onFilingYearMonthChange: setPnd1391Ym,
        filingStoreFilter: pnd1391Store,
        onFilingStoreFilterChange: setPnd1391Store,
      },
      pnd5051: {
        filingYearMonth: pnd5051Ym,
        onFilingYearMonthChange: setPnd5051Ym,
        filingStoreFilter: pnd5051Store,
        onFilingStoreFilterChange: setPnd5051Store,
      },
      pnd5354: {
        filingYearMonth: pnd5354Ym,
        onFilingYearMonthChange: setPnd5354Ym,
        filingStoreFilter: pnd5354Store,
        onFilingStoreFilterChange: setPnd5354Store,
      },
      sso: {
        filingYearMonth: ssoYm,
        onFilingYearMonthChange: setSsoYm,
        filingStoreFilter: ssoStore,
        onFilingStoreFilterChange: setSsoStore,
      },
    }),
    [
      pp30pp36Ym,
      pp30pp36Store,
      pnd1391Ym,
      pnd1391Store,
      pnd5051Ym,
      pnd5051Store,
      pnd5354Ym,
      pnd5354Store,
      ssoYm,
      ssoStore,
    ]
  )

  return { FilingFiltersCard, tabProps, storeProfilesStore, setStoreProfilesStore }
}

export function TaxFilingShell() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()
  const role = auth?.role || ""
  const managerStore = (auth?.store || "").trim()
  const officeByStore = isOfficeStore(managerStore) || isHeadOfficeLikeStoreName(managerStore)
  const isOffice = isOfficeRole(role) || officeByStore
  const isManager = !isOffice && isManagerOrFranchiseeRole(role)

  const searchParams = useSearchParams()
  const [tab, setTab] = React.useState("pp30pp36")

  React.useEffect(() => {
    const q = String(searchParams.get("tab") || "").trim()
    if (
      q === "storeProfiles" ||
      q === "pp30pp36" ||
      q === "pnd1391" ||
      q === "pnd5051" ||
      q === "pnd5354" ||
      q === "sso"
    ) {
      setTab(q)
      return
    }
    // 이전 링크 호환성(vat/wht/cit 등)
    if (q === "vat") {
      setTab("pp30pp36")
    } else if (q === "wht") {
      setTab("pnd1391")
    } else if (q === "cit") {
      setTab("pnd5051")
    } else if (q === "dbd" || q === "workflow") {
      setTab("pnd5354")
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
  const [pp30SearchTick, setPp30SearchTick] = React.useState(0)

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
              <TabsTrigger value="pp30pp36" className={adminTabsTriggerCn}>
                {t("taxFilingTabPp30Pp36")}
              </TabsTrigger>
              <TabsTrigger value="pnd1391" className={adminTabsTriggerCn}>
                {t("taxFilingTabPnd1391")}
              </TabsTrigger>
              <TabsTrigger value="pnd5051" className={adminTabsTriggerCn}>
                {t("taxFilingTabPnd5051")}
              </TabsTrigger>
              <TabsTrigger value="pnd5354" className={adminTabsTriggerCn}>
                {t("taxFilingTabPnd5354")}
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
        <TabsContent value="pp30pp36" className={cn(adminTabsContentCn, "space-y-3")}>
          <TaxFilingVatTab
            {...tabProps.pp30pp36}
            onFilingSearch={() => setPp30SearchTick((n) => n + 1)}
            onOpenStoreProfiles={() => {
              const s = tabProps.pp30pp36.filingStoreFilter
              if (s && s !== "All") setStoreProfilesStore(s)
              setTab("storeProfiles")
            }}
          />
          <Card className="border-border/80">
            <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
              <p>{t("taxFilingNotePp36Bundled")}</p>
              <TaxFilingWhtTab
                {...tabProps.pp30pp36}
                filingSearchTick={pp30SearchTick}
                whtFocusMode="pp36"
                initialWhtSubmissionFormHint="ALL"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pnd1391" className={cn(adminTabsContentCn, "space-y-3")}>
          <Card className="border-border/80">
            <CardContent className="pt-4 text-xs text-muted-foreground leading-relaxed">
              {t("taxFilingNotePnd91Annual")}
            </CardContent>
          </Card>
          <TaxFilingWhtTab
            {...tabProps.pnd1391}
            whtFocusMode="pnd1391"
            initialWhtSubmissionFormHint="PND3"
            onOpenStoreProfiles={() => {
              const s = tabProps.pnd1391.filingStoreFilter
              if (s && s !== "All") setStoreProfilesStore(s)
              setTab("storeProfiles")
            }}
          />
        </TabsContent>
        <TabsContent value="pnd5051" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="pnd5051"
            yearMonth={tabProps.pnd5051.filingYearMonth}
            onYearMonthChange={tabProps.pnd5051.onFilingYearMonthChange}
            storeFilter={tabProps.pnd5051.filingStoreFilter}
            onStoreFilterChange={tabProps.pnd5051.onFilingStoreFilterChange}
          />
          <TaxFilingCitTab
            {...tabProps.pnd5051}
            onOpenStoreProfiles={() => {
              const s = tabProps.pnd5051.filingStoreFilter
              if (s && s !== "All") setStoreProfilesStore(s)
              setTab("storeProfiles")
            }}
          />
        </TabsContent>
        <TabsContent value="pnd5354" className={cn(adminTabsContentCn, "space-y-3")}>
          <FilingFiltersCard
            tabKey="pnd5354"
            yearMonth={tabProps.pnd5354.filingYearMonth}
            onYearMonthChange={tabProps.pnd5354.onFilingYearMonthChange}
            storeFilter={tabProps.pnd5354.filingStoreFilter}
            onStoreFilterChange={tabProps.pnd5354.onFilingStoreFilterChange}
          />
          <TaxFilingWhtTab
            {...tabProps.pnd5354}
            whtFocusMode="pnd5354"
            initialWhtSubmissionFormHint="PND53"
            onOpenStoreProfiles={() => {
              const s = tabProps.pnd5354.filingStoreFilter
              if (s && s !== "All") setStoreProfilesStore(s)
              setTab("storeProfiles")
            }}
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
