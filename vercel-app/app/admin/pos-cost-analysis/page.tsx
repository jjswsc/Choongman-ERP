"use client"

import * as React from "react"
import { Calculator, ChevronDown, ChevronRight, Download, Search, X, List, FlaskConical } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CostCalculatorTab } from "@/components/cost-analysis/cost-calculator-tab"
import { SauceCostTab } from "@/components/cost-analysis/sauce-cost-tab"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosMenuCostAnalysis, type PosMenuCostAnalysisRow } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { POS_MAIN_CATEGORIES } from "@/lib/pos-menu-categories"

const MISE_RATE_DEFAULT = 3

function toCsvRow(cells: (string | number)[]): string {
  return cells.map((c) => {
    const s = String(c)
    const needsQuote = /[",\n\r]/.test(s)
    return needsQuote ? `"${s.replace(/"/g, '""')}"` : s
  }).join(",")
}

export default function PosCostAnalysisPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canEdit = isOfficeRole(auth?.role || "")
  const [rows, setRows] = React.useState<PosMenuCostAnalysisRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [miseRate, setMiseRate] = React.useState(MISE_RATE_DEFAULT)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = React.useState("list")
  const [selectedForCalculator, setSelectedForCalculator] = React.useState<PosMenuCostAnalysisRow | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    getPosMenuCostAnalysis()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const categories = React.useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  const mainCategories = React.useMemo(() => {
    const fromRows = new Set(rows.map((r) => r.categoryMain).filter(Boolean))
    return Array.from(new Set([...POS_MAIN_CATEGORIES, ...fromRows])).sort()
  }, [rows])

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      const matchTerm =
        !searchTerm ||
        r.menuName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.menuCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.optionName || "").toLowerCase().includes(searchTerm.toLowerCase())
      const matchCat = categoryFilter === "all" || r.category === categoryFilter
      const matchMainCat = mainCategoryFilter === "all" || (r.categoryMain ?? "") === mainCategoryFilter
      return matchTerm && matchCat && matchMainCat
    })
  }, [rows, searchTerm, categoryFilter, mainCategoryFilter])

  const toggleExpand = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getRowKey = (r: PosMenuCostAnalysisRow) =>
    r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId

  const withMise = (cost: number) =>
    Math.round(cost * (1 + miseRate / 100) * 10) / 10

  const handleExportCsv = () => {
    const csvRows: string[] = [
      toCsvRow(["코드", "대분류", "카테고리", "메뉴명", "옵션", "홀가격", "배달가격", "음식원가", "포장원가", "미세포함(홀)", "미세포함(배달)", "원가율(홀)%", "원가율(배달)%", "마진(홀)", "마진(배달)"]),
    ]
    for (const r of filtered) {
      const priceH = r.priceHall || 1
      const priceD = (r.priceDelivery ?? r.priceHall) || 1
      const costHMise = withMise(r.costHall)
      const costDMise = withMise(r.costDelivery)
      csvRows.push(toCsvRow([
        r.menuCode,
        r.categoryMain ?? "",
        r.category,
        r.menuName,
        r.optionName || "",
        r.priceHall,
        r.priceDelivery ?? r.priceHall,
        r.costHall,
        r.costDelivery - r.costHall,
        costHMise,
        costDMise,
        ((costHMise / priceH) * 100).toFixed(1),
        ((costDMise / priceD) * 100).toFixed(1),
        (priceH - costHMise).toFixed(1),
        (priceD - costDMise).toFixed(1),
      ]))
    }
    const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pos-cost-analysis-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
            <Calculator className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posCostAnalysis") || "원가 분석"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posCostAnalysisSub") || "메뉴별 원가·마진·재료 내역. 품목 코드=본사, 없음=매장 구매. 음식/포장재 구분."}
              {!canEdit && (
                <span className="block mt-0.5">
                  {t("posCostEditOfficeOnly") || "원가 데이터 수정은 오피스 직원만 가능합니다."}
                </span>
              )}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 border border-border">
            <TabsTrigger value="list" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <List className="h-4 w-4" />
              {t("posCostTabList") || "목록"}
            </TabsTrigger>
            <TabsTrigger value="sauce" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <FlaskConical className="h-4 w-4" />
              {t("posCostTabSauce") || "소스 원가"}
            </TabsTrigger>
            <TabsTrigger value="calculator" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Calculator className="h-4 w-4" />
              {t("posCostCalculator") || "원가 계산기"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

          <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={mainCategoryFilter} onValueChange={setMainCategoryFilter}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder={t("posMenuCategoryMain") || "대분류"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
              {mainCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder={t("posMenuCategory") || "카테고리"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px] max-w-sm flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("posCostSearchPh") || "코드·메뉴명·옵션 검색"}
                className="h-9 pl-9 pr-9 text-sm border-border"
                onKeyDown={(e) => e.key === "Enter" && searchInputRef.current?.blur?.()}
              />
              {searchTerm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button
              size="sm"
              className="h-9 px-4 gap-1.5 text-xs font-semibold"
              onClick={() => searchInputRef.current?.focus?.()}
            >
              <Search className="h-3.5 w-3.5" />
              {t("itemsBtnSearch") || "검색"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("posCostMise") || "미세(%)"}</span>
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              className="h-9 w-16 text-right text-xs"
              value={miseRate}
              onChange={(e) => setMiseRate(Number(e.target.value) || 0)}
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportCsv}>
            <Download className="h-3.5 w-3.5" />
            {t("posCostExportCsv") || "CSV 내보내기"}
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-3 py-3 text-left font-semibold text-xs">{t("posMenuCode") || "코드"}</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs">{t("posMenuCategoryMain") || "대분류"}</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs">{t("posMenuCategory") || "카테고리"}</th>
                  <th className="px-3 py-3 text-left font-semibold text-xs">{t("posMenuName") || "메뉴명"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posMenuPriceHall") || "홀(฿)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posMenuPriceDelivery") || "배달(฿)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostFood") || "음식"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostPackaging") || "포장"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostMiseTotal") || "미세(홀)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostMiseDelivery") || "미세(배달)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posMenuCostRatio") || "원가율"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostMargin") || "마진(홀)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostMarginDelivery") || "마진(배달)"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const key = getRowKey(r)
                  const expanded = expandedIds.has(key)
                  const priceH = r.priceHall || 1
                  const priceD = (r.priceDelivery ?? r.priceHall) || 1
                  const costHMise = withMise(r.costHall)
                  const costDMise = withMise(r.costDelivery)
                  const costRatioH = (costHMise / priceH) * 100
                  const costRatioD = (costDMise / priceD) * 100
                  const marginH = priceH - costHMise
                  const marginD = priceD - costDMise
                  const marginPctH = (marginH / priceH) * 100
                  const marginPctD = (marginD / priceD) * 100
                  const hasBreakdown = r.breakdown.length > 0
                  return (
                    <React.Fragment key={key}>
                      <tr
                        className={cn(
                          "border-b transition-colors cursor-pointer",
                          expanded ? "bg-amber-500/5" : "hover:bg-muted/20"
                        )}
                        onClick={() => {
                          setSelectedForCalculator(r)
                          setActiveTab("calculator")
                        }}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          {hasBreakdown ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleExpand(key)}
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          ) : (
                            <span className="w-6" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.menuCode}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.categoryMain ?? "-"}</td>
                        <td className="px-3 py-2 text-xs">{r.category}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{r.menuName}</span>
                          {r.optionName && (
                            <span className="ml-1 text-xs text-muted-foreground">({r.optionName})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.priceHall.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(r.priceDelivery ?? r.priceHall).toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.costHall.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{(r.costDelivery - r.costHall).toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{costHMise.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{costDMise.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600 text-xs">{costRatioH.toFixed(0)}% / {costRatioD.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className={marginH >= 0 ? "text-green-600" : "text-red-600"}>
                            {marginH.toFixed(0)} ({marginPctH.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className={marginD >= 0 ? "text-green-600" : "text-red-600"}>
                            {marginD.toFixed(0)} ({marginPctD.toFixed(0)}%)
                          </span>
                        </td>
                      </tr>
                      {expanded && hasBreakdown && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={14} className="px-4 py-3">
                            <div className="rounded border bg-background overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-3 py-2 text-left font-semibold">{t("posCostItemCode") || "품목코드"}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t("posCostSource") || "구분"}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t("posCostIngredientType") || "타입"}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t("posMenuIngredients") || "재료"}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t("posCostUnit") || "단위"}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t("posCostQty") || "수량"}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t("posIngredientLoss") || "로스"}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t("posMenuCost") || "원가"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.breakdown.map((b, i) => (
                                    <tr key={i} className="border-b last:border-b-0">
                                      <td className="px-3 py-2 font-mono">{b.itemCode || "—"}</td>
                                      <td className="px-3 py-2">
                                        <span className={b.source === "hq" ? "text-blue-600" : "text-muted-foreground"}>
                                          {b.source === "hq" ? (t("posCostSourceHq") || "본사") : (t("posCostSourceStore") || "매장")}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={b.ingredientType === "packaging" ? "text-amber-600" : ""}>
                                          {b.ingredientType === "packaging" ? (t("posCostTypePackaging") || "포장") : (t("posCostTypeFood") || "음식")}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">{b.itemName}</td>
                                      <td className="px-3 py-2 text-right">{b.unit || "—"}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{(b.lossRate ?? 0) > 0 ? `${b.lossRate}%` : "—"}</td>
                                      <td className="px-3 py-2 text-right tabular-nums font-medium">{b.costTotal.toFixed(1)} ฿</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex justify-between border-t bg-muted/20 px-3 py-2 text-xs">
                                <span>{t("posCostFood") || "음식"}: {r.costHall.toFixed(1)} ฿</span>
                                <span className="text-amber-600">{t("posCostPackaging") || "포장"}: {(r.costDelivery - r.costHall).toFixed(1)} ฿</span>
                                <span className="font-semibold">{t("posMenuCost") || "총"}: {r.costDelivery.toFixed(1)} ฿</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && !loading && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostNoData") || "표시할 데이터가 없습니다."}
            </div>
          )}
        </div>
          </TabsContent>

          <TabsContent value="sauce" className="space-y-4">
            <SauceCostTab />
          </TabsContent>

          <TabsContent value="calculator" className="space-y-4">
            <div className="dark rounded-lg">
              <CostCalculatorTab
                initialLoadFromRow={selectedForCalculator}
                onClearLoad={() => setSelectedForCalculator(null)}
                onSaveSuccess={() => getPosMenuCostAnalysis().then(setRows).catch(() => {})}
                menuRows={rows}
                onMenuSelect={(row) => setSelectedForCalculator(row)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
