"use client"

import * as React from "react"
import { Calculator, ChevronDown, ChevronRight, Download, Search, X, List, FlaskConical } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CostCalculatorTab } from "@/components/cost-analysis/cost-calculator-tab"
import { SauceCostTab } from "@/components/cost-analysis/sauce-cost-tab"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, canAccessPosCostAnalysis } from "@/lib/permissions"
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
import { POS_MAIN_CATEGORIES, mainCategoryMatches } from "@/lib/pos-menu-categories"

const MISE_RATE_DEFAULT = 3

/** 목록·계산기에서 옵션까지 코드로 구분 (예: c101, c101-1, c101-2) */
export type RowWithDisplayCode = PosMenuCostAnalysisRow & { displayCode: string }

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
  const [loading, setLoading] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [miseRate, setMiseRate] = React.useState(MISE_RATE_DEFAULT)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = React.useState("list")
  const [selectedForCalculator, setSelectedForCalculator] = React.useState<PosMenuCostAnalysisRow | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  if (!canAccessPosCostAnalysis(auth?.role || "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission") || "접근 권한이 없습니다."}</p>
      </div>
    )
  }

  const loadList = React.useCallback(async () => {
    setLoading(true)
    const timeoutMs = 60000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    )
    try {
      const data = await Promise.race([
        getPosMenuCostAnalysis(),
        timeoutPromise,
      ])
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error("getPosMenuCostAnalysis:", e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // 초기 마운트 시 자동 조회하지 않음. "조회" 버튼으로 로드.
  }, [])

  /** 계산기 탭 진입 시 데이터 없으면 자동 조회 — 메뉴 검색 드롭다운용 */
  React.useEffect(() => {
    if (activeTab === "calculator" && rows.length === 0 && !loading) {
      loadList()
    }
  }, [activeTab, rows.length, loading, loadList])

  const categories = React.useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  /** 선택한 대분류에 속한 카테고리만 (대분류 선택 시 카테고리 드롭다운용, Chicken/치킨 한영 매칭) */
  const categoriesForSelectedMain = React.useMemo(() => {
    if (mainCategoryFilter === "all") return categories
    const set = new Set(
      rows
        .filter((r) => mainCategoryMatches(mainCategoryFilter, r.categoryMain, r.menuCode))
        .map((r) => r.category)
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [rows, mainCategoryFilter, categories])

  const mainCategories = React.useMemo(() => {
    const fromRows = rows.map((r) => r.categoryMain).filter((c): c is string => Boolean(c))
    return Array.from(new Set([...POS_MAIN_CATEGORIES, ...fromRows])).sort()
  }, [rows])

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      const matchTerm =
        !searchTerm ||
        (r.menuName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.menuCode ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.optionName ?? "").toLowerCase().includes(searchTerm.toLowerCase())
      const matchCat = categoryFilter === "all" || r.category === categoryFilter
      const matchMainCat = mainCategoryFilter === "all" || mainCategoryMatches(mainCategoryFilter, r.categoryMain, r.menuCode)
      return matchTerm && matchCat && matchMainCat
    })
  }, [rows, searchTerm, categoryFilter, mainCategoryFilter])

  /** 목록용: 기본 메뉴 + 옵션을 각각 한 행으로. 옵션 코드는 메뉴 관리와 동일( sort_order 순으로 -1, -2, ... ) */
  const flatList = React.useMemo((): RowWithDisplayCode[] => {
    const order = [...new Set(filtered.map((r) => r.menuId))]
    const out: RowWithDisplayCode[] = []
    for (const menuId of order) {
      const base = filtered.find((r) => r.menuId === menuId && !r.optionId)
      const opts = filtered.filter((r) => r.menuId === menuId && r.optionId)
      if (base) out.push({ ...base, displayCode: base.menuCode ?? "" })
      opts.forEach((o, i) => {
        out.push({ ...o, displayCode: `${base?.menuCode ?? menuId}-${i + 1}` })
      })
    }
    return out
  }, [filtered])

  /** 원가 계산기용: 필터 없이 전체 메뉴 — 계산기에서 대분류·카테고리로 자체 필터링 */
  const fullFlatList = React.useMemo((): RowWithDisplayCode[] => {
    const order = [...new Set(rows.map((r) => r.menuId))]
    const out: RowWithDisplayCode[] = []
    for (const menuId of order) {
      const base = rows.find((r) => r.menuId === menuId && !r.optionId)
      const opts = rows.filter((r) => r.menuId === menuId && r.optionId)
      if (base) out.push({ ...base, displayCode: base.menuCode ?? "" })
      opts.forEach((o, i) => {
        out.push({ ...o, displayCode: `${base?.menuCode ?? menuId}-${i + 1}` })
      })
    }
    return out
  }, [rows])

  const toggleExpand = (rowKey: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
  }

  const rowKey = (r: RowWithDisplayCode) => (r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId)

  const withMise = (cost: number) =>
    Math.round(cost * (1 + miseRate / 100) * 10) / 10

  /** 현재 목록(flatList) 기준 평균 — 한눈에 원가 파악용 */
  const listSummary = React.useMemo(() => {
    if (flatList.length === 0) return null
    const miseMult = 1 + miseRate / 100
    let sumPriceH = 0
    let sumPriceD = 0
    let sumCostHMise = 0
    let sumCostDMise = 0
    for (const r of flatList) {
      const priceH = r.priceHall ?? 0
      const priceD = (r.priceDelivery ?? r.priceHall ?? 0) || 1
      const costHMise = Math.round((r.costHall ?? 0) * miseMult * 10) / 10
      const costDMise = Math.round((r.costDelivery ?? 0) * miseMult * 10) / 10
      sumPriceH += priceH
      sumPriceD += priceD
      sumCostHMise += costHMise
      sumCostDMise += costDMise
    }
    const n = flatList.length
    const avgPriceH = sumPriceH / n
    const avgPriceD = sumPriceD / n
    const avgCostH = sumCostHMise / n
    const avgCostD = sumCostDMise / n
    const avgRatioH = avgPriceH > 0 ? (avgCostH / avgPriceH) * 100 : 0
    const avgRatioD = avgPriceD > 0 ? (avgCostD / avgPriceD) * 100 : 0
    return { n, avgPriceH, avgPriceD, avgCostH, avgCostD, avgRatioH, avgRatioD }
  }, [flatList, miseRate])

  const handleExportCsv = () => {
    const csvRows: string[] = [
      toCsvRow(["코드", "대분류", "카테고리", "메뉴명", "옵션", "홀", "배달", "홀 원가", "배달 원가", "원가율(홀)%", "원가율(배달)%"]),
    ]
    for (const r of flatList) {
      const priceH = (r.priceHall ?? 0) || 1
      const priceD = (r.priceDelivery ?? r.priceHall ?? 0) || 1
      const costHMise = withMise(r.costHall ?? 0)
      const costDMise = withMise(r.costDelivery ?? 0)
      const ratioH = priceH > 0 ? (costHMise / priceH) * 100 : 0
      const ratioD = priceD > 0 ? (costDMise / priceD) * 100 : 0
      csvRows.push(toCsvRow([
        r.displayCode,
        r.categoryMain ?? "",
        r.category ?? "",
        r.menuName ?? "",
        r.optionName ?? "",
        r.priceHall ?? 0,
        r.priceDelivery ?? r.priceHall ?? 0,
        costHMise.toFixed(1),
        costDMise.toFixed(1),
        ratioH.toFixed(1),
        ratioD.toFixed(1),
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
          <Select
            value={mainCategoryFilter}
            onValueChange={(v) => {
              setMainCategoryFilter(v)
              setCategoryFilter("all")
            }}
          >
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
          <Select
            value={categoriesForSelectedMain.includes(categoryFilter) || categoryFilter === "all" ? categoryFilter : "all"}
            onValueChange={setCategoryFilter}
          >
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder={t("posMenuCategory") || "카테고리"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
              {categoriesForSelectedMain.map((c) => (
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
              onClick={loadList}
              disabled={loading}
            >
              <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
              {loading ? (t("loading") || "조회 중...") : (t("posCostBtnQuery") || "조회")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("posCostMise") || "Loss(%)"}</span>
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

        {listSummary && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-amber-700">
              {t("posCostListAverage") || "조회 품목 평균"} ({listSummary.n}{t("posCostItemsUnit") || "건"})
            </span>
            <span className="text-muted-foreground">
              {t("posCostPriceHall") || "홀"}: <span className="font-medium tabular-nums text-foreground">{listSummary.avgPriceH.toFixed(0)}</span>
            </span>
            <span className="text-muted-foreground">
              {t("posCostPriceDelivery") || "배달"}: <span className="font-medium tabular-nums text-foreground">{listSummary.avgPriceD.toFixed(0)}</span>
            </span>
            <span className="text-muted-foreground">
              {t("posCostCostHall") || "홀 원가"}: <span className="font-medium tabular-nums text-foreground">{listSummary.avgCostH.toFixed(1)}</span>
            </span>
            <span className="text-muted-foreground">
              {t("posCostCostDelivery") || "배달 원가"}: <span className="font-medium tabular-nums text-foreground">{listSummary.avgCostD.toFixed(1)}</span>
            </span>
            <span className="text-amber-600 font-medium tabular-nums">
              {t("posCostRatioHall") || "원가율(홀)"}: {listSummary.avgRatioH.toFixed(1)}%
            </span>
            <span className="text-amber-600 font-medium tabular-nums">
              {t("posCostRatioDelivery") || "원가율(배달)"}: {listSummary.avgRatioD.toFixed(1)}%
            </span>
          </div>
        )}

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
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostPriceHall") || "홀"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostPriceDelivery") || "배달"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostCostHall") || "홀 원가"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostCostDelivery") || "배달 원가"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostRatioHall") || "원가율(홀)"}</th>
                  <th className="px-3 py-3 text-right font-semibold text-xs">{t("posCostRatioDelivery") || "원가율(배달)"}</th>
                </tr>
              </thead>
              <tbody>
                {flatList.map((r) => {
                  const key = rowKey(r)
                  const expanded = expandedIds.has(key)
                  const hasBreakdown = (r.breakdown ?? []).length > 0
                  const priceH = (r.priceHall ?? 0) || 1
                  const priceD = (r.priceDelivery ?? r.priceHall ?? 1) || 1
                  const costHMise = withMise(r.costHall ?? 0)
                  const costDMise = withMise(r.costDelivery ?? 0)
                  const costRatioH = priceH > 0 ? (costHMise / priceH) * 100 : 0
                  const costRatioD = priceD > 0 ? (costDMise / priceD) * 100 : 0
                  const menuLabel = (r.menuName ?? "—") + (r.optionName ? ` (${r.optionName})` : "")
                  return (
                    <React.Fragment key={key}>
                      <tr
                        className={cn(
                          "border-b transition-colors cursor-pointer",
                          r.optionId ? "bg-muted/10" : "",
                          expanded ? "bg-amber-500/5" : "hover:bg-muted/20"
                        )}
                        onClick={() => {
                          const row = {
                            ...r,
                            breakdown: Array.isArray(r.breakdown) ? r.breakdown : [],
                          }
                          setSelectedForCalculator(row)
                          setActiveTab("calculator")
                        }}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          {hasBreakdown ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={(e) => toggleExpand(key, e)}
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          ) : (
                            <span className="w-6" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.displayCode || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.categoryMain ?? "-"}</td>
                        <td className="px-3 py-2 text-xs">{r.category ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{menuLabel}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{(r.priceHall ?? 0).toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(r.priceDelivery ?? r.priceHall ?? 0).toFixed(0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{costHMise.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{costDMise.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600 font-medium">{costRatioH.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-600 font-medium">{costRatioD.toFixed(1)}%</td>
                      </tr>
                      {expanded && hasBreakdown && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={10} className="px-4 py-3">
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
                                  {(r.breakdown ?? []).map((b, i) => (
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
                                      <td className="px-3 py-2 text-right tabular-nums font-medium">{(b.costTotal ?? 0).toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex justify-between border-t bg-muted/20 px-3 py-2 text-xs">
                                <span>{t("posCostFood") || "음식"}: {(r.costHall ?? 0).toFixed(1)}</span>
                                <span className="text-amber-600">{t("posCostPackaging") || "포장"}: {((r.costDelivery ?? 0) - (r.costHall ?? 0)).toFixed(1)}</span>
                                <span className="font-semibold">{t("posMenuCost") || "총"}: {(r.costDelivery ?? 0).toFixed(1)}</span>
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
          {flatList.length === 0 && !loading && rows.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostClickSearchToLoad") || "위에서 [조회] 버튼을 눌러 원가 분석 목록을 불러오세요."}
            </div>
          )}
          {flatList.length === 0 && !loading && rows.length > 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostNoData") || "검색 조건에 맞는 데이터가 없습니다."}
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
                onSaveSuccess={() => {
                  getPosMenuCostAnalysis().then((data) => {
                    const arr = Array.isArray(data) ? data : []
                    setRows(arr)
                    if (selectedForCalculator) {
                      const key = selectedForCalculator.optionId
                        ? `${selectedForCalculator.menuId}:${selectedForCalculator.optionId}`
                        : String(selectedForCalculator.menuId)
                      const fresh = arr.find(
                        (r) => (r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId) === key
                      )
                      if (fresh) setSelectedForCalculator(fresh)
                    }
                  }).catch(() => {})
                }}
                onReloadMenu={(row) => setSelectedForCalculator(row)}
                menuRows={fullFlatList}
                onMenuSelect={(row) => setSelectedForCalculator(row)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
