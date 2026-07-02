"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  POS_MAIN_CATEGORIES,
  getPresetCategoriesForMain,
  mainCategoryMatches,
} from "@/lib/pos-menu-categories"
import {
  costAnalysisMenuIdKey,
  isCostAnalysisBaseRow,
} from "@/lib/pos-cost-analysis-keys"
import {
  computePosCostRowMetrics,
  costRatioTierClass,
  downloadCsv,
  exportPosCostListCsv,
  rowMatchesIssueFilter,
  rowMatchesSaleFilter,
  summarizePosCostRows,
  type PosCostIssueFilter,
  type PosCostListSettings,
  type PosCostSaleFilter,
} from "@/lib/pos-cost-analysis-shared"
import { PosCostListKpi } from "@/components/cost-analysis/pos-cost-list-kpi"
import { getMenuCost } from "@/lib/api-client"

export type RowWithDisplayCode = PosMenuCostAnalysisRow & { displayCode: string }

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
  | "marginH"
  | "marginD"

function formatCookingTimeList(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v < 0) return ""
  const totalSec = Math.round(v * 60)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (sec === 0) return String(min)
  return `${min}:${String(sec).padStart(2, "0")}`
}

type Props = {
  rows: PosMenuCostAnalysisRow[]
  loading: boolean
  listQueried: boolean
  settings: PosCostListSettings
  lastLoadedAt: string | null
  onLoad: () => void
  onSelectRow: (row: PosMenuCostAnalysisRow) => void
  onRowsPatched?: (rows: PosMenuCostAnalysisRow[]) => void
  isOffice?: boolean
}

export function PosCostListPanel({
  rows,
  loading,
  listQueried,
  settings,
  lastLoadedAt,
  onLoad,
  onSelectRow,
  onRowsPatched,
  isOffice = false,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [saleFilter, setSaleFilter] = React.useState<PosCostSaleFilter>("active")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [issueFilter, setIssueFilter] = React.useState<PosCostIssueFilter>("all")
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [breakdownLoading, setBreakdownLoading] = React.useState<Set<string>>(new Set())
  const [listSort, setListSort] = React.useState<{ key: PosCostListSortKey; dir: "asc" | "desc" } | null>(
    null
  )

  const setListSortKey = React.useCallback((key: PosCostListSortKey) => {
    setListSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    })
  }, [])

  const categories = React.useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  const categoriesForSelectedMain = React.useMemo(() => {
    if (mainCategoryFilter === "all") return categories
    const set = new Set<string>()
    for (const r of rows) {
      if (!mainCategoryMatches(mainCategoryFilter, r.categoryMain, r.menuCode)) continue
      const c = String(r.category ?? "").trim()
      if (c) set.add(c)
    }
    const preset = getPresetCategoriesForMain(mainCategoryFilter)
    if (preset) for (const c of preset) set.add(c)
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
      const matchMainCat =
        mainCategoryFilter === "all" || mainCategoryMatches(mainCategoryFilter, r.categoryMain, r.menuCode)
      const matchIssue = rowMatchesIssueFilter(r, issueFilter, settings.misePercent, settings.costRatioCautionMax)
      const matchSale = rowMatchesSaleFilter(r, saleFilter)
      return matchTerm && matchCat && matchMainCat && matchIssue && matchSale
    })
  }, [rows, searchTerm, saleFilter, categoryFilter, mainCategoryFilter, issueFilter, settings.misePercent])

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
        out.push({
          ...o,
          displayCode:
            String(o.optionCode ?? "").trim() || `${base?.menuCode ?? menuId}-${i + 1}`,
        })
      })
    }
    return out
  }, [filtered])

  const sortedFlatList = React.useMemo((): RowWithDisplayCode[] => {
    if (!listSort) return flatList
    const dir = listSort.dir === "asc" ? 1 : -1
    const cookVal = (r: RowWithDisplayCode) => {
      const v = r.cookingTimeMin
      if (v == null || !Number.isFinite(v) || v < 0) return null
      return v
    }
    const nameKey = (r: RowWithDisplayCode) => `${r.menuName ?? ""}\0${r.optionName ?? ""}`
    return [...flatList].sort((a, b) => {
      const cmp = (n: number) => dir * n
      const ma = computePosCostRowMetrics(a, settings.misePercent, settings.costRatioCautionMax)
      const mb = computePosCostRowMetrics(b, settings.misePercent, settings.costRatioCautionMax)
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
          return cmp((a.priceDelivery ?? a.priceHall ?? 0) - (b.priceDelivery ?? b.priceHall ?? 0))
        case "costHall":
          return cmp(ma.costHMise - mb.costHMise)
        case "costDel":
          return cmp(ma.costDMise - mb.costDMise)
        case "ratioH":
          return cmp(ma.costRatioH - mb.costRatioH)
        case "ratioD":
          return cmp(ma.costRatioD - mb.costRatioD)
        case "marginH":
          return cmp(ma.marginH - mb.marginH)
        case "marginD":
          return cmp(ma.marginD - mb.marginD)
        default:
          return 0
      }
    })
  }, [flatList, listSort, settings.misePercent])

  const listSummary = React.useMemo(
    () => summarizePosCostRows(flatList, settings.misePercent, settings.costRatioCautionMax),
    [flatList, settings.misePercent, settings.costRatioCautionMax]
  )

  const rowKey = (r: RowWithDisplayCode) =>
    isCostAnalysisBaseRow(r)
      ? costAnalysisMenuIdKey(r.menuId)
      : `${costAnalysisMenuIdKey(r.menuId)}:${r.optionId}`

  const toggleExpand = async (r: RowWithDisplayCode, key: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const isOpen = expandedIds.has(key)
    if (isOpen) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }
    setExpandedIds((prev) => new Set(prev).add(key))
    if ((r.breakdown ?? []).length > 0) return

    setBreakdownLoading((prev) => new Set(prev).add(key))
    try {
      const data = await getMenuCost({
        menuId: String(r.menuId),
        optionId: r.optionId != null ? String(r.optionId) : undefined,
      })
      const breakdown = Array.isArray(data.breakdown)
        ? data.breakdown.map((b) => ({
            itemCode: b.itemCode,
            itemName: b.itemName,
            unit: b.unit ?? "",
            costPerUnit: b.costPerUnit,
            quantity: b.quantity,
            lossRate: b.lossRate,
            costTotal: b.costTotal,
            source: b.source ?? ("hq" as const),
            ingredientType: b.ingredientType ?? ("food" as const),
            quantityUnitKey: b.quantityUnitKey,
          }))
        : []
      if (breakdown.length > 0 && onRowsPatched) {
        const next = rows.map((row) => {
          const same =
            String(row.menuId) === String(r.menuId) &&
            String(row.optionId ?? "") === String(r.optionId ?? "")
          return same
            ? {
                ...row,
                breakdown,
                costHall: data.costHall ?? row.costHall,
                costDelivery: data.costDelivery ?? row.costDelivery,
              }
            : row
        })
        onRowsPatched(next)
      }
    } catch {
      /* ignore */
    } finally {
      setBreakdownLoading((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

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

  const sortBtn = (col: PosCostListSortKey, label: string, align: "left" | "center" | "right" = "left") => (
    <button
      type="button"
      className={cn(
        "inline-flex w-full min-w-0 items-center gap-0.5 rounded font-semibold text-foreground/90 hover:text-foreground hover:underline",
        align === "left" && "justify-start",
        align === "center" && "justify-center",
        align === "right" && "ml-auto justify-end"
      )}
      onClick={() => setListSortKey(col)}
    >
      {label}
      {listSortIcon(col)}
    </button>
  )

  const handleExportCsv = () => {
    const csv = exportPosCostListCsv(sortedFlatList, settings.misePercent)
    downloadCsv(`pos-cost-analysis-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={mainCategoryFilter}
          onValueChange={(v) => {
            setMainCategoryFilter(v)
            setCategoryFilter("all")
          }}
        >
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue placeholder={t("posMenuCategoryMain")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            {mainCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={
            categoriesForSelectedMain.includes(categoryFilter) || categoryFilter === "all"
              ? categoryFilter
              : "all"
          }
          onValueChange={setCategoryFilter}
        >
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder={t("posMenuCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            {categoriesForSelectedMain.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={saleFilter} onValueChange={(v) => setSaleFilter(v as PosCostSaleFilter)}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder={t("posCostSaleFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("posCostSaleActive")}</SelectItem>
            <SelectItem value="all">{t("posCostSaleAll")}</SelectItem>
            <SelectItem value="inactive">{t("posCostSaleInactive")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={issueFilter} onValueChange={(v) => setIssueFilter(v as PosCostIssueFilter)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue placeholder={t("posCostIssueFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="no_bom">{t("posCostIssueNoBom")}</SelectItem>
            <SelectItem value="zero_cost">{t("posCostIssueZeroCost")}</SelectItem>
            <SelectItem value="high_ratio">{t("posCostIssueHighRatio")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("posCostSearchPh")}
              className="h-9 pl-9 pr-9 text-sm border-border"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onLoad()
                }
              }}
            />
            {searchTerm ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <Button size="sm" className="h-9 px-4 gap-1.5 text-xs font-semibold" onClick={onLoad} disabled={loading}>
            <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
            {loading ? t("loading") : t("posCostBtnQuery")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 gap-1.5 text-xs"
            onClick={() => setListSort(null)}
            disabled={!listQueried || !listSort}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("posCostSortReset")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 gap-1.5 text-xs"
            onClick={handleExportCsv}
            disabled={!listQueried || flatList.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            {t("posCostExportCsv")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : !listQueried ? (
        <div className="rounded-xl border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("posCostClickSearchToLoad")}
        </div>
      ) : (
        <>
          {listSummary ? (
            <PosCostListKpi
              summary={listSummary}
              lastLoadedAt={lastLoadedAt}
              onIssueFilter={(kind) => setIssueFilter(kind)}
            />
          ) : null}

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto max-h-[min(70vh,900px)] overflow-y-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                  <tr className="border-b">
                    <th className="w-8 px-2 py-3 sticky left-0 z-20 bg-muted/95" aria-hidden />
                    <th className="px-2 py-2.5 text-center text-xs sticky left-8 z-20 bg-muted/95 min-w-[72px]">
                      {sortBtn("code", t("posMenuCode"), "center")}
                    </th>
                    <th className="px-2 py-2.5 text-center text-xs">{sortBtn("mainCat", t("posMenuCategoryMain"), "center")}</th>
                    <th className="px-2 py-2.5 text-center text-xs">{sortBtn("category", t("posMenuCategory"), "center")}</th>
                    <th className="px-2 py-2.5 text-center text-xs min-w-[140px]">{sortBtn("name", t("posMenuName"), "center")}</th>
                    <th className="px-2 py-2.5 text-center text-xs">{sortBtn("cook", t("posCostTableHdrCook"), "center")}</th>
                    <th className="px-2 py-2.5 text-center text-xs border-l border-border/60" colSpan={3}>
                      <span className="block text-center text-[10px] uppercase tracking-wide text-muted-foreground">{t("posCostDineIn")}</span>
                    </th>
                    <th className="px-2 py-2.5 text-center text-xs border-l border-border/60" colSpan={3}>
                      <span className="block text-center text-[10px] uppercase tracking-wide text-muted-foreground">{t("posCostDelivery")}</span>
                    </th>
                    <th className="px-2 py-2.5 text-center text-xs border-l border-border/60" colSpan={2}>
                      <span className="block text-center text-[10px] uppercase tracking-wide text-muted-foreground">{t("posCostMargin")}</span>
                    </th>
                  </tr>
                  <tr className="border-b bg-muted/80 text-xs">
                    <th colSpan={6} />
                    <th className="px-2 py-1.5 text-right">{sortBtn("priceHall", t("posCostPriceHall"), "right")}</th>
                    <th className="px-2 py-1.5 text-right">{sortBtn("costHall", t("posCostCostHall"), "right")}</th>
                    <th className="px-2 py-1.5 text-right">{sortBtn("ratioH", t("posCostRatioHall"), "right")}</th>
                    <th className="px-2 py-1.5 text-right border-l border-border/60">{sortBtn("priceDel", t("posCostPriceDelivery"), "right")}</th>
                    <th className="px-2 py-1.5 text-right">{sortBtn("costDel", t("posCostCostDelivery"), "right")}</th>
                    <th className="px-2 py-1.5 text-right">{sortBtn("ratioD", t("posCostRatioDelivery"), "right")}</th>
                    <th className="px-2 py-1.5 text-right border-l border-border/60">{sortBtn("marginH", t("posCostMarginHall"), "right")}</th>
                    <th className="px-2 py-1.5 text-right">{sortBtn("marginD", t("posCostMarginDelivery"), "right")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFlatList.map((r) => {
                    const key = rowKey(r)
                    const expanded = expandedIds.has(key)
                    const hasBreakdown = (r.breakdown ?? []).length > 0
                    const loadingBd = breakdownLoading.has(key)
                    const m = computePosCostRowMetrics(r, settings.misePercent, settings.costRatioCautionMax)
                    const menuLabel =
                      (r.menuName ?? "—") +
                      (r.optionName ? ` (${translatePosMenuLineForReceipt(r.optionName, t)})` : "")
                    const issueRow = m.issues.length > 0
                    return (
                      <React.Fragment key={key}>
                        <tr
                          className={cn(
                            "border-b transition-colors cursor-pointer",
                            r.optionId ? "bg-muted/10" : "",
                            issueRow && "bg-rose-500/[0.03]",
                            expanded ? "bg-amber-500/5" : "hover:bg-muted/20"
                          )}
                          onClick={() =>
                            onSelectRow({
                              ...r,
                              breakdown: Array.isArray(r.breakdown) ? r.breakdown : [],
                            })
                          }
                        >
                          <td
                            className="px-2 py-2 sticky left-0 z-[1] bg-inherit"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              disabled={loadingBd}
                              onClick={(e) => void toggleExpand(r, key, e)}
                            >
                              {loadingBd ? (
                                <span className="text-[10px]">…</span>
                              ) : expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs sticky left-8 z-[1] bg-inherit">{r.displayCode || "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.categoryMain ?? "-"}</td>
                          <td className="px-3 py-2 text-xs">{r.category ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{menuLabel}</span>
                            {m.issues.includes("no_bom") ? (
                              <span className="ml-1 text-[10px] text-rose-600">({t("posCostIssueNoBom")})</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                            {formatCookingTimeList(r.cookingTimeMin) || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{m.priceH.toFixed(0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{m.costHMise.toFixed(1)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-medium", costRatioTierClass(m.tierH))}>
                            {m.costRatioH.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums border-l border-border/40">{m.priceD.toFixed(0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{m.costDMise.toFixed(1)}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-medium", costRatioTierClass(m.tierD))}>
                            {m.costRatioD.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400 border-l border-border/40">
                            {m.marginH.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                            {m.marginD.toFixed(1)}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-b bg-muted/10">
                            <td colSpan={14} className="px-4 py-3">
                              {hasBreakdown ? (
                                <div className="rounded border bg-background overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b bg-muted/30">
                                        <th className="px-3 py-2 text-left">{t("posCostItemCode")}</th>
                                        <th className="px-3 py-2 text-left">{t("posCostSource")}</th>
                                        <th className="px-3 py-2 text-left">{t("posCostIngredientType")}</th>
                                        <th className="px-3 py-2 text-left">{t("posMenuIngredients")}</th>
                                        <th className="px-3 py-2 text-right">{t("posCostQty")}</th>
                                        <th className="px-3 py-2 text-right">{t("posIngredientLoss")}</th>
                                        <th className="px-3 py-2 text-right">{t("posMenuCost")}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(r.breakdown ?? []).map((b, i) => (
                                        <tr key={i} className="border-b last:border-b-0">
                                          <td className="px-3 py-2 font-mono">{b.itemCode || "—"}</td>
                                          <td className="px-3 py-2">{b.source === "hq" ? t("posCostSourceHq") : t("posCostSourceStore")}</td>
                                          <td className="px-3 py-2">
                                            {b.ingredientType === "packaging" ? t("posCostTypePackaging") : t("posCostTypeFood")}
                                          </td>
                                          <td className="px-3 py-2">{b.itemName}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">
                                            {(b.lossRate ?? 0) > 0 ? `${b.lossRate}%` : "—"}
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                                            {(b.costTotal ?? 0).toFixed(1)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-muted/20 px-3 py-2 text-xs">
                                    <span>
                                      {t("posCostFood")}: {(r.costHall ?? 0).toFixed(1)}
                                    </span>
                                    <span className="text-amber-600">
                                      {t("posCostPackaging")}: {((r.costDelivery ?? 0) - (r.costHall ?? 0)).toFixed(1)}
                                    </span>
                                    <span>
                                      {t("posCostSubTotal")}: {(r.costDelivery ?? 0).toFixed(1)}
                                    </span>
                                    {settings.misePercent > 0 ? (
                                      <span>
                                        {t("posCostMiseEnPlace")} ({settings.misePercent}%):{" "}
                                        {(m.costDMise - (r.costDelivery ?? 0)).toFixed(1)}
                                      </span>
                                    ) : null}
                                    <span className="font-semibold">
                                      {t("posMenuCost")}: {m.costDMise.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">{t("posCostNoBomExpandHint")}</p>
                              )}
                              <Link
                                href={`/admin/items?search=${encodeURIComponent((r.breakdown ?? [])[0]?.itemCode ?? "")}`}
                                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t("posCostOpenItems")}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {flatList.length === 0 && !loading && rows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground space-y-2">
                <p>{t("posCostEmptyAfterLoad")}</p>
                {isOffice ? <p className="text-xs opacity-80">{t("posCostEmptyHintDev")}</p> : null}
              </div>
            ) : null}
            {flatList.length === 0 && !loading && rows.length > 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">{t("posCostNoData")}</div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
