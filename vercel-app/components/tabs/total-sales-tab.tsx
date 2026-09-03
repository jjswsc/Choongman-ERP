"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/auth-context"
import { canSelectAllStoresForPosSalesManagement, isFranchiseeRole } from "@/lib/permissions"
import {
  canFranchiseeAggregateAllowedStores,
  resolveFranchiseePosSalesFetchStoreCodes,
} from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import { useSearchParams } from "next/navigation"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import { totalSalesViewCache } from "@/lib/total-sales-view-cache"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getAdminVendors,
  getPosSalesByMenuHierarchy,
  getPosSalesFilterOptions,
  type PosSalesByMenuHierarchyResult,
  type PosSalesHierarchyLevel,
  type PosSalesHierarchyRow,
} from "@/lib/api-client"
import { todayStrBangkok } from "@/lib/attendance-utils"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import {
  normalizeOrderTypesQueryString,
  parseOrderTypesParam,
  type PosOrderTypeValue,
} from "@/lib/pos-sales-order-type-filter"
import {
  buildHierarchyChannelCompareRows,
  topChannelCompareChartRows,
  type HierarchyLevelsByOrderType,
} from "@/lib/pos-sales-menu-hierarchy-compare"
import { sumHierarchyRows, filterHierarchyRowsByDrill, type PosSalesDrillFilter } from "@/lib/pos-sales-menu-hierarchy-aggregate"
import { ADMIN_BTN_XS_CN, ADMIN_CHART_COLORS, ADMIN_PANEL_WARNING_CN } from "@/lib/admin-ui-standards"
import {
  buildPosStoreDisplayNameLookup,
  resolvePosStoreDisplayName,
} from "@/lib/pos-store-display-name"
import {
  buildTotalSalesExportFilename,
  downloadTotalSalesChannelCompareXlsx,
  downloadTotalSalesHierarchyXlsx,
} from "@/lib/total-sales-export"
import {
  chickenPartDedupeKey,
  prettyChickenPartLibraryLabel,
} from "@/lib/pos-print-translate"
import {
  Bar,
  BarChart,
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

/**
 * 옵션 레벨 행("메뉴명 — M - Boneless")에서 치킨 부위만 추출해 합산.
 * Boneless(순살) / Wing(윙) / Drumette(봉) 3그룹 — 사이즈·메뉴 무시하고 부위만 합침.
 */
type OptionGroupRow = PosSalesHierarchyRow & { qtyPct: number; salesPct: number }

function aggregateByChickenPart(optionRows: PosSalesHierarchyRow[]): OptionGroupRow[] {
  const map = new Map<string, { qty: number; sales: number; sample: string }>()
  for (const row of optionRows) {
    const dashIdx = row.label.indexOf(" — ")
    const optName = dashIdx >= 0 ? row.label.slice(dashIdx + 3).trim() : row.label
    const partKey = chickenPartDedupeKey(optName)
    if (partKey !== "boneless" && partKey !== "wing" && partKey !== "drumette") continue
    const bucket = map.get(partKey) ?? { qty: 0, sales: 0, sample: optName }
    bucket.qty += row.qty
    bucket.sales += row.sales
    map.set(partKey, bucket)
  }
  const PART_ORDER = ["boneless", "wing", "drumette"] as const
  const PART_LABEL: Record<string, string> = {
    boneless: "Boneless (순살)",
    wing: "Wing (윙)",
    drumette: "Drumette (봉)",
  }
  const entries = PART_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const)
  const totalQty = entries.reduce((s, [, b]) => s + b.qty, 0)
  const totalSales = entries.reduce((s, [, b]) => s + b.sales, 0)
  return entries.map(([key, b]) => ({
    key: `part::${key}`,
    label: PART_LABEL[key] ?? prettyChickenPartLibraryLabel(key, b.sample),
    qty: b.qty,
    sales: b.sales,
    qtyPct: totalQty > 0 ? (b.qty / totalQty) * 100 : 0,
    salesPct: totalSales > 0 ? (b.sales / totalSales) * 100 : 0,
  }))
}

const CHART_COLORS = [...ADMIN_CHART_COLORS]

const CHART_TOP_N = 12
const PIE_TOP_N = 8

const SALES_ORDER_TYPE_TOGGLES: { type: PosOrderTypeValue; labelKey: string; fallback: string }[] = [
  { type: "dine_in", labelKey: "salesAmountKindDineIn", fallback: "홀" },
  { type: "takeout", labelKey: "salesAmountKindTakeout", fallback: "포장" },
  { type: "delivery", labelKey: "salesAmountKindDelivery", fallback: "배달" },
]

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

  const { viewStore } = useStoreView()
  const searchParams = useSearchParams()
  const allowTotalSalesUrlSync = useErpAllowUrlSync("/admin/total-sales")
  const pageActiveRef = useErpPageActiveRef()
  const urlHydratedRef = React.useRef(false)
  const viewCacheRestoredRef = React.useRef(false)

  const canSearchAll = canSelectAllStoresForPosSalesManagement(
    auth?.role || "",
    auth?.store || ""
  )
  const canFranchiseeMultiStore = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )
  const canMultiStorePicker = canSearchAll || canFranchiseeMultiStore
  const today = todayStrBangkok()
  const monthRange = React.useMemo(() => getBangkokMonthRange(), [])

  const [startStr, setStartStr] = React.useState(today)
  const [endStr, setEndStr] = React.useState(today)
  const [periodPreset, setPeriodPreset] = React.useState<PeriodPreset>("today")
  const [search, setSearch] = React.useState("")
  const [searchAnd, setSearchAnd] = React.useState(false)
  const [orderTypesKey, setOrderTypesKey] = React.useState("")
  const [compareChannels, setCompareChannels] = React.useState(false)
  const [level, setLevel] = React.useState<PosSalesHierarchyLevel>("menu")
  const [drillFilter, setDrillFilter] = React.useState<PosSalesDrillFilter>({})
  const [optionGroupMode, setOptionGroupMode] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [truncated, setTruncated] = React.useState(false)
  const [hasQueried, setHasQueried] = React.useState(false)
  const [queryError, setQueryError] = React.useState<string | null>(null)
  const [levelsData, setLevelsData] = React.useState<
    Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]> | null
  >(null)
  const loadIdRef = React.useRef(0)
  const deepLinkQueriedRef = React.useRef(false)
  const [byOrderTypeLevels, setByOrderTypeLevels] = React.useState<HierarchyLevelsByOrderType | null>(
    null
  )
  const [snapshotToday, setSnapshotToday] = React.useState<{ qty: number; sales: number } | null>(null)
  const [snapshotMonth, setSnapshotMonth] = React.useState<{ qty: number; sales: number } | null>(null)

  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [posOptionsLoading, setPosOptionsLoading] = React.useState(false)
  const [posOptionsLoadFailed, setPosOptionsLoadFailed] = React.useState(false)
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [storeSearch, setStoreSearch] = React.useState("")
  const [storePickerOpen, setStorePickerOpen] = React.useState(false)
  const storePickerRef = React.useRef<HTMLDivElement | null>(null)
  /** 사용자가「전체 해제」한 경우 자동 전체 선택·URL 복원 억제 */
  const skipDefaultStoreAutoSelectRef = React.useRef(false)
  const defaultStoresHydratedRef = React.useRef(false)
  const storePickerListId = React.useId()
  const storePickerBtnId = React.useId()

  React.useEffect(() => {
    if (urlHydratedRef.current) return
    if (!allowTotalSalesUrlSync) return
    const qStart = searchParams.get("start")
    const qEnd = searchParams.get("end")
    const qStores = searchParams.get("stores")
    if (!qStart && !qEnd && !qStores) return
    urlHydratedRef.current = true
    if (qStart) {
      setStartStr(qStart.slice(0, 10))
      setPeriodPreset("custom")
    }
    if (qEnd) setEndStr(qEnd.slice(0, 10))
    if (qStores) {
      const parts = qStores.split(",").map((s) => s.trim()).filter(Boolean)
      if (parts.length) setSelectedStores(parts)
    }
  }, [allowTotalSalesUrlSync, searchParams])

  React.useEffect(() => {
    if (viewCacheRestoredRef.current) return
    if (!pageActiveRef.current || !allowTotalSalesUrlSync) return
    viewCacheRestoredRef.current = true
    // URL 딥링크(기간·매장)가 있으면 캐시가 덮어쓰지 않음
    const qStart = String(searchParams.get("start") || "").trim()
    const qEnd = String(searchParams.get("end") || "").trim()
    const qStores = String(searchParams.get("stores") || "").trim()
    if (qStart || qEnd || qStores) return
    const snap = totalSalesViewCache.read()
    if (!snap?.hasQueried) return
    if (snap.startStr) setStartStr(snap.startStr)
    if (snap.endStr) setEndStr(snap.endStr)
    if (snap.periodPreset) setPeriodPreset(snap.periodPreset as PeriodPreset)
    setSelectedStores(Array.isArray(snap.selectedStores) ? snap.selectedStores : [])
    // 캐시 복원 시 기본「전체 매장 자동선택」이 덮어쓰지 않게
    defaultStoresHydratedRef.current = true
    skipDefaultStoreAutoSelectRef.current = true
    setSearch(snap.search || "")
    setSearchAnd(Boolean(snap.searchAnd))
    setOrderTypesKey(snap.orderTypesKey || "")
    setCompareChannels(Boolean(snap.compareChannels))
    if (snap.level) setLevel(snap.level)
    setDrillFilter(snap.drillFilter || {})
    setLevelsData(
      (snap.levelsData as Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]> | null) || null
    )
    setTruncated(Boolean(snap.truncated))
    setHasQueried(true)
  }, [allowTotalSalesUrlSync, pageActiveRef, searchParams])

  React.useEffect(() => {
    if (!hasQueried) {
      // remount 직후 초기 hasQueried=false로 clear하면 복원 스냅샷이 사라짐 — 미조회 시 저장만 생략
      return
    }
    totalSalesViewCache.save({
      startStr,
      endStr,
      periodPreset,
      selectedStores,
      search,
      searchAnd,
      orderTypesKey,
      compareChannels,
      level,
      drillFilter,
      levelsData,
      truncated,
      hasQueried: true,
    })
  }, [
    compareChannels,
    drillFilter,
    endStr,
    hasQueried,
    level,
    levelsData,
    orderTypesKey,
    periodPreset,
    search,
    searchAnd,
    selectedStores,
    startStr,
    truncated,
  ])

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

  const orderTypesParam = React.useMemo(
    () => parseOrderTypesParam(orderTypesKey || null) ?? undefined,
    [orderTypesKey]
  )

  const compareChannelsList = React.useMemo((): PosOrderTypeValue[] => {
    if (orderTypesParam?.length) return orderTypesParam
    return SALES_ORDER_TYPE_TOGGLES.map((x) => x.type)
  }, [orderTypesParam])

  const channelLabels = React.useMemo(() => {
    const out = {} as Record<PosOrderTypeValue, string>
    for (const row of SALES_ORDER_TYPE_TOGGLES) {
      out[row.type] = tr(row.labelKey, row.fallback)
    }
    return out
  }, [tr])

  const orderTypesSummaryLabel = React.useMemo(() => {
    if (orderTypesKey === "") return tr("salesAmountKindAll", "전체")
    return orderTypesKey
      .split(",")
      .filter(Boolean)
      .map((type) => {
        const hit = SALES_ORDER_TYPE_TOGGLES.find((x) => x.type === type)
        return hit ? tr(hit.labelKey, hit.fallback) : type
      })
      .join(", ")
  }, [orderTypesKey, tr])

  const setAllOrderTypes = React.useCallback(() => {
    setOrderTypesKey("")
  }, [])

  const toggleOrderTypeChannel = React.useCallback((t: PosOrderTypeValue) => {
    setOrderTypesKey((prev) => {
      const normalized = normalizeOrderTypesQueryString(prev)
      const parts = normalized ? normalized.split(",") : []
      const nextSet = new Set(parts as PosOrderTypeValue[])
      if (nextSet.size === 0) {
        nextSet.add(t)
      } else if (nextSet.has(t)) {
        nextSet.delete(t)
      } else {
        nextSet.add(t)
      }
      return [...nextSet].sort().join(",")
    })
  }, [])

  const canQuery = canMultiStorePicker ? (salesFetchStores?.length ?? 0) > 0 : true

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

  const posOptionsLoadIdRef = React.useRef(0)

  const loadPosOptions = React.useCallback(() => {
    if (!startStr || !endStr || !canSearchAll) return
    const id = ++posOptionsLoadIdRef.current
    setPosOptionsLoading(true)
    setPosOptionsLoadFailed(false)
    getPosSalesFilterOptions({ startStr, endStr })
      .then((r) => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptions(r.posOptions || [])
      })
      .catch(() => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptions([])
        setPosOptionsLoadFailed(true)
      })
      .finally(() => {
        if (posOptionsLoadIdRef.current !== id) return
        setPosOptionsLoading(false)
      })
  }, [startStr, endStr, canSearchAll])

  React.useLayoutEffect(() => {
    if (canSearchAll) setPosOptionsLoading(true)
  }, [canSearchAll])

  React.useEffect(() => {
    if (!canSearchAll) {
      posOptionsLoadIdRef.current += 1
      setPosOptionsLoading(false)
      setPosOptionsLoadFailed(false)
      return
    }
    setPosOptionsLoading(true)
    const tid = window.setTimeout(() => {
      loadPosOptions()
    }, 250)
    return () => {
      clearTimeout(tid)
      posOptionsLoadIdRef.current += 1
    }
  }, [loadPosOptions, canSearchAll])

  const storePickerPlaceholder = React.useMemo(() => {
    if (storeChoices.length > 0) return tr("salesSelectStorePrompt", "매장 선택")
    if (canSearchAll && posOptionsLoading) return tr("salesStorePickerLoading", "매장 목록 불러오는 중…")
    if (posOptionsLoadFailed) return tr("salesStorePickerLoadFailed", "매장 목록을 불러오지 못했습니다")
    if (canSearchAll) return tr("salesStorePickerEmpty", "표시할 매장이 없습니다")
    return tr("salesSelectStorePrompt", "매장 선택")
  }, [storeChoices.length, posOptionsLoading, posOptionsLoadFailed, canSearchAll, tr])

  const selectedStoresKey = React.useMemo(
    () => normalizeStoreCodes(selectedStores).join(","),
    [selectedStores]
  )

  const applyStoreSelection = React.useCallback(
    (next: string[], meta?: { clearedAll?: boolean }) => {
      const normalized = normalizeStoreCodes(next)
      if (meta?.clearedAll) skipDefaultStoreAutoSelectRef.current = true
      else skipDefaultStoreAutoSelectRef.current = false
      setSelectedStores(normalized)
    },
    []
  )

  const handleStoreSelectAll = React.useCallback(() => {
    const q = storeSearch.trim()
    const targets = q ? filteredStoreOptions : storeChoices
    applyStoreSelection([...new Set([...selectedStores, ...targets])])
  }, [applyStoreSelection, filteredStoreOptions, selectedStores, storeChoices, storeSearch])

  const handleStoreClearAll = React.useCallback(() => {
    const q = storeSearch.trim()
    if (q) {
      const remove = new Set(filteredStoreOptions)
      applyStoreSelection(selectedStores.filter((s) => !remove.has(s)))
      return
    }
    applyStoreSelection([], { clearedAll: true })
  }, [applyStoreSelection, filteredStoreOptions, selectedStores, storeSearch])

  React.useEffect(() => {
    if (defaultStoresHydratedRef.current) return
    if (!canMultiStorePicker) {
      defaultStoresHydratedRef.current = true
      return
    }

    const qStores = normalizeStoreCodes(
      (searchParams.get("stores") ?? "").split(",")
    )
    if (qStores.length > 0) {
      defaultStoresHydratedRef.current = true
      return
    }

    if (skipDefaultStoreAutoSelectRef.current) {
      defaultStoresHydratedRef.current = true
      return
    }

    const base = normalizeStoreCodes(storeChoices)
    if (base.length === 0) return

    defaultStoresHydratedRef.current = true
    setSelectedStores(base)
  }, [canMultiStorePicker, storeChoices, searchParams])

  React.useEffect(() => {
    if (canSearchAll) return
    if (skipDefaultStoreAutoSelectRef.current) return
    if (isFranchiseeRole(auth?.role || "")) {
      const codes = resolveFranchiseePosSalesFetchStoreCodes(auth, viewStore)
      const normalized = normalizeStoreCodes(
        codes.length > 0 ? codes : storeChoices
      )
      const key = normalized.join(",")
      if (normalized.length && selectedStoresKey !== key) setSelectedStores(normalized)
      return
    }
    const fallback = normalizeStoreCodes(
      storeChoices.length > 0 ? storeChoices : auth?.store ? [auth.store] : []
    )
    const key = fallback.join(",")
    if (fallback.length && selectedStoresKey !== key) setSelectedStores(fallback)
  }, [
    canSearchAll,
    auth?.role,
    auth?.store,
    auth?.allowedStores,
    viewStore,
    selectedStoresKey,
    storeChoices,
  ])

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

  const mapByOrderTypeLevels = React.useCallback(
    (byOrderType: PosSalesByMenuHierarchyResult["byOrderType"]): HierarchyLevelsByOrderType => {
      const out: HierarchyLevelsByOrderType = {}
      for (const ch of compareChannelsList) {
        const hit = byOrderType?.[ch]?.levels
        if (hit) out[ch] = hit
      }
      return out
    },
    [compareChannelsList]
  )

  const fetchHierarchy = React.useCallback(
    async (range: { startStr: string; endStr: string }, withSplit: boolean) => {
      return getPosSalesByMenuHierarchy({
        startStr: range.startStr,
        endStr: range.endStr,
        stores: salesFetchStores,
        search: search.trim() || undefined,
        searchMode: searchAnd ? "and" : "or",
        orderTypes: orderTypesParam,
        splitByOrderType: withSplit,
      })
    },
    [salesFetchStores, search, searchAnd, orderTypesParam]
  )

  const loadData = React.useCallback(async () => {
    if (!canQuery || !startStr || !endStr) return
    const id = ++loadIdRef.current
    setLoading(true)
    setQueryError(null)
    try {
      // 본문 집계가 핵심 — 오늘/월 스냅샷 실패로 전체가 비지 않게 분리
      const mainRes = await fetchHierarchy({ startStr, endStr }, compareChannels)
      if (loadIdRef.current !== id) return
      setLevelsData(mainRes.levels)
      setByOrderTypeLevels(
        compareChannels && mainRes.byOrderType ? mapByOrderTypeLevels(mainRes.byOrderType) : null
      )
      setDrillFilter({})
      setTruncated(!!mainRes.truncated)
      setHasQueried(true)

      const [todaySettled, monthSettled] = await Promise.allSettled([
        fetchHierarchy({ startStr: today, endStr: today }, false),
        fetchHierarchy({ startStr: monthRange.startStr, endStr: today }, false),
      ])
      if (loadIdRef.current !== id) return
      if (todaySettled.status === "fulfilled") {
        setSnapshotToday(sumHierarchyRows(todaySettled.value.levels.menu))
      }
      if (monthSettled.status === "fulfilled") {
        setSnapshotMonth(sumHierarchyRows(monthSettled.value.levels.menu))
      }
    } catch {
      if (loadIdRef.current !== id) return
      setLevelsData(null)
      setByOrderTypeLevels(null)
      setSnapshotToday(null)
      setSnapshotMonth(null)
      setTruncated(false)
      setHasQueried(true)
      setQueryError(
        tr("salesQueryFailed", "조회에 실패했습니다. 잠시 후 다시 「조회」를 눌러 주세요.")
      )
    } finally {
      if (loadIdRef.current === id) setLoading(false)
    }
  }, [
    canQuery,
    startStr,
    endStr,
    fetchHierarchy,
    compareChannels,
    mapByOrderTypeLevels,
    today,
    monthRange.startStr,
    tr,
  ])

  const loadDataRef = React.useRef(loadData)
  loadDataRef.current = loadData

  const drillToChildLevel = React.useCallback(
    (row: Pick<PosSalesHierarchyRow, "label" | "categoryMain" | "category">) => {
      const next: Partial<Record<PosSalesHierarchyLevel, PosSalesHierarchyLevel>> = {
        main: "category",
        category: "menu",
        menu: "option",
      }
      const child = next[level]
      if (!child) return
      setLevel(child)
      setDrillFilter(() => {
        if (level === "main") return { main: row.label }
        if (level === "category") {
          return {
            main: row.categoryMain ?? undefined,
            category: row.label,
          }
        }
        if (level === "menu") {
          return {
            main: row.categoryMain ?? undefined,
            category: row.category ?? undefined,
            menu: row.label,
          }
        }
        return {}
      })
      setSearch(row.label)
      setSearchAnd(false)
    },
    [level]
  )

  /** 매출관리 등에서 ?start&end&stores 딥링크로 들어온 경우만 1회 자동 조회 */
  React.useEffect(() => {
    if (deepLinkQueriedRef.current) return
    if (!allowTotalSalesUrlSync || !pageActiveRef.current) return
    if (!canQuery || !startStr || !endStr) return
    const qStart = String(searchParams.get("start") || "").trim()
    const qEnd = String(searchParams.get("end") || "").trim()
    const qStores = String(searchParams.get("stores") || "").trim()
    if (!qStart && !qEnd && !qStores) return
    deepLinkQueriedRef.current = true
    void loadDataRef.current()
  }, [
    allowTotalSalesUrlSync,
    pageActiveRef,
    canQuery,
    startStr,
    endStr,
    selectedStoresKey,
    searchParams,
  ])

  const prevCompareChannelsRef = React.useRef(compareChannels)
  React.useEffect(() => {
    if (prevCompareChannelsRef.current === compareChannels) return
    prevCompareChannelsRef.current = compareChannels
    if (!hasQueried || !canQuery || !startStr || !endStr) return
    void loadDataRef.current()
  }, [compareChannels, hasQueried, canQuery, startStr, endStr])

  const activeRows = React.useMemo(() => {
    if (optionGroupMode) {
      return aggregateByChickenPart(levelsData?.option ?? [])
    }
    const rows = levelsData?.[level] ?? []
    return filterHierarchyRowsByDrill(rows, level, drillFilter)
  }, [levelsData, level, drillFilter, optionGroupMode])
  const optionGroupRows = React.useMemo(
    () => (optionGroupMode ? (activeRows as OptionGroupRow[]) : null),
    [optionGroupMode, activeRows]
  )
  const compareRows = React.useMemo(() => {
    if (!compareChannels || !byOrderTypeLevels) return []
    const rows = buildHierarchyChannelCompareRows(level, byOrderTypeLevels, compareChannelsList)
    return filterHierarchyRowsByDrill(rows, level, drillFilter)
  }, [compareChannels, byOrderTypeLevels, level, compareChannelsList, drillFilter])

  const totals = compareChannels
    ? compareRows.reduce(
        (acc, r) => ({ qty: acc.qty + r.totalQty, sales: acc.sales + r.totalSales }),
        { qty: 0, sales: 0 }
      )
    : sumHierarchyRows(activeRows)
  const levelLabel = LEVELS.find((l) => l.id === level)?.fallback ?? level
  const canDrillDown = level !== "option" && !optionGroupMode

  const compareChartRows = React.useMemo(() => {
    if (!compareChannels || compareRows.length === 0) return []
    return topChannelCompareChartRows(compareRows, compareChannelsList, channelLabels, CHART_TOP_N)
  }, [compareChannels, compareRows, compareChannelsList, channelLabels])

  const compareByLevel = React.useMemo(() => {
    if (!compareChannels || !byOrderTypeLevels) return null
    return {
      main: buildHierarchyChannelCompareRows("main", byOrderTypeLevels, compareChannelsList),
      category: buildHierarchyChannelCompareRows("category", byOrderTypeLevels, compareChannelsList),
      menu: buildHierarchyChannelCompareRows("menu", byOrderTypeLevels, compareChannelsList),
      option: buildHierarchyChannelCompareRows("option", byOrderTypeLevels, compareChannelsList),
    }
  }, [compareChannels, byOrderTypeLevels, compareChannelsList])

  const compareTableColSpan = React.useMemo(
    () => 2 + compareChannelsList.length * 2 + 2,
    [compareChannelsList]
  )

  const categoryPieRows = React.useMemo(() => {
    if (optionGroupMode && optionGroupRows?.length) {
      return optionGroupRows
        .filter((r) => r.sales > 0)
        .map((r) => ({ name: r.label, sales: Math.round(r.sales) }))
    }
    return levelsData?.category?.length
      ? pieRowsFromHierarchy(levelsData.category, tr("totalSalesChartOther", "기타"))
      : []
  }, [levelsData?.category, optionGroupMode, optionGroupRows, tr])

  const itemChartRows = React.useMemo(
    () => topRowsForChart(activeRows, CHART_TOP_N),
    [activeRows]
  )

  const storeLabelForExport = React.useMemo(() => {
    if (!canMultiStorePicker) return selectedStores[0] ?? auth?.store ?? ""
    if (!salesFetchStores?.length) return ""
    if (salesFetchStores.length === 1) return posStoreDisplayName(salesFetchStores[0]!)
    if (salesFetchStores.length === storeChoices.length) {
      return canFranchiseeMultiStore
        ? tr("salesSelectMyFranchiseStoresAll", "내 매장 전체")
        : tr("salesSelectStoreAll", "전체 매장")
    }
    return salesFetchStores.map((c) => posStoreDisplayName(c)).join(", ")
  }, [
    canMultiStorePicker,
    canFranchiseeMultiStore,
    salesFetchStores,
    storeChoices.length,
    selectedStores,
    auth?.store,
    posStoreDisplayName,
    tr,
  ])

  const handleExportExcel = React.useCallback(async () => {
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
        [`${tr("totalSalesDateFrom", "시작일")}: ${startStr}`, `${tr("totalSalesDateTo", "종료일")}: ${endStr}`],
        [`${tr("salesStore", "매장")}: ${storeLabelForExport}`],
        [`${tr("salesAmountKindLabel", "주문 유형")}: ${orderTypesSummaryLabel}`],
      ]
      if (compareChannels) {
        metaRows.push([
          `${tr("totalSalesCompareChannels", "채널별 비교")}: ${compareChannelsList.map((c) => channelLabels[c]).join(", ")}`,
        ])
      }
      if (search.trim()) {
        metaRows.push([`${tr("totalSalesSearch", "메뉴 검색")}: ${search.trim()}`])
      }
      const sheetNames = {
        main: tr("totalSalesLevelMain", "대분류"),
        category: tr("totalSalesLevelCategory", "카테고리"),
        menu: tr("totalSalesLevelMenu", "메인 메뉴"),
        option: tr("totalSalesLevelOption", "옵션"),
      }
      const col = {
        no: "#",
        name: tr("totalSalesColName", "명칭"),
        main: tr("totalSalesLevelMain", "대분류"),
        category: tr("totalSalesLevelCategory", "카테고리"),
        qty: tr("salesQuantity", "수량"),
        sales: tr("pL_sales", "매출"),
      }
      if (compareChannels && compareByLevel) {
        await downloadTotalSalesChannelCompareXlsx({
          filename,
          metaRows,
          sheetNames,
          col,
          channelLabels,
          channels: compareChannelsList,
          compareByLevel,
        })
      } else {
        await downloadTotalSalesHierarchyXlsx({
          filename,
          metaRows,
          sheetNames,
          col,
          levels: levelsData,
        })
      }
    } finally {
      setExporting(false)
    }
  }, [
    levelsData,
    compareChannels,
    compareByLevel,
    compareChannelsList,
    channelLabels,
    startStr,
    endStr,
    storeLabelForExport,
    search,
    orderTypesSummaryLabel,
    tr,
  ])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {tr(
          "totalSalesIntro",
          "POS 완료 주문 기준으로 대분류·카테고리·메인 메뉴·옵션별 수량·판매액을 봅니다. 홀·포장·배달로 범위를 좁힐 수 있고, 메인 메뉴는 카탈로그명·옵션은 사이즈·부위 등 최종 선택 기준으로 집계됩니다."
        )}
      </p>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-3">
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
                <Input
                  type="date"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                  className="h-9 w-[11rem]"
                  aria-label={tr("totalSalesDateFrom", "시작일")}
                />
                <span className="text-sm text-muted-foreground" aria-hidden>
                  ~
                </span>
                <Input
                  type="date"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                  className="h-9 w-[11rem]"
                  aria-label={tr("totalSalesDateTo", "종료일")}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {startStr} ~ {endStr} ({tr("totalSalesBangkokBizDay", "방콕 영업일")})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <span className="shrink-0 text-sm font-medium">
              {tr("salesAmountKindLabel", "주문 유형")}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={orderTypesKey === "" ? "default" : "outline"}
                onClick={setAllOrderTypes}
              >
                {tr("salesAmountKindAll", "전체")}
              </Button>
              {SALES_ORDER_TYPE_TOGGLES.map(({ type, labelKey, fallback }) => {
                const active = orderTypesKey !== "" && orderTypesKey.split(",").includes(type)
                return (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleOrderTypeChannel(type)}
                  >
                    {tr(labelKey, fallback)}
                  </Button>
                )
              })}
            </div>
            {orderTypesKey !== "" ? (
              <span className="text-xs text-muted-foreground">
                {orderTypesSummaryLabel}
              </span>
            ) : null}
            <span className="hidden h-4 w-px shrink-0 bg-border sm:inline-block" aria-hidden />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={compareChannels}
                onCheckedChange={(c) => setCompareChannels(c === true)}
              />
              <span>{tr("totalSalesCompareChannels", "채널별 비교")}</span>
            </label>
          </div>
          {compareChannels ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                "totalSalesCompareChannelsHint",
                "같은 품목을 홀·포장·배달 열로 나란히 봅니다. 주문 유형을 고르면 선택한 채널만 비교합니다."
              )}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {canMultiStorePicker ? (
              <div className="relative" ref={storePickerRef}>
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
                      ? storePickerPlaceholder
                      : selectedStores.length === storeChoices.length && storeChoices.length > 1
                        ? canFranchiseeMultiStore
                          ? tr("salesSelectMyFranchiseStoresAll", "내 매장 전체")
                          : tr("salesSelectStoreAll", "전체 매장")
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
                        onClick={handleStoreSelectAll}
                      >
                        {tr("salesStoreSelectAll", "전체 선택")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_XS_CN}
                        onClick={handleStoreClearAll}
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
                              applyStoreSelection(
                                selectedStores.includes(code)
                                  ? selectedStores.filter((v) => v !== code)
                                  : [...selectedStores, code]
                              )
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
              <p className="text-sm text-muted-foreground">
                {posStoreDisplayName(selectedStores[0] ?? auth?.store ?? "")}
              </p>
            )}
            <Input
              className="min-w-[12rem] flex-1"
              placeholder={tr("totalSalesSearchPh", "예: Snow Onion")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (canQuery && !loading) void loadData()
                }
              }}
              aria-label={tr("totalSalesSearch", "메뉴 검색")}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={searchAnd} onCheckedChange={(c) => setSearchAnd(c === true)} />
              <span>{tr("salesMenuSearchAndMode", "검색어 모두 포함 (AND)")}</span>
            </label>
            <Button
              type="button"
              onClick={() => void loadData()}
              disabled={!canQuery || loading}
              title={
                canMultiStorePicker && selectedStores.length === 0
                  ? tr("salesQueryNeedStore", "매장을 선택해 주세요.")
                  : undefined
              }
            >
              {tr("salesQuery", "조회")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                !levelsData ||
                exporting ||
                loading ||
                (compareChannels && !compareByLevel)
              }
              onClick={handleExportExcel}
            >
              {exporting ? tr("exporting", "보내는 중…") : tr("totalSalesExportExcel", "엑셀보내기")}
            </Button>
          </div>

          {canMultiStorePicker && selectedStores.length === 0 ? (
            <p className="text-xs text-amber-800 dark:text-amber-300" role="status">
              {tr(
                "salesSelectStoreHint",
                "매장을 선택하지 않으면 집계되지 않습니다. 한 매장·여러 매장은 체크 후 「조회」, 전 매장은 「전체 선택」 후 「조회」하세요."
              )}
            </p>
          ) : null}

          {queryError ? (
            <p className={`text-sm ${ADMIN_PANEL_WARNING_CN}`} role="alert">
              {queryError}
            </p>
          ) : null}

          {!hasQueried && !loading ? (
            <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              {canMultiStorePicker && selectedStores.length === 0
                ? tr(
                    "salesSelectStoreBeforeQuery",
                    "매장을 하나 이상 선택한 뒤「조회」를 눌러 주세요. 「전체 선택」으로 여러 매장·전체를 볼 수 있습니다."
                  )
                : tr(
                    "salesPressQueryToLoad",
                    "위에서 조건을 맞춘 뒤「조회」를 누르면 집계가 표시됩니다."
                  )}
            </p>
          ) : null}

          {hasQueried || loading ? (
          <>
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

          {levelsData && compareChannels && !optionGroupMode && compareChartRows.length > 0 ? (
            <div className="rounded-lg border p-3">
              <h3 className="mb-2 text-sm font-semibold">
                {tr("totalSalesChartChannelCompare", "채널별 매출 비교")} (
                {tr(LEVELS.find((l) => l.id === level)?.labelKey ?? "", levelLabel)})
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareChartRows} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-32} textAnchor="end" height={56} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => [`฿${formatSalesAmount(v)}`, tr("pL_sales", "매출")]}
                      labelFormatter={(_, payload) =>
                        String((payload?.[0]?.payload as { fullName?: string })?.fullName ?? "")
                      }
                    />
                    <Legend />
                    {compareChannelsList.map((ch, i) => (
                      <Bar
                        key={ch}
                        dataKey={channelLabels[ch]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        name={channelLabels[ch]}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {levelsData && (!compareChannels || optionGroupMode) && (categoryPieRows.length > 0 || itemChartRows.length > 0) ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  {optionGroupMode
                    ? tr("totalSalesOptionGroupMode", "부위별 합산")
                    : tr("totalSalesChartCategory", "카테고리")}
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

          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            {LEVELS.map((lv) => (
              <Button
                key={lv.id}
                type="button"
                size="sm"
                variant={!optionGroupMode && level === lv.id ? "default" : "outline"}
                onClick={() => {
                  setOptionGroupMode(false)
                  setLevel(lv.id)
                }}
              >
                {tr(lv.labelKey, lv.fallback)}
              </Button>
            ))}
            <span className="hidden h-4 w-px bg-border sm:inline-block" aria-hidden />
            <Button
              type="button"
              size="sm"
              variant={optionGroupMode ? "default" : "outline"}
              onClick={() => {
                setOptionGroupMode(true)
                setDrillFilter({})
                setSearch("")
              }}
            >
              {tr("totalSalesOptionGroupMode", "부위별 합산")}
            </Button>
          </div>

          {optionGroupMode ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                "totalSalesOptionGroupHint",
                "모든 메뉴의 치킨 옵션을 Boneless(순살)·Wing(윙)·Drumette(봉)으로 합산합니다. 사이즈(S/M)는 무시하고 부위만 봅니다."
              )}
            </p>
          ) : null}

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
              {tr("totalSalesActiveLevel", "집계 단위")}: {optionGroupMode ? tr("totalSalesOptionGroupMode", "부위별 합산") : tr(LEVELS.find((l) => l.id === level)?.labelKey ?? "", levelLabel)}
            </span>
            <span className="font-erp-numeric">
              {tr("totalSalesTableTotal", "합계")}: {tr("totalSalesQtyUnit", "수량")} {totals.qty.toLocaleString()} · ฿
              {formatSalesAmount(totals.sales)}
            </span>
          </div>
          {canDrillDown ? (
            <p className="text-xs text-muted-foreground">
              {tr("totalSalesDrillHint", "클릭 시 하위 집계·검색으로 이동")}
            </p>
          ) : null}
          {drillFilter.main || drillFilter.category || drillFilter.menu ? (
            <p className="text-xs text-muted-foreground">
              {tr("totalSalesDrillActive", "하위 필터")}:{" "}
              {[drillFilter.main, drillFilter.category, drillFilter.menu].filter(Boolean).join(" › ")}
              {" · "}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => {
                  setDrillFilter({})
                  setSearch("")
                }}
              >
                {tr("totalSalesDrillClear", "필터 해제")}
              </button>
            </p>
          ) : null}

          <div className="overflow-auto max-h-[calc(100vh-520px)] rounded-lg border">
            <table
              className={
                compareChannels
                  ? "w-full min-w-[52rem] table-fixed text-sm"
                  : "w-full text-sm"
              }
            >
              {compareChannels ? (
                <colgroup>
                  <col className="w-10" />
                  <col className="w-48 sm:w-56" />
                  {compareChannelsList.map((ch) => (
                    <React.Fragment key={`col-${ch}`}>
                      <col className="w-14" />
                      <col className="w-[5.75rem]" />
                    </React.Fragment>
                  ))}
                  <col className="w-14" />
                  <col className="w-24" />
                </colgroup>
              ) : null}
              <thead className="sticky top-0 z-[1] bg-muted/80 backdrop-blur">
                {compareChannels && !optionGroupMode ? (
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 pl-3 text-left" rowSpan={2}>
                      #
                    </th>
                    <th className="py-2 pr-2 text-left" rowSpan={2}>
                      {tr("totalSalesColName", "명칭")}
                    </th>
                    {compareChannelsList.map((ch) => (
                      <th
                        key={ch}
                        className="border-l border-border/60 px-1 py-1 text-center text-xs font-semibold"
                        colSpan={2}
                      >
                        {channelLabels[ch]}
                      </th>
                    ))}
                    <th
                      className="border-l border-border/60 px-1 py-1 pr-2 text-center text-xs font-semibold"
                      colSpan={2}
                    >
                      {tr("totalSalesCompareTotal", "합계")}
                    </th>
                  </tr>
                ) : null}
                <tr className="border-b text-muted-foreground">
                  {!compareChannels || optionGroupMode ? (
                    <>
                      <th className="w-12 py-2 pl-3 text-left">#</th>
                      <th className="py-2 text-left">{tr("totalSalesColName", "명칭")}</th>
                      {!optionGroupMode && level !== "main" ? (
                        <th className="hidden py-2 text-left md:table-cell">
                          {tr("totalSalesLevelMain", "대분류")}
                        </th>
                      ) : null}
                      {!optionGroupMode && (level === "option" || level === "menu") ? (
                        <th className="hidden py-2 text-left lg:table-cell">
                          {tr("totalSalesLevelCategory", "카테고리")}
                        </th>
                      ) : null}
                      <th className="py-2 pr-3 text-right">{tr("salesQuantity", "수량")}</th>
                      {optionGroupMode ? (
                        <th className="py-2 pr-3 text-right">{tr("totalSalesQtyPct", "수량 비율")}</th>
                      ) : null}
                      <th className="py-2 pr-3 text-right">{tr("pL_sales", "매출")}</th>
                      {optionGroupMode ? (
                        <th className="py-2 pr-3 text-right">{tr("totalSalesSalesPct", "매출 비율")}</th>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {compareChannelsList.map((ch) => (
                        <React.Fragment key={`${ch}-sub`}>
                          <th className="border-l border-border/60 px-1.5 py-1 text-center text-[11px] font-normal">
                            {tr("salesQuantity", "수량")}
                          </th>
                          <th className="px-1.5 py-1 text-center text-[11px] font-normal">
                            {tr("pL_sales", "매출")}
                          </th>
                        </React.Fragment>
                      ))}
                      <th className="border-l border-border/60 px-1.5 py-1 text-center text-[11px] font-normal">
                        {tr("salesQuantity", "수량")}
                      </th>
                      <th className="px-1.5 py-1 pr-2 text-center text-[11px] font-normal">
                        {tr("pL_sales", "매출")}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={compareChannels && !optionGroupMode ? compareTableColSpan : 6} className="py-10 text-center text-muted-foreground">
                      {tr("loading", "불러오는 중…")}
                    </td>
                  </tr>
                ) : compareChannels && !optionGroupMode ? (
                  compareRows.length === 0 ? (
                    <tr>
                      <td colSpan={compareTableColSpan} className="py-10 text-center text-muted-foreground">
                        {tr("salesDataNone", "데이터 없음")}
                      </td>
                    </tr>
                  ) : (
                    compareRows.map((row, idx) => (
                      <tr key={row.key} className="border-b hover:bg-muted/30">
                        <td className="py-2 pl-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                        <td className="max-w-0 py-2 pr-2" title={row.label}>
                          {canDrillDown ? (
                            <button
                              type="button"
                              className="block max-w-full truncate text-left font-medium hover:underline"
                              onClick={() => drillToChildLevel(row)}
                              title={tr("totalSalesDrillHint", "클릭 시 하위 집계·검색으로 이동")}
                            >
                              {row.label}
                            </button>
                          ) : (
                            <span className="block truncate">{row.label}</span>
                          )}
                          {level !== "main" && (row.categoryMain || row.category) ? (
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {[row.categoryMain, row.category].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        {compareChannelsList.map((ch) => {
                          const c = row.channels[ch]
                          return (
                            <React.Fragment key={`${row.key}-${ch}`}>
                              <td className="border-l border-border/40 py-2 px-1.5 text-right font-erp-numeric text-muted-foreground tabular-nums">
                                {(c?.qty ?? 0).toLocaleString()}
                              </td>
                              <td className="py-2 px-1.5 text-right font-erp-numeric tabular-nums whitespace-nowrap">
                                {formatSalesAmount(c?.sales ?? 0)}
                              </td>
                            </React.Fragment>
                          )
                        })}
                        <td className="border-l border-border/40 bg-muted/20 py-2 px-1.5 text-right font-erp-numeric font-medium tabular-nums">
                          {row.totalQty.toLocaleString()}
                        </td>
                        <td className="bg-muted/20 py-2 px-1.5 pr-2 text-right font-erp-numeric font-medium tabular-nums whitespace-nowrap">
                          {formatSalesAmount(row.totalSales)}
                        </td>
                      </tr>
                    ))
                  )
                ) : activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={optionGroupMode ? 6 : 6} className="py-10 text-center text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </td>
                  </tr>
                ) : (
                  activeRows.map((row, idx) => {
                    const pct = optionGroupMode ? (row as OptionGroupRow) : null
                    return (
                    <tr key={row.key} className="border-b hover:bg-muted/30">
                      <td className="py-1.5 pl-3 text-muted-foreground">{idx + 1}</td>
                      <td className="py-1.5 pr-2">
                        {canDrillDown ? (
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => drillToChildLevel(row)}
                            title={tr("totalSalesDrillHint", "클릭 시 하위 집계·검색으로 이동")}
                          >
                            {row.label}
                          </button>
                        ) : (
                          <span className="font-medium">{row.label}</span>
                        )}
                      </td>
                      {!optionGroupMode && level !== "main" ? (
                        <td className="hidden py-1.5 md:table-cell text-muted-foreground">{row.categoryMain || "—"}</td>
                      ) : null}
                      {!optionGroupMode && (level === "option" || level === "menu") ? (
                        <td className="hidden py-1.5 lg:table-cell text-muted-foreground">{row.category || "—"}</td>
                      ) : null}
                      <td className="py-1.5 pr-3 text-right font-erp-numeric">{row.qty.toLocaleString()}</td>
                      {pct ? (
                        <td className="py-1.5 pr-3 text-right font-erp-numeric text-muted-foreground">
                          {pct.qtyPct.toFixed(1)}%
                        </td>
                      ) : null}
                      <td className="py-1.5 pr-3 text-right font-erp-numeric">{formatSalesAmount(row.sales)}</td>
                      {pct ? (
                        <td className="py-1.5 pr-3 text-right font-erp-numeric font-medium">
                          {pct.salesPct.toFixed(1)}%
                        </td>
                      ) : null}
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
