"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  List,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
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
import {
  POS_MAIN_CATEGORIES,
  getPresetCategoriesForMain,
  mainCategoryMatches,
} from "@/lib/pos-menu-categories"
import {
  costAnalysisMenuIdKey,
  isCostAnalysisBaseRow,
  posCostAnalysisRowKey,
} from "@/lib/pos-cost-analysis-keys"
import { useSearchParams } from "next/navigation"

const MISE_RATE_DEFAULT = 3

type PosCostListSortKey =
  | "code"
  | "mainCat"
  | "category"
  | "name"
  | "cook"
  | "priceHall"
  | "priceDel"
  | "costHall"
  | "costDel"
  | "ratioH"
  | "ratioD"

function posCostListRowMiseAndRatios(r: PosMenuCostAnalysisRow) {
  const miseMult = 1 + MISE_RATE_DEFAULT / 100
  const m = (c: number) => Math.round(c * miseMult * 10) / 10
  const priceH = (r.priceHall ?? 0) || 1
  const priceD = (r.priceDelivery ?? r.priceHall ?? 0) || 1
  const costHMise = m(r.costHall ?? 0)
  const costDMise = m(r.costDelivery ?? 0)
  return {
    priceH,
    priceD,
    costHMise,
    costDMise,
    costRatioH: (costHMise / priceH) * 100,
    costRatioD: (costDMise / priceD) * 100,
  }
}

/**
 * React Strict Mode(dev)에서 마운트→언마운트→재마운트 시,
 * inFlight 가드로 두 번째 마운트가 fetch를 건너뛰고 첫 fetch의 setState는 버려져 목록이 영구히 비는 경우가 있다.
 * 최신 요청만 UI에 반영하고, 로딩은 "현재 진행 중인 최신 요청" 기준으로만 끈다.
 */
let posCostAnalysisLoadSeq = 0

/** 목록·계산기에서 옵션까지 코드로 구분 (예: c101, c101-1, c101-2) */
export type RowWithDisplayCode = PosMenuCostAnalysisRow & { displayCode: string }

/** POS 메뉴 cooking_time_min(소수=초) → 목록 표시 */
function formatCookingTimeList(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v < 0) return ""
  const totalSec = Math.round(v * 60)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (sec === 0) return String(min)
  return `${min}:${String(sec).padStart(2, "0")}`
}

export default function PosCostAnalysisPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canEdit = isOfficeRole(auth?.role || "")
  const [rows, setRows] = React.useState<PosMenuCostAnalysisRow[]>([])
  const [loading, setLoading] = React.useState(false)
  /** 목록 탭: [조회]를 누른 뒤에만 서버 데이터·표시 (배합 원가 탭과 동일 패턴) */
  const [listQueried, setListQueried] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = React.useState("list")
  const [selectedForCalculator, setSelectedForCalculator] = React.useState<PosMenuCostAnalysisRow | null>(null)
  const [listSort, setListSort] = React.useState<{ key: PosCostListSortKey; dir: "asc" | "desc" } | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const initialDeepLinkHandledRef = React.useRef(false)
  const allowed = canAccessPosCostAnalysis(auth?.role || "")

  const setListSortKey = React.useCallback((key: PosCostListSortKey) => {
    setListSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    })
  }, [])

  /**
   * 목록·저장 후 갱신 공통. 저장 직후 `getPosMenuCostAnalysis()`만 호출하면,
   * 그보다 먼저 시작된 초기/조회 `loadList`가 늦게 끝나며 예전 `setRows`로 덮어쓰는 경쟁이 난다.
   * 동일 시퀀스 가드로 한 번에 한 "최신" 응답만 반영한다.
   */
  const refreshRows = React.useCallback(async (): Promise<PosMenuCostAnalysisRow[] | null> => {
    if (!allowed) return null
    const seq = ++posCostAnalysisLoadSeq
    setLoading(true)
    /** 로컬(dev)은 Cold start·페이지네이션이 길어질 수 있어 배포보다 여유 있게 */
    const timeoutMs = process.env.NODE_ENV === "development" ? 600000 : 180000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), timeoutMs)
    )
    try {
      const data = await Promise.race([
        getPosMenuCostAnalysis(),
        timeoutPromise,
      ])
      if (seq !== posCostAnalysisLoadSeq) return null
      const next = Array.isArray(data) ? data : []
      setRows(next)
      setListQueried(true)
      return next
    } catch (e) {
      if (seq !== posCostAnalysisLoadSeq) return null
      console.error("getPosMenuCostAnalysis:", e)
      setRows([])
      setListQueried(false)
      return []
    } finally {
      if (seq === posCostAnalysisLoadSeq) {
        setLoading(false)
      }
    }
  }, [allowed])

  const loadList = React.useCallback(() => {
    void refreshRows()
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
    if (focusMenuCode) {
      setSearchTerm((prev) => prev || focusMenuCode.toUpperCase())
    }
    void refreshRows().then((arr) => {
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

  const categories = React.useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  /** 선택한 대분류에 속한 카테고리만 (DB 값 + 프리셋 병합 — category 미입력 시에도 드롭다운 유지) */
  const categoriesForSelectedMain = React.useMemo(() => {
    if (mainCategoryFilter === "all") return categories
    const set = new Set<string>()
    for (const r of rows) {
      if (!mainCategoryMatches(mainCategoryFilter, r.categoryMain, r.menuCode)) continue
      const c = String(r.category ?? "").trim()
      if (c) set.add(c)
    }
    const preset = getPresetCategoriesForMain(mainCategoryFilter)
    if (preset) {
      for (const c of preset) set.add(c)
    }
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
    const order = [...new Set(filtered.map((r) => costAnalysisMenuIdKey(r.menuId)))]
    const out: RowWithDisplayCode[] = []
    for (const menuId of order) {
      const base = filtered.find(
        (r) => costAnalysisMenuIdKey(r.menuId) === menuId && isCostAnalysisBaseRow(r)
      )
      const opts = filtered.filter(
        (r) => costAnalysisMenuIdKey(r.menuId) === menuId && !isCostAnalysisBaseRow(r)
      )
      if (base) out.push({ ...base, displayCode: base.menuCode ?? "" })
      opts.forEach((o, i) => {
        out.push({ ...o, displayCode: `${base?.menuCode ?? menuId}-${i + 1}` })
      })
    }
    return out
  }, [filtered])

  /** 원가 계산기용: 필터 없이 전체 메뉴 — 계산기에서 대분류·카테고리로 자체 필터링 */
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

  const rowKey = (r: RowWithDisplayCode) =>
    isCostAnalysisBaseRow(r) ? costAnalysisMenuIdKey(r.menuId) : `${costAnalysisMenuIdKey(r.menuId)}:${r.optionId}`

  const sortedFlatList = React.useMemo((): RowWithDisplayCode[] => {
    if (!listSort) return flatList
    const dir = listSort.dir === "asc" ? 1 : -1
    const cookVal = (r: RowWithDisplayCode) => {
      const v = r.cookingTimeMin
      if (v == null || !Number.isFinite(v) || v < 0) return null
      return v
    }
    const nameKey = (r: RowWithDisplayCode) =>
      `${r.menuName ?? ""}\0${r.optionName ?? ""}`
    return [...flatList].sort((a, b) => {
      const cmp = (n: number) => dir * n
      const ma = posCostListRowMiseAndRatios(a)
      const mb = posCostListRowMiseAndRatios(b)
      switch (listSort.key) {
        case "code":
          return cmp(a.displayCode.localeCompare(b.displayCode, "ko", { numeric: true }))
        case "mainCat":
          return cmp((a.categoryMain ?? "").localeCompare(b.categoryMain ?? "", "ko", { numeric: true }))
        case "category":
          return cmp((a.category ?? "").localeCompare(b.category ?? "", "ko", { numeric: true }))
        case "name":
          return cmp(nameKey(a).localeCompare(nameKey(b), "ko", { numeric: true }))
        case "cook": {
          const va = cookVal(a)
          const vb = cookVal(b)
          if (va == null && vb == null) return 0
          if (va == null) return 1
          if (vb == null) return -1
          return cmp(va - vb)
        }
        case "priceHall":
          return cmp((a.priceHall ?? 0) - (b.priceHall ?? 0))
        case "priceDel":
          return cmp(
            (a.priceDelivery ?? a.priceHall ?? 0) - (b.priceDelivery ?? b.priceHall ?? 0)
          )
        case "costHall":
          return cmp(ma.costHMise - mb.costHMise)
        case "costDel":
          return cmp(ma.costDMise - mb.costDMise)
        case "ratioH":
          return cmp(ma.costRatioH - mb.costRatioH)
        case "ratioD":
          return cmp(ma.costRatioD - mb.costRatioD)
        default:
          return 0
      }
    })
  }, [flatList, listSort])

  /** 현재 목록(flatList) 기준 평균 — 한눈에 원가 파악용(원가율 0%는 홀/배달 각각 집계에서 제외) */
  const listSummary = React.useMemo(() => {
    if (flatList.length === 0) return null
    const rowsH: PosMenuCostAnalysisRow[] = []
    const rowsD: PosMenuCostAnalysisRow[] = []
    for (const r of flatList) {
      const m = posCostListRowMiseAndRatios(r)
      if (m.costRatioH > 0) rowsH.push(r)
      if (m.costRatioD > 0) rowsD.push(r)
    }
    const nH = rowsH.length
    const nD = rowsD.length
    let sumPriceH = 0
    let sumPriceD = 0
    let sumCostHMise = 0
    let sumCostDMise = 0
    for (const r of rowsH) {
      sumPriceH += r.priceHall ?? 0
      const m = posCostListRowMiseAndRatios(r)
      sumCostHMise += m.costHMise
    }
    for (const r of rowsD) {
      sumPriceD += r.priceDelivery ?? r.priceHall ?? 0
      const m = posCostListRowMiseAndRatios(r)
      sumCostDMise += m.costDMise
    }
    const avgPriceH = nH > 0 ? sumPriceH / nH : 0
    const avgCostH = nH > 0 ? sumCostHMise / nH : 0
    const avgPriceD = nD > 0 ? sumPriceD / nD : 0
    const avgCostD = nD > 0 ? sumCostDMise / nD : 0
    const avgRatioH = avgPriceH > 0 ? (avgCostH / avgPriceH) * 100 : 0
    const avgRatioD = avgPriceD > 0 ? (avgCostD / avgPriceD) * 100 : 0
    return {
      n: flatList.length,
      nHall: nH,
      nDelivery: nD,
      avgPriceH,
      avgPriceD,
      avgCostH,
      avgCostD,
      avgRatioH,
      avgRatioD,
    }
  }, [flatList])

  const listSortIcon = (col: PosCostListSortKey) => {
    if (!listSort || listSort.key !== col) {
      return <ArrowUpDown className="inline h-3.5 w-3.5 shrink-0 opacity-45" aria-hidden />
    }
    return listSort.dir === "asc" ? (
      <ArrowUp className="inline h-3.5 w-3.5 shrink-0" aria-hidden />
    ) : (
      <ArrowDown className="inline h-3.5 w-3.5 shrink-0" aria-hidden />
    )
  }

  if (!allowed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission") || "접근 권한이 없습니다."}</p>
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  <List className={adminTabsIconCn} aria-hidden />
                  {t("posCostTabList") || "목록"}
                </TabsTrigger>
                <TabsTrigger value="sauce" className={adminTabsTriggerCn}>
                  <FlaskConical className={adminTabsIconCn} aria-hidden />
                  {t("posCostTabSauce") || "배합 원가"}
                </TabsTrigger>
                <TabsTrigger value="calculator" className={adminTabsTriggerCn}>
                  <Calculator className={adminTabsIconCn} aria-hidden />
                  {t("posCostCalculator") || "원가 계산기"}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    loadList()
                  }
                }}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5 text-xs"
              onClick={() => setListSort(null)}
              disabled={!listQueried || !listSort}
              title={t("posCostSortResetHint")}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t("posCostSortReset")}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("loading")}
          </div>
        ) : !listQueried ? (
          <div className="rounded-xl border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
            {t("posCostClickSearchToLoad") || "위에서 [조회] 버튼을 눌러 원가 분석 목록을 불러오세요."}
          </div>
        ) : (
          <>
        {listSummary && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-semibold text-amber-700">
                {t("posCostListAverage") || "조회 품목 평균"} ({listSummary.n}
                {t("posCostItemsUnit") || "건"})
              </span>
              <span className="text-muted-foreground">
                {t("posCostPriceHall") || "홀"}:{" "}
                <span className="font-medium tabular-nums text-foreground">{listSummary.avgPriceH.toFixed(0)}</span>
              </span>
              <span className="text-muted-foreground">
                {t("posCostPriceDelivery") || "배달앱"}:{" "}
                <span className="font-medium tabular-nums text-foreground">{listSummary.avgPriceD.toFixed(0)}</span>
              </span>
              <span className="text-muted-foreground">
                {t("posCostCostHall") || "홀 원가"}:{" "}
                <span className="font-medium tabular-nums text-foreground">{listSummary.avgCostH.toFixed(1)}</span>
              </span>
              <span className="text-muted-foreground">
                {t("posCostCostDelivery") || "배달앱 원가"}:{" "}
                <span className="font-medium tabular-nums text-foreground">{listSummary.avgCostD.toFixed(1)}</span>
              </span>
              <span className="text-amber-600 font-medium tabular-nums">
                {t("posCostRatioHall") || "원가율(홀)"}: {listSummary.avgRatioH.toFixed(1)}%
              </span>
              <span className="text-amber-600 font-medium tabular-nums">
                {t("posCostRatioDelivery") || "원가율(배달앱)"}: {listSummary.avgRatioD.toFixed(1)}%
              </span>
            </div>
            {(listSummary.nHall < listSummary.n || listSummary.nDelivery < listSummary.n) && (
              <p className="text-xs text-muted-foreground leading-snug">
                {`원가율이 0%인 메뉴는 홀·배달 각각 객가·원가·원가율 평균에서 제외되었습니다. (홀 ${listSummary.nHall}건, 배달앱 ${listSummary.nDelivery}건 기준)`}
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-8 px-2 py-3" aria-hidden />
                  <th className="px-2 py-2.5 text-left text-xs">
                    <button
                      type="button"
                      className="inline-flex w-full min-w-0 items-center justify-start gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("code")}
                    >
                      {t("posMenuCode") || "코드"}
                      {listSortIcon("code")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-left text-xs">
                    <button
                      type="button"
                      className="inline-flex w-full min-w-0 items-center justify-start gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("mainCat")}
                    >
                      {t("posMenuCategoryMain") || "대분류"}
                      {listSortIcon("mainCat")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-left text-xs">
                    <button
                      type="button"
                      className="inline-flex w-full min-w-0 items-center justify-start gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("category")}
                    >
                      {t("posMenuCategory") || "카테고리"}
                      {listSortIcon("category")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-left text-xs">
                    <button
                      type="button"
                      className="inline-flex w-full min-w-0 items-center justify-start gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("name")}
                    >
                      {t("posMenuName") || "메뉴명"}
                      {listSortIcon("name")}
                    </button>
                  </th>
                  <th
                    className="px-2 py-2.5 text-right text-xs whitespace-nowrap"
                    title={t("posMenuCookingTimeMin") || "조리 시간"}
                  >
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 max-w-full items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("cook")}
                    >
                      {t("posCostTableHdrCook") || t("posMenuCookingTimeMin") || "조리"}
                      {listSortIcon("cook")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("priceHall")}
                    >
                      {t("posCostPriceHall") || "홀"}
                      {listSortIcon("priceHall")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("priceDel")}
                    >
                      {t("posCostPriceDelivery") || "배달앱"}
                      {listSortIcon("priceDel")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("costHall")}
                    >
                      {t("posCostCostHall") || "홀 원가"}
                      {listSortIcon("costHall")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("costDel")}
                    >
                      {t("posCostCostDelivery") || "배달앱 원가"}
                      {listSortIcon("costDel")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("ratioH")}
                    >
                      {t("posCostRatioHall") || "원가율(홀)"}
                      {listSortIcon("ratioH")}
                    </button>
                  </th>
                  <th className="px-2 py-2.5 text-right text-xs">
                    <button
                      type="button"
                      className="ml-auto flex w-full min-w-0 items-center justify-end gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline"
                      onClick={() => setListSortKey("ratioD")}
                    >
                      {t("posCostRatioDelivery") || "원가율(배달앱)"}
                      {listSortIcon("ratioD")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFlatList.map((r) => {
                  const key = rowKey(r)
                  const expanded = expandedIds.has(key)
                  const hasBreakdown = (r.breakdown ?? []).length > 0
                  const m = posCostListRowMiseAndRatios(r)
                  const costHMise = m.costHMise
                  const costDMise = m.costDMise
                  const costRatioH = m.costRatioH
                  const costRatioD = m.costRatioD
                  const optionPartLabel = (n: string) => {
                    if (!n?.trim()) return n ?? ""
                    let s = String(n)
                    if (s.includes("순살")) s = s.replace(/순살/g, t("posOptionPartBoneless"))
                    if (s.includes("윙")) s = s.replace(/윙/g, t("posOptionPartWing"))
                    if (s.includes("봉")) s = s.replace(/봉/g, t("posOptionPartDrumstick"))
                    return s
                  }
                  const menuLabel = (r.menuName ?? "—") + (r.optionName ? ` (${optionPartLabel(r.optionName)})` : "")
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
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {formatCookingTimeList(r.cookingTimeMin) || "—"}
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
                          <td colSpan={12} className="px-4 py-3">
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
            <div className="px-6 py-12 text-center text-sm text-muted-foreground space-y-2">
              <p>
                {t("posCostEmptyAfterLoad") ||
                  "표시할 행이 없습니다. 서버가 0건을 돌려줬거나 응답 파싱에 실패했을 수 있습니다."}
              </p>
              <p className="text-xs opacity-80">
                {t("posCostEmptyHintDev") ||
                  "개발자 도구 Network에서 해당 요청 → Headers의 X-CM-Pos-Cost-Analysis-Rows, Response 본문을 확인하거나 Console 로그를 확인하세요."}
              </p>
            </div>
          )}
          {flatList.length === 0 && !loading && rows.length > 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostNoData") || "검색 조건에 맞는 데이터가 없습니다."}
            </div>
          )}
        </div>
          </>
        )}
          </TabsContent>

          <TabsContent value="sauce" className={cn(adminTabsContentCn, "space-y-4")}>
            <SauceCostTab />
          </TabsContent>

          <TabsContent value="calculator" className={cn(adminTabsContentCn, "space-y-4")}>
            <div className="dark rounded-lg">
              <CostCalculatorTab
                initialLoadFromRow={selectedForCalculator}
                onClearLoad={() => setSelectedForCalculator(null)}
                onSaveSuccess={() => {
                  void refreshRows().then((arr) => {
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
