"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import {
  BarChart3,
  Calculator,
  ClipboardList,
  FlaskConical,
  List,
  Scale,
} from "lucide-react"
import { StockIngredientVariancePanel } from "@/components/erp/stock-ingredient-variance-panel"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CostCalculatorTab } from "@/components/cost-analysis/cost-calculator-tab"
import { SauceCostTab } from "@/components/cost-analysis/sauce-cost-tab"
import { PosCostListPanel } from "@/components/cost-analysis/pos-cost-list-panel"
import { PosCostAuditPanel } from "@/components/cost-analysis/pos-cost-audit-panel"
import { PosCostActualTab } from "@/components/cost-analysis/pos-cost-actual-tab"
import { useAuth } from "@/lib/auth-context"
import {
  canAccessPosCostAnalysis,
  canEditPosCostAnalysis,
  isManagerOrFranchiseeRole,
} from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getCostSettings,
  getPosMenuCostAnalysis,
  useStoreList,
  type PosMenuCostAnalysisRow,
} from "@/lib/api-client"
import { dedupeOfficeStoreOptions } from "@/lib/office-store-canonical"
import { cn } from "@/lib/utils"
import {
  costAnalysisMenuIdKey,
  isCostAnalysisBaseRow,
  posCostAnalysisRowKey,
} from "@/lib/pos-cost-analysis-keys"
import { useSearchParams } from "next/navigation"
import {
  DEFAULT_POS_COST_LIST_SETTINGS,
  readPosCostSessionCache,
  writePosCostSessionCache,
  type PosCostListSettings,
} from "@/lib/pos-cost-analysis-shared"
import type { RowWithDisplayCode } from "@/components/cost-analysis/pos-cost-list-panel"

let posCostAnalysisLoadSeq = 0

export default function PosCostAnalysisPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canEdit = canEditPosCostAnalysis(auth?.role || "")
  const allowed = canAccessPosCostAnalysis(auth?.role || "")
  const isManager = React.useMemo(
    () => isManagerOrFranchiseeRole(auth?.role || ""),
    [auth?.role]
  )
  const userStore = (auth?.store || "").trim()
  const { posStores: rawStores } = useStoreList()
  const storesForVariance = React.useMemo(() => {
    const all = dedupeOfficeStoreOptions(rawStores || [])
    if (isManager && userStore) return [userStore]
    return all
  }, [rawStores, isManager, userStore])
  const [varianceStoreFilter, setVarianceStoreFilter] = React.useState("")
  const storeSelectDisabled = isManager && !!userStore

  React.useEffect(() => {
    if (isManager && userStore) setVarianceStoreFilter(userStore)
  }, [isManager, userStore])

  const [rows, setRows] = React.useState<PosMenuCostAnalysisRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [listQueried, setListQueried] = React.useState(false)
  const [lastLoadedAt, setLastLoadedAt] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(() => {
    const tab = (searchParams.get("tab") || "").trim()
    if (tab === "actual" || tab === "insights") return "actual"
    if (tab === "variance") return "variance"
    if (tab === "list" || tab === "sauce" || tab === "calculator" || tab === "audit") return tab
    return "list"
  })
  const [selectedForCalculator, setSelectedForCalculator] = React.useState<PosMenuCostAnalysisRow | null>(null)
  const [settings, setSettings] = React.useState<PosCostListSettings>(DEFAULT_POS_COST_LIST_SETTINGS)
  const initialDeepLinkHandledRef = React.useRef(false)

  React.useEffect(() => {
    void getCostSettings()
      .then((s) => {
        setSettings({
          misePercent: s.defaultMisePercent,
          costRatioGoodMax: s.costRatioGoodMax,
          costRatioCautionMax: s.costRatioCautionMax,
          categoryTargets: s.categoryTargets ?? {},
        })
      })
      .catch(() => {
        /* defaults */
      })
  }, [])

  React.useEffect(() => {
    if (!allowed || listQueried) return
    const cached = readPosCostSessionCache()
    if (cached?.rows?.length) {
      setRows(cached.rows)
      setListQueried(true)
      setLastLoadedAt(cached.at)
    }
  }, [allowed, listQueried])

  const refreshRows = React.useCallback(
    async (opts?: { summary?: boolean }): Promise<PosMenuCostAnalysisRow[] | null> => {
      if (!allowed) return null
      const seq = ++posCostAnalysisLoadSeq
      setLoading(true)
      const timeoutMs = process.env.NODE_ENV === "development" ? 600000 : 180000
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      )
      try {
        const data = await Promise.race([
          getPosMenuCostAnalysis({ summary: opts?.summary ?? true }),
          timeoutPromise,
        ])
        if (seq !== posCostAnalysisLoadSeq) return null
        const next = Array.isArray(data) ? data : []
        setRows(next)
        setListQueried(true)
        const at = new Date().toLocaleString("en-CA", { timeZone: "Asia/Bangkok", hour12: false })
        setLastLoadedAt(at)
        writePosCostSessionCache(next)
        return next
      } catch (e) {
        if (seq !== posCostAnalysisLoadSeq) return null
        console.error("getPosMenuCostAnalysis:", e)
        setRows([])
        setListQueried(false)
        return []
      } finally {
        if (seq === posCostAnalysisLoadSeq) setLoading(false)
      }
    },
    [allowed]
  )

  const loadList = React.useCallback(() => {
    void refreshRows({ summary: true })
  }, [refreshRows])

  React.useEffect(() => {
    if (initialDeepLinkHandledRef.current) return
    if (!allowed) return
    const focusMenuId = (searchParams.get("menuId") || "").trim()
    const focusMenuCode = (searchParams.get("menuCode") || "").trim().toLowerCase()
    if (!focusMenuId && !focusMenuCode) {
      initialDeepLinkHandledRef.current = true
      return
    }
    initialDeepLinkHandledRef.current = true
    void refreshRows({ summary: false }).then((arr) => {
      const source = Array.isArray(arr) ? arr : []
      const baseRow = source.find((r) => {
        if (!isCostAnalysisBaseRow(r)) return false
        if (focusMenuId && String(r.menuId) === focusMenuId) return true
        return focusMenuCode ? String(r.menuCode || "").trim().toLowerCase() === focusMenuCode : false
      })
      if (!baseRow) return
      setSelectedForCalculator({
        ...baseRow,
        breakdown: Array.isArray(baseRow.breakdown) ? baseRow.breakdown : [],
      })
      setActiveTab("calculator")
    })
  }, [allowed, refreshRows, searchParams])

  const fullFlatList = React.useMemo((): RowWithDisplayCode[] => {
    const order = [...new Set(rows.map((r) => costAnalysisMenuIdKey(r.menuId)))]
    const out: RowWithDisplayCode[] = []
    for (const menuId of order) {
      const base = rows.find(
        (r) => costAnalysisMenuIdKey(r.menuId) === menuId && isCostAnalysisBaseRow(r)
      )
      const opts = rows.filter(
        (r) => costAnalysisMenuIdKey(r.menuId) === menuId && !isCostAnalysisBaseRow(r)
      )
      if (base) out.push({ ...base, displayCode: base.menuCode ?? "" })
      opts.forEach((o, i) => {
        out.push({
          ...o,
          displayCode:
            String(o.optionCode ?? "").trim() || `${base?.menuCode ?? menuId}-${i + 1}`,
        })
      })
    }
    return out
  }, [rows])

  if (!allowed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission")}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
            <Calculator className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("posCostAnalysis")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("posCostAnalysisSub")}</p>
            {!canEdit && allowed ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">{t("posCostViewOnlyHint")}</p>
            ) : null}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="list" className={adminTabsTriggerCn}>
                <List className={adminTabsIconCn} aria-hidden />
                {t("posCostTabList")}
              </TabsTrigger>
              <TabsTrigger value="actual" className={adminTabsTriggerCn}>
                <BarChart3 className={adminTabsIconCn} aria-hidden />
                {t("posCostTabActual")}
              </TabsTrigger>
              <TabsTrigger value="variance" className={adminTabsTriggerCn}>
                <Scale className={adminTabsIconCn} aria-hidden />
                {t("posCostTabVariance")}
              </TabsTrigger>
              <TabsTrigger value="sauce" className={adminTabsTriggerCn}>
                <FlaskConical className={adminTabsIconCn} aria-hidden />
                {t("posCostTabSauce")}
              </TabsTrigger>
              <TabsTrigger value="calculator" className={adminTabsTriggerCn}>
                <Calculator className={adminTabsIconCn} aria-hidden />
                {t("posCostCalculator")}
              </TabsTrigger>
              <TabsTrigger value="audit" className={adminTabsTriggerCn}>
                <ClipboardList className={adminTabsIconCn} aria-hidden />
                {t("posCostAuditTab")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
            <PosCostListPanel
              rows={rows}
              loading={loading}
              listQueried={listQueried}
              settings={settings}
              lastLoadedAt={lastLoadedAt}
              onLoad={loadList}
              onRowsPatched={setRows}
              isOffice={canEdit}
              onSelectRow={(row) => {
                setSelectedForCalculator(row)
                setActiveTab("calculator")
              }}
            />
          </TabsContent>

          <TabsContent value="actual" className={cn(adminTabsContentCn, "space-y-4")}>
            <PosCostActualTab
              rows={rows}
              settings={settings}
              listQueried={listQueried}
              canEdit={canEdit}
              onSettingsSaved={setSettings}
            />
          </TabsContent>

          <TabsContent value="variance" className={cn(adminTabsContentCn, "space-y-4")}>
            <StockIngredientVariancePanel
              stores={storesForVariance}
              storeFilter={varianceStoreFilter}
              setStoreFilter={setVarianceStoreFilter}
              storeSelectDisabled={storeSelectDisabled}
            />
          </TabsContent>

          <TabsContent value="sauce" className={cn(adminTabsContentCn, "space-y-4")}>
            <SauceCostTab canEdit={canEdit} />
          </TabsContent>

          <TabsContent value="calculator" className={cn(adminTabsContentCn, "space-y-4")}>
            <CostCalculatorTab
              canEdit={canEdit}
              initialLoadFromRow={selectedForCalculator}
              listMisePercent={settings.misePercent}
              onClearLoad={() => setSelectedForCalculator(null)}
              onSaveSuccess={() => {
                void refreshRows({ summary: true }).then((arr) => {
                  if (!arr) return
                  setSelectedForCalculator((prev) => {
                    if (!prev) return prev
                    const key = posCostAnalysisRowKey(prev)
                    const fresh = arr.find((r) => posCostAnalysisRowKey(r) === key)
                    return fresh ?? prev
                  })
                })
              }}
              onReloadMenu={(row) => setSelectedForCalculator(row)}
              menuRows={fullFlatList}
              onMenuSelect={(row) => setSelectedForCalculator(row)}
            />
          </TabsContent>

          <TabsContent value="audit" className={cn(adminTabsContentCn, "space-y-4")}>
            <PosCostAuditPanel allowed={allowed} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
