"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { ChevronDown, ChevronRight, Download, PackageSearch, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getIngredientUsageVariance,
  type IngredientUsageVarianceRow,
} from "@/lib/api-client"
import { getBangkokTodayDateString, addBangkokCalendarDays } from "@/lib/bangkok-time"
import { isOfficeStockSelection } from "@/lib/stock-location-patterns"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { LogisticsEmptyState, LogisticsTableSkeleton } from "@/components/erp/logistics-ui"

export interface StockIngredientVariancePanelProps {
  stores: string[]
  storeFilter: string
  setStoreFilter: (v: string) => void
  storeSelectDisabled?: boolean
}

function formatNum(n: number, maxFrac = 2): string {
  if (!Number.isFinite(n)) return "0"
  return Number(n.toFixed(maxFrac)).toLocaleString()
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function StockIngredientVariancePanel({
  stores,
  storeFilter,
  setStoreFilter,
  storeSelectDisabled = false,
}: StockIngredientVariancePanelProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const today = getBangkokTodayDateString()
  const [startYmd, setStartYmd] = React.useState(() => addBangkokCalendarDays(today, -6))
  const [endYmd, setEndYmd] = React.useState(today)
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<IngredientUsageVarianceRow[]>([])
  const [meta, setMeta] = React.useState<{
    orderCount: number
    unmatchedOrderLines: number
    actualSource: string
    warnings: string[]
    posTruncated: boolean
  } | null>(null)
  const [errorMsg, setErrorMsg] = React.useState("")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<"all" | "food" | "packaging">("all")
  const [minAbsVarPct, setMinAbsVarPct] = React.useState(0)
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  const storeOnlyBlocked = isOfficeStockSelection(storeFilter)

  const load = React.useCallback(async () => {
    const store = storeFilter.trim()
    if (!store) {
      setRows([])
      setMeta(null)
      setErrorMsg(t("stockVarianceNoStore") || "매장을 선택해 주세요.")
      return
    }
    if (isOfficeStockSelection(store)) {
      setRows([])
      setMeta(null)
      setErrorMsg(t("stockVarianceStoreOnly") || "매장만 조회할 수 있습니다. (본사 창고는 대상 아님)")
      return
    }
    setLoading(true)
    setErrorMsg("")
    try {
      const res = await getIngredientUsageVariance({ store, startYmd, endYmd })
      if (!res.success) {
        setRows([])
        setMeta(null)
        if (res.message === "STORE_ONLY") {
          setErrorMsg(t("stockVarianceStoreOnly") || "매장만 조회할 수 있습니다.")
        } else {
          setErrorMsg(res.message || t("msg_load_fail") || "조회 실패")
        }
        return
      }
      setRows(res.rows || [])
      setMeta({
        orderCount: res.orderCount || 0,
        unmatchedOrderLines: res.unmatchedOrderLines || 0,
        actualSource: res.actualSource || "none",
        warnings: res.warnings || [],
        posTruncated: Boolean(res.posTruncated),
      })
      setExpanded({})
    } catch (e) {
      setRows([])
      setMeta(null)
      setErrorMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [storeFilter, startYmd, endYmd, t])

  const filtered = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.ingredientType !== typeFilter) return false
      if (minAbsVarPct > 0) {
        if (r.variancePct == null) {
          if (Math.abs(r.varianceQty) < 0.0001) return false
        } else if (Math.abs(r.variancePct) < minAbsVarPct) return false
      }
      if (!q) return true
      return (
        r.itemCode.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q)
      )
    })
  }, [rows, searchTerm, typeFilter, minAbsVarPct])

  const exportCsv = () => {
    const headers = [
      "itemCode",
      "itemName",
      "unit",
      "type",
      "theoreticalQty",
      "actualQty",
      "varianceQty",
      "variancePct",
      "varianceCost",
      "beginningQty",
      "inboundQty",
      "outboundQty",
      "endingQty",
      "usageQty",
      "adjustmentQty",
      "posQty",
    ]
    const lines = [headers.join(",")]
    for (const r of filtered) {
      lines.push(
        [
          r.itemCode,
          r.itemName,
          r.unit,
          r.ingredientType,
          r.theoreticalQty,
          r.actualQty,
          r.varianceQty,
          r.variancePct ?? "",
          r.varianceCost,
          r.beginningQty,
          r.inboundQty,
          r.outboundQty,
          r.endingQty,
          r.usageQty,
          r.adjustmentQty,
          r.posQty,
        ]
          .map(csvEscape)
          .join(",")
      )
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `ingredient-variance_${storeFilter}_${startYmd}_${endYmd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground whitespace-pre-line">
        {t("stockVarianceIntro")}
      </p>

      <AdminFilterBar>
        <AdminFilterField label={t("store") || "매장"}>
          <Select
            value={storeFilter || "__none__"}
            onValueChange={(v) => setStoreFilter(v === "__none__" ? "" : v)}
            disabled={storeSelectDisabled}
          >
            <SelectTrigger className="h-9 w-[min(100vw-2rem,14rem)] bg-background text-xs">
              <SelectValue placeholder={t("salesSelectStorePrompt") || "매장 선택"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("salesSelectStorePrompt") || "매장 선택"}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AdminFilterField>
        <AdminFilterField label={t("stockVarianceStart") || "시작일"}>
          <Input
            type="date"
            className="h-9 w-[9.5rem] bg-background text-xs"
            value={startYmd}
            onChange={(e) => setStartYmd(e.target.value)}
          />
        </AdminFilterField>
        <AdminFilterField label={t("stockVarianceEnd") || "종료일"}>
          <Input
            type="date"
            className="h-9 w-[9.5rem] bg-background text-xs"
            value={endYmd}
            onChange={(e) => setEndYmd(e.target.value)}
          />
        </AdminFilterField>
        <AdminFilterField label={t("stockVarianceType") || "구분"}>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-9 w-[8.5rem] bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("stockVarianceTypeAll") || "전체"}</SelectItem>
              <SelectItem value="food">{t("stockVarianceTypeFood") || "식품"}</SelectItem>
              <SelectItem value="packaging">{t("stockVarianceTypePack") || "포장"}</SelectItem>
            </SelectContent>
          </Select>
        </AdminFilterField>
        <AdminFilterField label={t("stockVarianceMinPct") || "최소 |차이%|"}>
          <Input
            type="number"
            min={0}
            className="h-9 w-[5.5rem] bg-background text-xs"
            value={minAbsVarPct || ""}
            placeholder="0"
            onChange={(e) => setMinAbsVarPct(Math.max(0, Number(e.target.value) || 0))}
          />
        </AdminFilterField>
        <div className="flex items-end gap-2">
          <Button type="button" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("stockVarianceBtnLoad") || "조회"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("stockVarianceExport") || "CSV"}
          </Button>
        </div>
      </AdminFilterBar>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-xs"
          placeholder={t("stockVarianceSearchPh") || "품목 코드·이름 검색"}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {errorMsg ? (
        <p className="text-sm text-destructive">{errorMsg}</p>
      ) : null}

      {meta && !errorMsg ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("stockVarianceMetaOrders") || "완료 주문"}: {meta.orderCount}
          </span>
          <span>
            {t("stockVarianceMetaBomMiss") || "BOM 미매칭 라인"}: {meta.unmatchedOrderLines}
          </span>
          <span>
            {t("stockVarianceMetaSource") || "실제 집계"}:{" "}
            {meta.actualSource === "rpc"
              ? t("stockVarianceSourceRpc") || "RPC"
              : meta.actualSource === "fallback"
                ? t("stockVarianceSourceFallback") || "폴백"
                : "—"}
          </span>
          {meta.posTruncated ? (
            <span className="text-amber-700 dark:text-amber-400">
              {t("stockVariancePosTruncated") || "주문 조회 상한에 도달했을 수 있습니다."}
            </span>
          ) : null}
          {meta.warnings.includes("ACTUAL_RPC_FALLBACK") ? (
            <span className="text-amber-700 dark:text-amber-400">
              {t("stockVarianceRpcHint") ||
                "실제 소진 RPC 미배포 — JS 폴백 사용 중. SQL get_ingredient_usage_actual 배포를 권장합니다."}
            </span>
          ) : null}
        </div>
      ) : null}

      {storeOnlyBlocked && !loading ? (
        <LogisticsEmptyState
          icon={PackageSearch}
          title={t("stockVarianceStoreOnly") || "매장만 조회"}
          description={t("stockVarianceStoreOnlyHint") || "본사·입고등록 창고는 대상이 아닙니다."}
        />
      ) : loading ? (
        <LogisticsTableSkeleton rows={8} />
      ) : !filtered.length ? (
        <LogisticsEmptyState
          icon={PackageSearch}
          title={t("stockVarianceNoData") || "데이터 없음"}
          description={t("stockVarianceNoDataHint") || "기간·매장을 선택한 뒤 조회하세요."}
        />
      ) : (
        <AdminTableScroll className="rounded-md border" hint={false}>
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium w-6" />
                <th className="px-2 py-2 font-medium">{t("stockVarianceColCode") || "코드"}</th>
                <th className="px-2 py-2 font-medium">{t("stockVarianceColName") || "품목"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColTheo") || "이론"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColActual") || "실제"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColVar") || "차이"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColVarPct") || "차이%"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColVarCost") || "차이금액"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColUsage") || "Usage"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColAdj") || "조정"}</th>
                <th className="px-2 py-2 font-medium text-right">{t("stockVarianceColPos") || "POS"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const open = Boolean(expanded[r.itemCode])
                const varClass =
                  Math.abs(r.varianceQty) < 0.0001
                    ? ""
                    : r.varianceQty > 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-400"
                return (
                  <React.Fragment key={r.itemCode}>
                    <tr
                      className={cn(
                        "border-t hover:bg-muted/30 cursor-pointer",
                        r.hasAdjustment && "bg-amber-50/40 dark:bg-amber-950/20"
                      )}
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [r.itemCode]: !prev[r.itemCode] }))
                      }
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{r.itemCode}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium">{r.itemName}</span>
                        {r.unit ? (
                          <span className="ml-1 text-muted-foreground">({r.unit})</span>
                        ) : null}
                        {r.hasAdjustment ? (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                            {t("stockVarianceAdjBadge") || "실사/조정"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(r.theoreticalQty)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(r.actualQty)}</td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", varClass)}>
                        {formatNum(r.varianceQty)}
                      </td>
                      <td className={cn("px-2 py-1.5 text-right tabular-nums", varClass)}>
                        {r.variancePct == null ? "—" : `${formatNum(r.variancePct, 1)}%`}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(r.varianceCost)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNum(r.usageQty)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNum(r.adjustmentQty)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {formatNum(r.posQty)}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="mb-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                            <span>
                              {t("stockVarianceColBeg") || "기초"}: {formatNum(r.beginningQty)}
                            </span>
                            <span>
                              {t("stockVarianceColIn") || "입고"}: {formatNum(r.inboundQty)}
                            </span>
                            <span>
                              {t("stockVarianceColOut") || "출고"}: {formatNum(r.outboundQty)}
                            </span>
                            <span>
                              {t("stockVarianceColEnd") || "기말"}: {formatNum(r.endingQty)}
                            </span>
                          </div>
                          <p className="mb-1 text-[11px] font-medium text-foreground">
                            {t("stockVarianceMenuContrib") || "메뉴별 이론 기여"}
                          </p>
                          {r.menuContributions?.length ? (
                            <ul className="space-y-0.5 text-[11px]">
                              {r.menuContributions.slice(0, 40).map((c) => (
                                <li key={`${c.menuId}|${c.optionId}`} className="flex justify-between gap-4">
                                  <span>
                                    {c.menuLabel}
                                    {c.optionLabel ? ` / ${c.optionLabel}` : ""}
                                    <span className="ml-1 text-muted-foreground">#{c.menuId}</span>
                                  </span>
                                  <span className="tabular-nums">{formatNum(c.theoreticalQty)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              {t("stockVarianceNoMenuContrib") || "이론 기여 메뉴 없음 (판매 미반영 또는 BOM 없음)"}
                            </p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      )}
    </div>
  )
}
