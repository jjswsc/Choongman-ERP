"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getAdminVendors,
  getPosSalesByMenuHierarchy,
  getPosSalesFilterOptions,
  type PosSalesHierarchyLevel,
  type PosSalesHierarchyRow,
} from "@/lib/api-client"
import { todayStrBangkok } from "@/lib/attendance-utils"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { sumHierarchyRows } from "@/lib/pos-sales-menu-hierarchy-aggregate"
import { ADMIN_BTN_XS_CN, ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import {
  buildPosStoreDisplayNameLookup,
  resolvePosStoreDisplayName,
} from "@/lib/pos-store-display-name"
import {
  buildTotalSalesExportFilename,
  downloadTotalSalesHierarchyXlsx,
} from "@/lib/total-sales-export"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type PeriodPreset = "today" | "month" | "custom"

const LEVELS: { id: PosSalesHierarchyLevel; labelKey: string; fallback: string }[] = [
  { id: "main", labelKey: "totalSalesLevelMain", fallback: "대분류" },
  { id: "category", labelKey: "totalSalesLevelCategory", fallback: "카테고리" },
  { id: "menu", labelKey: "totalSalesLevelMenu", fallback: "메인 메뉴" },
  { id: "option", labelKey: "totalSalesLevelOption", fallback: "옵션" },
]

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"]

const CHART_TOP_N = 12
const PIE_TOP_N = 8

function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

function normalizeStoreCodes(stores: string[]): string[] {
  const out: string[] = []
  for (const s of stores) {
    const v = String(s || "").trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

function topRowsForChart(rows: PosSalesHierarchyRow[], n: number) {
  return [...rows]
    .sort((a, b) => b.sales - a.sales || b.qty - a.qty)
    .slice(0, n)
    .map((r) => ({
      name: r.label.length > 28 ? `${r.label.slice(0, 26)}…` : r.label,
      fullName: r.label,
      qty: r.qty,
      sales: Math.round(r.sales),
    }))
}

function pieRowsFromHierarchy(rows: PosSalesHierarchyRow[], otherLabel: string) {
  const sorted = [...rows].sort((a, b) => b.sales - a.sales)
  const top = sorted.slice(0, PIE_TOP_N)
  const rest = sorted.slice(PIE_TOP_N)
  const out = top.map((r) => ({ name: r.label, sales: Math.round(r.sales) }))
  if (rest.length > 0) {
    out.push({
      name: otherLabel,
      sales: rest.reduce((s, r) => s + Math.round(r.sales), 0),
    })
  }
  return out.filter((r) => r.sales > 0)
}

export function TotalSalesTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => t(key) || fallback, [t])

  const canSearchAll = isOfficeRole(auth?.role || "")
  const today = todayStrBangkok()
  const monthRange = getBangkokMonthRange()

  const [startStr, setStartStr] = React.useState(today)
  const [endStr, setEndStr] = React.useState(today)
  const [periodPreset, setPeriodPreset] = React.useState<PeriodPreset>("today")
  const [search, setSearch] = React.useState("")
  const [searchAnd, setSearchAnd] = React.useState(false)
  const [level, setLevel] = React.useState<PosSalesHierarchyLevel>("menu")
  const [loading, setLoading] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [truncated, setTruncated] = React.useState(false)
  const [levelsData, setLevelsData] = React.useState<
    Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]> | null
  >(null)
  const [snapshotToday, setSnapshotToday] = React.useState<{ qty: number; sales: number } | null>(null)
  const [snapshotMonth, setSnapshotMonth] = React.useState<{ qty: number; sales: number } | null>(null)

  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const didAutoLoadRef = React.useRef(false)
  const [storeSearch, setStoreSearch] = React.useState("")
  const [storePickerOpen, setStorePickerOpen] = React.useState(false)
  const storePickerRef = React.useRef<HTMLDivElement | null>(null)
  const storePickerListId = React.useId()
  const storePickerBtnId = React.useId()

  const [posStoreNameLookup, setPosStoreNameLookup] = React.useState<Map<string, string>>(() => new Map())

  const storeChoices = React.useMemo(() => {
    const raw = canSearchAll
      ? posOptions
      : (() => {
          const out: string[] = []
          const main = String(auth?.store || "").trim()
          if (main) out.push(main)
          for (const x of auth?.allowedStores || []) {
            const s = String(x || "").trim()
            if (s && !out.includes(s)) out.push(s)
          }
          return out
        })()
    return filterPosSalesStoreOptionsForManagement(raw)
  }, [canSearchAll, posOptions, auth?.store, auth?.allowedStores])

  const filteredStoreOptions = React.useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return storeChoices
    return storeChoices.filter((code) => {
      const label = resolvePosStoreDisplayName(code, posStoreNameLookup).toLowerCase()
      return code.toLowerCase().includes(q) || label.includes(q)
    })
  }, [storeChoices, storeSearch, posStoreNameLookup])

  const posStoreDisplayName = React.useCallback(
    (code: string) => resolvePosStoreDisplayName(code, posStoreNameLookup),
    [posStoreNameLookup]
  )

  const salesFetchStores = React.useMemo(() => {
    const normalized = normalizeStoreCodes(selectedStores)
    return normalized.length > 0 ? normalized : undefined
  }, [selectedStores])

  const canQuery = canSearchAll ? (salesFetchStores?.length ?? 0) > 0 : true

  React.useEffect(() => {
    let cancel = false
    getAdminVendors()
      .then((list) => {
        if (!cancel) setPosStoreNameLookup(buildPosStoreDisplayNameLookup(list))
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [])

  React.useEffect(() => {
    if (!today) return
    getPosSalesFilterOptions({ startStr: monthRange.startStr, endStr: today }).then((r) => {
      setPosOptions(r.posOptions || [])
    })
  }, [today, monthRange.startStr])

  React.useEffect(() => {
    if (!canSearchAll && auth?.store) {
      setSelectedStores(normalizeStoreCodes([auth.store]))
    }
  }, [canSearchAll, auth?.store])

  React.useEffect(() => {
    if (!storePickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!storePickerRef.current?.contains(e.target as Node)) setStorePickerOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [storePickerOpen])

  const applyPeriodPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset)
    if (preset === "today") {
      setStartStr(today)
      setEndStr(today)
    } else if (preset === "month") {
      setStartStr(monthRange.startStr)
      setEndStr(today)
    }
  }

  const fetchHierarchy = React.useCallback(
    async (range: { startStr: string; endStr: string }) => {
      return getPosSalesByMenuHierarchy({
        startStr: range.startStr,
        endStr: range.endStr,
        stores: salesFetchStores,
        search: search.trim() || undefined,
        searchMode: searchAnd ? "and" : "or",
      })
    },
    [salesFetchStores, search, searchAnd]
  )

  const loadData = React.useCallback(async () => {
    if (!canQuery || !startStr || !endStr) return
    setLoading(true)
    try {
      const [mainRes, todayRes, monthRes] = await Promise.all([
        fetchHierarchy({ startStr, endStr }),
        fetchHierarchy({ startStr: today, endStr: today }),
        fetchHierarchy({ startStr: monthRange.startStr, endStr: today }),
      ])
      setLevelsData(mainRes.levels)
      setTruncated(!!mainRes.truncated)
      setSnapshotToday(sumHierarchyRows(todayRes.levels.menu))
      setSnapshotMonth(sumHierarchyRows(monthRes.levels.menu))
    } catch {
      setLevelsData(null)
      setSnapshotToday(null)
      setSnapshotMonth(null)
      setTruncated(false)
    } finally {
      setLoading(false)
    }
  }, [canQuery, startStr, endStr, fetchHierarchy, today, monthRange.startStr])

  React.useEffect(() => {
    if (canQuery && periodPreset === "today") {
      void loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트·매장 확정 시 1회
  }, [canQuery])

  const activeRows = levelsData?.[level] ?? []
  const totals = sumHierarchyRows(activeRows)
  const levelLabel = LEVELS.find((l) => l.id === level)?.fallback ?? level

  const categoryPieRows = React.useMemo(
    () =>
      levelsData?.category?.length
        ? pieRowsFromHierarchy(levelsData.category, tr("totalSalesChartOther", "기타"))
        : [],
    [levelsData?.category, tr]
  )

  const itemChartRows = React.useMemo(
    () => topRowsForChart(activeRows, CHART_TOP_N),
    [activeRows]
  )

  const storeLabelForExport = React.useMemo(() => {
    if (!canSearchAll) return selectedStores[0] ?? auth?.store ?? ""
    if (!salesFetchStores?.length) return ""
    if (salesFetchStores.length === 1) return posStoreDisplayName(salesFetchStores[0]!)
    if (salesFetchStores.length === storeChoices.length) return tr("salesSelectStoreAll", "전체 매장")
    return salesFetchStores.map((c) => posStoreDisplayName(c)).join(", ")
  }, [canSearchAll, salesFetchStores, storeChoices.length, selectedStores, auth?.store, posStoreDisplayName, tr])

  const handleExportExcel = React.useCallback(() => {
    if (!levelsData) return
    setExporting(true)
    try {
      const filename = buildTotalSalesExportFilename({
        startStr,
        endStr,
        storePart: storeLabelForExport || "store",
      })
      const metaRows: string[][] = [
        [tr("totalSalesTitle", "Total Sales")],
        [`${tr("salesStartDate", "시작일")}: ${startStr}`, `${tr("salesEndDate", "종료일")}: ${endStr}`],
        [`${tr("salesStore", "매장")}: ${storeLabelForExport}`],
      ]
      if (search.trim()) {
        metaRows.push([`${tr("totalSalesSearch", "메뉴 검색")}: ${search.trim()}`])
      }
      downloadTotalSalesHierarchyXlsx({
        filename,
        metaRows,
        sheetNames: {
          main: tr("totalSalesLevelMain", "대분류"),
          category: tr("totalSalesLevelCategory", "카테고리"),
          menu: tr("totalSalesLevelMenu", "메인 메뉴"),
          option: tr("totalSalesLevelOption", "옵션"),
        },
        col: {
          no: "#",
          name: tr("totalSalesColName", "명칭"),
          main: tr("totalSalesLevelMain", "대분류"),
          category: tr("totalSalesLevelCategory", "카테고리"),
          qty: tr("salesQuantity", "수량"),
          sales: tr("pL_sales", "매출"),
        },
        levels: levelsData,
      })
    } finally {
      setExporting(false)
    }
  }, [levelsData, startStr, endStr, storeLabelForExport, search, tr])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {tr(
          "totalSalesIntro",
          "POS 완료 주문 기준으로 대분류·카테고리·메인 메뉴·옵션별 수량·판매액을 봅니다. 메인 메뉴는 카탈로그명 기준, 옵션은 사이즈·맛 등 옵션별로 집계됩니다."
        )}
      </p>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={periodPreset === "today" ? "default" : "outline"}
                onClick={() => applyPeriodPreset("today")}
              >
                {tr("totalSalesPresetToday", "오늘")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={periodPreset === "month" ? "default" : "outline"}
                onClick={() => applyPeriodPreset("month")}
              >
                {tr("totalSalesPresetMonth", "이번 달")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={periodPreset === "custom" ? "default" : "outline"}
                onClick={() => setPeriodPreset("custom")}
              >
                {tr("totalSalesPresetCustom", "기간 지정")}
              </Button>
            </div>
            {periodPreset === "custom" ? (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{tr("salesStartDate", "시작일")}</span>
                  <Input
                    type="date"
                    value={startStr}
                    onChange={(e) => setStartStr(e.target.value)}
                    className="w-[11rem]"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{tr("salesEndDate", "종료일")}</span>
                  <Input
                    type="date"
                    value={endStr}
                    onChange={(e) => setEndStr(e.target.value)}
                    className="w-[11rem]"
                  />
                </label>
              </>
            ) : (
              <p className="pb-2 text-sm text-muted-foreground">
                {startStr} ~ {endStr} ({tr("totalSalesBangkokBizDay", "방콕 영업일")})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {canSearchAll ? (
              <div className="relative" ref={storePickerRef}>
                <span className="mb-1 block text-sm text-muted-foreground">{tr("salesSelectStore", "매장")}</span>
                <Button
                  id={storePickerBtnId}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-w-[220px] justify-between"
                  aria-expanded={storePickerOpen}
                  aria-controls={storePickerListId}
                  aria-haspopup="dialog"
                  onClick={() => setStorePickerOpen((prev) => !prev)}
                >
                  <span className="truncate text-left">
                    {selectedStores.length === 0
                      ? storeChoices.length === 0
                        ? tr("salesStorePickerLoading", "매장 목록 불러오는 중…")
                        : tr("salesSelectStorePrompt", "매장 선택")
                      : selectedStores.length === storeChoices.length && storeChoices.length > 1
                        ? tr("salesSelectStoreAll", "전체 매장")
                        : selectedStores.length === 1
                          ? posStoreDisplayName(selectedStores[0]!)
                          : `${selectedStores.length}${tr("selected", "개 선택")}`}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{storePickerOpen ? "▲" : "▼"}</span>
                </Button>
                {storePickerOpen ? (
                  <div
                    id={storePickerListId}
                    role="dialog"
                    aria-labelledby={storePickerBtnId}
                    className="absolute z-20 mt-1 w-[320px] rounded-md border bg-background p-2 shadow-lg"
                  >
                    <Input
                      value={storeSearch}
                      onChange={(e) => setStoreSearch(e.target.value)}
                      placeholder={tr("salesStoreSearch", "매장 검색")}
                      className="mb-2 h-8"
                    />
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_XS_CN}
                        onClick={() => setSelectedStores(normalizeStoreCodes([...storeChoices]))}
                      >
                        {tr("salesStoreSelectAll", "전체 선택")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_XS_CN}
                        onClick={() => setSelectedStores([])}
                      >
                        {tr("salesStoreDeselectAll", "전체 해제")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_XS_CN}
                        onClick={() => setStorePickerOpen(false)}
                      >
                        {tr("close", "닫기")}
                      </Button>
                    </div>
                    <div className="max-h-56 overflow-auto rounded border p-1">
                      {filteredStoreOptions.map((code) => (
                        <label
                          key={code}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={selectedStores.includes(code)}
                            onCheckedChange={() => {
                              setSelectedStores((prev) => {
                                const exists = prev.includes(code)
                                return exists ? prev.filter((v) => v !== code) : [...prev, code]
                              })
                            }}
                          />
                          <span className="text-sm">{posStoreDisplayName(code)}</span>
                        </label>
                      ))}
                      {filteredStoreOptions.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">
                          {tr("salesNoStoreResult", "검색 결과 없음")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="pb-2 text-sm">
                {tr("salesStore", "매장")}: {posStoreDisplayName(selectedStores[0] ?? auth?.store ?? "")}
              </p>
            )}
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">{tr("totalSalesSearch", "메뉴 검색")}</span>
              <Input
                placeholder={tr("totalSalesSearchPh", "예: Snow Onion")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
              <Checkbox checked={searchAnd} onCheckedChange={(c) => setSearchAnd(c === true)} />
              <span>{tr("salesMenuSearchAndMode", "검색어 모두 포함 (AND)")}</span>
            </label>
            <Button type="button" onClick={() => void loadData()} disabled={!canQuery || loading}>
              {tr("salesQuery", "조회")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!levelsData || exporting || loading}
              onClick={handleExportExcel}
            >
              {exporting ? tr("exporting", "보내는 중…") : tr("totalSalesExportExcel", "엑셀보내기")}
            </Button>
          </div>

          {canSearchAll && selectedStores.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-300" role="status">
              {tr(
                "salesSelectStoreHint",
                "매장을 선택하지 않으면 집계되지 않습니다. 한 매장·여러 매장은 체크 후 「조회」, 전 매장은 「전체 선택」 후 「조회」하세요."
              )}
            </p>
          ) : null}

          {snapshotToday && snapshotMonth ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{tr("totalSalesKpiTodayMenu", "오늘 (메인 메뉴 합)")}</p>
                <p className="mt-1 text-lg font-semibold font-erp-numeric">
                  {tr("totalSalesQtyUnit", "수량")} {snapshotToday.qty.toLocaleString()} · ฿
                  {formatSalesAmount(snapshotToday.sales)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {tr("totalSalesKpiMonthMenu", "이번 달 (메인 메뉴 합)")}
                </p>
                <p className="mt-1 text-lg font-semibold font-erp-numeric">
                  {tr("totalSalesQtyUnit", "수량")} {snapshotMonth.qty.toLocaleString()} · ฿
                  {formatSalesAmount(snapshotMonth.sales)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {monthRange.startStr} ~ {today}
                </p>
              </div>
            </div>
          ) : null}

          {levelsData && (categoryPieRows.length > 0 || itemChartRows.length > 0) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  {tr("totalSalesChartCategory", "카테고리")}
                </h3>
                {categoryPieRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <div className="mx-auto h-[260px] max-w-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPieRows}
                          dataKey="sales"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={96}
                          label={({ name, percent }) =>
                            `${String(name ?? "").slice(0, 14)} ${((percent ?? 0) * 100).toFixed(0)}%`
                          }
                        >
                          {categoryPieRows.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`฿${formatSalesAmount(v)}`, tr("pL_sales", "매출")]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  {tr("totalSalesChartItems", "품목")} ({tr(LEVELS.find((l) => l.id === level)?.labelKey ?? "", levelLabel)})
                </h3>
                {itemChartRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={itemChartRows} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-32} textAnchor="end" height={56} />
                        <YAxis yAxisId="qty" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="sales" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: number, key: string) => {
                            if (key === "qty") return [v.toLocaleString(), tr("salesQuantity", "수량")]
                            return [`฿${formatSalesAmount(v)}`, tr("pL_sales", "매출")]
                          }}
                          labelFormatter={(_, payload) =>
                            String((payload?.[0]?.payload as { fullName?: string })?.fullName ?? "")
                          }
                        />
                        <Legend />
                        <Bar
                          yAxisId="sales"
                          dataKey="sales"
                          fill="#84cc16"
                          name={tr("pL_sales", "매출")}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="qty"
                          type="monotone"
                          dataKey="qty"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot
                          name={tr("salesQuantity", "수량")}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-b pb-2">
            {LEVELS.map((lv) => (
              <Button
                key={lv.id}
                type="button"
                size="sm"
                variant={level === lv.id ? "default" : "outline"}
                onClick={() => setLevel(lv.id)}
              >
                {tr(lv.labelKey, lv.fallback)}
              </Button>
            ))}
          </div>

          {truncated ? (
            <p className={`text-sm ${ADMIN_PANEL_WARNING_CN}`} role="status">
              {tr(
                "salesDataTruncatedWarning",
                "조회 기간 내 주문이 많아 일부만 반영했을 수 있습니다. 기간을 나누어 조회해 보세요."
              )}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {tr("totalSalesActiveLevel", "집계 단위")}: {tr(LEVELS.find((l) => l.id === level)?.labelKey ?? "", levelLabel)}
            </span>
            <span className="font-erp-numeric">
              {tr("totalSalesTableTotal", "합계")}: {tr("totalSalesQtyUnit", "수량")} {totals.qty.toLocaleString()} · ฿
              {formatSalesAmount(totals.sales)}
            </span>
          </div>

          <div className="overflow-auto max-h-[calc(100vh-520px)] rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="border-b text-muted-foreground">
                  <th className="w-12 py-2 pl-3 text-left">#</th>
                  <th className="py-2 text-left">{tr("totalSalesColName", "명칭")}</th>
                  {level !== "main" ? (
                    <th className="hidden py-2 text-left md:table-cell">{tr("totalSalesLevelMain", "대분류")}</th>
                  ) : null}
                  {level === "option" || level === "menu" ? (
                    <th className="hidden py-2 text-left lg:table-cell">
                      {tr("totalSalesLevelCategory", "카테고리")}
                    </th>
                  ) : null}
                  <th className="py-2 pr-3 text-right">{tr("salesQuantity", "수량")}</th>
                  <th className="py-2 pr-3 text-right">{tr("pL_sales", "매출")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">
                      {tr("loading", "불러오는 중…")}
                    </td>
                  </tr>
                ) : activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </td>
                  </tr>
                ) : (
                  activeRows.map((row, idx) => (
                    <tr key={row.key} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 pl-3 text-muted-foreground">{idx + 1}</td>
                      <td className="py-1.5 pr-2">{row.label}</td>
                      {level !== "main" ? (
                        <td className="hidden py-1.5 md:table-cell text-muted-foreground">{row.categoryMain || "—"}</td>
                      ) : null}
                      {level === "option" || level === "menu" ? (
                        <td className="hidden py-1.5 lg:table-cell text-muted-foreground">{row.category || "—"}</td>
                      ) : null}
                      <td className="py-1.5 pr-3 text-right font-erp-numeric">{row.qty.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right font-erp-numeric">{formatSalesAmount(row.sales)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
