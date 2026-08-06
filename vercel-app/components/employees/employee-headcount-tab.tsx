"use client"
import { appAlert } from "@/lib/app-message"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getAdminEmployeeList,
  getStoreJobHeadcount,
  saveStoreJobHeadcount,
  type AdminEmployeeItem,
  type StoreJobHeadcountRow,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  addDaysToYmd,
  employeeHeadcountWeight,
  formatHeadcountFte,
  isEmployedAsOf,
  isPartTimeSalType,
  isResignScheduledInWindow,
} from "@/lib/employee-headcount-utils"

type HcOverviewChartRow = { label: string; full: string; target: number; actual: number }

type HcOverviewStackRow = HcOverviewChartRow & {
  /** min(FTE, 적정) — 파랑 */
  segFilled: number
  /** 적정 미달 시 목표까지 빈 구간 — 앰버 */
  segShort: number
  /** 적정 초과분 — 스카이 */
  segOver: number
}

/** 차트 전용: 목표·재직 스택 합이 0일 때만 보이는 표시용 막대 */
type HcChartRow = HcOverviewStackRow & { segEmpty: number }

type JobActualAgg = { full: number; part: number; fte: number }

type HcOverviewChartMode = "both" | "target" | "actual"
const ALL_STORES_VALUE = "__ALL__"

type HcSingleMetricRow = { label: string; full: string; val: number; segEmpty: number }

function jobKey(j: unknown): string {
  return String(j ?? "").trim()
}

function toSingleMetricChartRows(data: HcOverviewChartRow[], metric: "target" | "actual"): HcSingleMetricRow[] {
  const vals = data.map((row) =>
    metric === "target"
      ? Number.isFinite(row.target)
        ? row.target
        : 0
      : Number.isFinite(row.actual)
        ? row.actual
        : 0
  )
  let scaleRef = 1
  for (const v of vals) scaleRef = Math.max(scaleRef, v)
  return data.map((row, i) => {
    const value = vals[i] ?? 0
    const segEmpty = value < 1e-9 ? Math.min(0.55, Math.max(0.2, scaleRef * 0.14)) : 0
    const short = row.full.length > 12 ? `${row.full.slice(0, 11)}…` : row.full
    return { label: `${i + 1}. ${short}`, full: row.full, val: value, segEmpty }
  })
}

function HeadcountSingleMetricTooltip({
  full,
  val,
  metric,
  hasStub,
  t,
}: {
  full: string
  val: number
  metric: "target" | "actual"
  hasStub: boolean
  t: (k: string) => string
}) {
  const label = metric === "target" ? t("emp_hc_target") : t("emp_hc_fte_short")
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{full}</div>
      <div className="mt-1 tabular-nums">
        {label}: {formatHeadcountFte(val)}
      </div>
      {hasStub && (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">{t("emp_hc_chart_metric_zero_stub_hint")}</div>
      )}
    </div>
  )
}

function useOverviewChartPanelVisible(dataLength: number) {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [panelVisible, setPanelVisible] = React.useState(false)

  const measureAndShow = React.useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width > 2 && r.height > 2) setPanelVisible(true)
  }, [])

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.some(
          (e) => e.isIntersecting && e.intersectionRect.width > 2 && e.intersectionRect.height > 2
        )
        if (hit) setPanelVisible(true)
      },
      { threshold: [0, 0.05, 1], rootMargin: "0px" }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  React.useLayoutEffect(() => {
    if (dataLength === 0) return
    measureAndShow()
    const id = requestAnimationFrame(() => {
      measureAndShow()
      requestAnimationFrame(measureAndShow)
    })
    return () => cancelAnimationFrame(id)
  }, [dataLength, measureAndShow])

  /** 모드 전환 직후 한 프레임에 크기가 0이면 보이기 플래그가 안 켜지는 경우 보정 */
  React.useEffect(() => {
    if (dataLength === 0) return
    const id = window.setTimeout(measureAndShow, 120)
    return () => window.clearTimeout(id)
  }, [dataLength, measureAndShow])

  return { wrapRef, panelVisible }
}

function HeadcountStoreSingleMetricChart({
  data,
  t,
  metric,
}: {
  data: HcOverviewChartRow[]
  t: (k: string) => string
  metric: "target" | "actual"
}) {
  const { wrapRef, panelVisible } = useOverviewChartPanelVisible(data.length)
  if (data.length === 0) return null
  const chartRows = toSingleMetricChartRows(data, metric)
  let valueMax = 1
  for (const row of chartRows) {
    valueMax = Math.max(valueMax, row.val + row.segEmpty)
  }
  const vertical = chartRows.length > 8
  const h = vertical ? Math.min(680, 120 + chartRows.length * 28) : 300
  const innerH = Math.max(200, h - 24)
  const barName = metric === "target" ? t("emp_hc_target") : t("emp_hc_fte_short")
  const barFill = metric === "target" ? "#1d4ed8" : "#0ea5e9"

  return (
    <div
      ref={wrapRef}
      className="w-full rounded-lg border border-border bg-muted/20 p-3"
      style={{ minHeight: h, height: h }}
    >
      {!panelVisible ? (
        <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-muted-foreground">
          {t("loading")}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={innerH} minWidth={200} minHeight={200} debounce={50}>
          {vertical ? (
            <BarChart layout="vertical" data={chartRows} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" domain={[0, valueMax]} tick={{ fontSize: 10 }} allowDecimals />
              <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 9 }} interval={0} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as HcSingleMetricRow
                  return (
                    <HeadcountSingleMetricTooltip
                      full={p.full}
                      val={p.val}
                      metric={metric}
                      hasStub={p.segEmpty > 1e-6}
                      t={t}
                    />
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                stackId="m"
                dataKey="segEmpty"
                fill="#94a3b8"
                legendType="none"
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="m"
                dataKey="val"
                fill={barFill}
                name={barName}
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 2, 2, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={72} interval={0} />
              <YAxis domain={[0, valueMax]} tick={{ fontSize: 10 }} allowDecimals />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as HcSingleMetricRow
                  return (
                    <HeadcountSingleMetricTooltip
                      full={p.full}
                      val={p.val}
                      metric={metric}
                      hasStub={p.segEmpty > 1e-6}
                      t={t}
                    />
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                stackId="m"
                dataKey="segEmpty"
                fill="#94a3b8"
                legendType="none"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="m"
                dataKey="val"
                fill={barFill}
                name={barName}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  )
}

function HeadcountStoreOverviewChart({
  data,
  t,
  mode,
}: {
  data: HcOverviewChartRow[]
  t: (k: string) => string
  mode: HcOverviewChartMode
}) {
  if (data.length === 0) return null
  if (mode === "both") return <HeadcountStoreCompareChart data={data} t={t} />
  return <HeadcountStoreSingleMetricChart data={data} t={t} metric={mode} />
}

function toOverviewStackRows(rows: HcOverviewChartRow[]): HcOverviewStackRow[] {
  return rows.map((row) => {
    const a = Number.isFinite(row.actual) ? row.actual : 0
    const tg = Number.isFinite(row.target) ? row.target : 0
    const segFilled = Math.min(a, tg)
    const segShort = a < tg ? tg - a : 0
    const segOver = a > tg ? a - tg : 0
    return { ...row, segFilled, segShort, segOver }
  })
}

function toChartRowsWithEmptyStub(rows: HcOverviewStackRow[]): HcChartRow[] {
  let scaleRef = 1
  for (const row of rows) {
    const sum = row.segFilled + row.segShort + row.segOver
    scaleRef = Math.max(scaleRef, sum, row.target, row.actual)
  }
  return rows.map((row) => {
    const sum = row.segFilled + row.segShort + row.segOver
    if (sum >= 1e-9) return { ...row, segEmpty: 0 }
    const stub = Math.min(0.55, Math.max(0.2, scaleRef * 0.14))
    return { ...row, segEmpty: stub }
  })
}

function HeadcountOverviewTooltip({
  p,
  t,
}: {
  p: HcChartRow
  t: (k: string) => string
}) {
  const diff = p.actual - p.target
  const hasStub = (p.segEmpty ?? 0) > 1e-6
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{p.full}</div>
      <div className="mt-1 space-y-0.5 tabular-nums">
        <div>
          {t("emp_hc_target")}: {formatHeadcountFte(p.target)}
        </div>
        <div>
          {t("emp_hc_fte_short")}: {formatHeadcountFte(p.actual)}
        </div>
        <div className={diff < 0 ? "text-amber-700 dark:text-amber-300" : diff > 0 ? "text-sky-700 dark:text-sky-300" : ""}>
          {t("emp_hc_diff")}: {diff > 0 ? `+${formatHeadcountFte(diff)}` : formatHeadcountFte(diff)}
        </div>
      </div>
      {hasStub && (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">{t("emp_hc_chart_zero_stub_hint")}</div>
      )}
      {(p.segShort > 0.001 || p.segOver > 0.001) && (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {p.segShort > 0.001 && (
            <div>
              {t("emp_hc_chart_seg_short")}: {formatHeadcountFte(p.segShort)}
            </div>
          )}
          {p.segOver > 0.001 && (
            <div>
              {t("emp_hc_chart_seg_over")}: {formatHeadcountFte(p.segOver)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HeadcountStoreCompareChart({
  data,
  t,
}: {
  data: HcOverviewChartRow[]
  t: (k: string) => string
}) {
  const { wrapRef, panelVisible } = useOverviewChartPanelVisible(data.length)
  if (data.length === 0) return null
  const stacked = toOverviewStackRows(data)
  const chartRows = toChartRowsWithEmptyStub(stacked)
  let valueMax = 1
  for (const row of chartRows) {
    const stackSum = row.segFilled + row.segShort + row.segOver + row.segEmpty
    valueMax = Math.max(valueMax, stackSum, row.target, row.actual)
  }
  if (!Number.isFinite(valueMax) || valueMax <= 0) valueMax = 1
  const vertical = chartRows.length > 8
  const h = vertical ? Math.min(680, 120 + chartRows.length * 28) : 300
  const innerH = Math.max(200, h - 24)
  return (
    <div
      ref={wrapRef}
      className="w-full rounded-lg border border-border bg-muted/20 p-3"
      style={{ minHeight: h, height: h }}
    >
      {!panelVisible ? (
        <div className="flex h-full min-h-[200px] items-center justify-center text-xs text-muted-foreground">
          {t("loading")}
        </div>
      ) : (
        <ResponsiveContainer
          width="100%"
          height={innerH}
          minWidth={200}
          minHeight={200}
          debounce={50}
        >
          {vertical ? (
            <BarChart layout="vertical" data={chartRows} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" domain={[0, valueMax]} tick={{ fontSize: 10 }} allowDecimals />
              <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 9 }} interval={0} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                return <HeadcountOverviewTooltip p={payload[0].payload as HcChartRow} t={t} />
              }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                stackId="hc"
                dataKey="segEmpty"
                fill="#94a3b8"
                legendType="none"
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segFilled"
                fill="#2563eb"
                name={t("emp_hc_chart_seg_filled")}
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segShort"
                fill="#f59e0b"
                name={t("emp_hc_chart_seg_short")}
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segOver"
                fill="#38bdf8"
                name={t("emp_hc_chart_seg_over")}
                maxBarSize={vertical ? 18 : 22}
                radius={[0, 2, 2, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={72} interval={0} />
              <YAxis domain={[0, valueMax]} tick={{ fontSize: 10 }} allowDecimals />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                return <HeadcountOverviewTooltip p={payload[0].payload as HcChartRow} t={t} />
              }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                stackId="hc"
                dataKey="segEmpty"
                fill="#94a3b8"
                legendType="none"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segFilled"
                fill="#2563eb"
                name={t("emp_hc_chart_seg_filled")}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segShort"
                fill="#f59e0b"
                name={t("emp_hc_chart_seg_short")}
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                stackId="hc"
                dataKey="segOver"
                fill="#38bdf8"
                name={t("emp_hc_chart_seg_over")}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function EmployeeHeadcountTab({
  userStore,
  userRole,
  isManager,
}: {
  userStore: string
  userRole: string
  isManager: boolean
}) {
  const t = useT(useLang().lang)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [displayListLoaded, setDisplayListLoaded] = React.useState(false)
  const listLoadSeqRef = React.useRef(0)
  const [empList, setEmpList] = React.useState<AdminEmployeeItem[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [jobOptions, setJobOptions] = React.useState<string[]>([])
  const [headList, setHeadList] = React.useState<StoreJobHeadcountRow[]>([])
  const [tableMissing, setTableMissing] = React.useState(false)
  const [selectedStore, setSelectedStore] = React.useState("")
  const [localRows, setLocalRows] = React.useState<{ job: string; target: number }[]>([])
  const [addJobPick, setAddJobPick] = React.useState("")
  const overviewPickSeq = React.useRef(0)
  const [overviewStorePicks, setOverviewStorePicks] = React.useState<{ id: number; store: string }[]>([])
  const [overviewPickSelect, setOverviewPickSelect] = React.useState("")
  const [overviewChartMode, setOverviewChartMode] = React.useState<HcOverviewChartMode>("both")
  const [overviewJobFilter, setOverviewJobFilter] = React.useState("")

  const todayBkk = React.useMemo(() => getBangkokTodayDateString(), [])
  const resignWindowEndYmd = React.useMemo(() => addDaysToYmd(todayBkk, 30), [todayBkk])

  const loadAll = React.useCallback(async () => {
    const seq = ++listLoadSeqRef.current
    setLoading(true)
    try {
      const [empRes, hcRes] = await Promise.all([
        getAdminEmployeeList({ userStore, userRole }),
        getStoreJobHeadcount(),
      ])
      if (seq !== listLoadSeqRef.current) return
      setEmpList(empRes.list || [])
      setStores(empRes.stores || [])
      setJobOptions(
        empRes.jobOptions?.length ? empRes.jobOptions : ["Service", "Kitchen", "Franchise", "Officer", "Director", "Logistic"]
      )
      setHeadList(hcRes.list || [])
      if (hcRes._note === "table_missing") setTableMissing(true)
      else setTableMissing(false)
    } finally {
      if (seq === listLoadSeqRef.current) {
        setDisplayListLoaded(true)
        setLoading(false)
      }
    }
  }, [userStore, userRole])

  const beginListSearch = React.useCallback(() => {
    setHasSearched(true)
    setDisplayListLoaded(false)
    void loadAll()
  }, [loadAll])

  React.useEffect(() => {
    if (hasSearched) return
    let alive = true
    ;(async () => {
      try {
        const empRes = await getAdminEmployeeList({ userStore, userRole })
        if (!alive) return
        setStores(empRes.stores || [])
      } catch {
        // explicit search button will retry full load
      }
    })()
    return () => {
      alive = false
    }
  }, [hasSearched, userStore, userRole])

  React.useEffect(() => {
    if (isManager && userStore) {
      setSelectedStore(userStore)
      return
    }
    if (!selectedStore && stores.length > 0) {
      setSelectedStore(stores[0] || "")
    }
  }, [stores, selectedStore, isManager, userStore])

  React.useEffect(() => {
    if (!selectedStore || selectedStore === ALL_STORES_VALUE) {
      setLocalRows([])
      return
    }
    const fromHc = headList.filter((h) => h.store === selectedStore)
    const hcMap = new Map(fromHc.map((h) => [h.job, h.target_count]))
    const jobs = new Set<string>()
    for (const e of empList) {
      if (String(e.store || "").trim() !== selectedStore) continue
      const j = String(e.job || "").trim()
      if (j) jobs.add(j)
    }
    for (const h of fromHc) {
      if (h.job) jobs.add(h.job)
    }
    const sorted = [...jobs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    setLocalRows(sorted.map((job) => ({ job, target: hcMap.get(job) ?? 0 })))
  }, [selectedStore, headList, empList])

  const actualByJobDetail = React.useMemo(() => {
    const m = new Map<string, JobActualAgg>()
    if (!selectedStore) return m
    for (const e of empList) {
      if (String(e.store || "").trim() !== selectedStore) continue
      if (!isEmployedAsOf(e.join, e.resign, todayBkk)) continue
      const j = String(e.job || "").trim() || "—"
      const cur = m.get(j) || { full: 0, part: 0, fte: 0 }
      if (isPartTimeSalType(e.salType)) {
        cur.part += 1
        cur.fte += employeeHeadcountWeight(e.salType)
      } else {
        cur.full += 1
        cur.fte += 1
      }
      m.set(j, cur)
    }
    return m
  }, [empList, selectedStore, todayBkk])

  const resignSoonByJob = React.useMemo(() => {
    const m = new Map<string, number>()
    if (!selectedStore) return m
    for (const e of empList) {
      if (String(e.store || "").trim() !== selectedStore) continue
      if (!isResignScheduledInWindow(e.join, e.resign, todayBkk, resignWindowEndYmd)) continue
      const j = String(e.job || "").trim() || "—"
      m.set(j, (m.get(j) ?? 0) + 1)
    }
    return m
  }, [empList, selectedStore, todayBkk, resignWindowEndYmd])

  const storeChoices = React.useMemo(() => {
    if (isManager && userStore) return [userStore]
    return [ALL_STORES_VALUE, ...stores]
  }, [isManager, userStore, stores])

  const overviewJobOptions = React.useMemo(() => {
    const s = new Set<string>()
    for (const h of headList) {
      const x = jobKey(h.job)
      if (x) s.add(x)
    }
    for (const e of empList) {
      const x = jobKey(e.job)
      if (x) s.add(x)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [headList, empList])

  const overviewByStore = React.useMemo(() => {
    const set = new Set<string>()
    for (const s of stores) {
      const st = String(s || "").trim()
      if (st) set.add(st)
    }
    for (const e of empList) {
      const st = String(e.store || "").trim()
      if (st) set.add(st)
    }
    const names = [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    const jf = overviewJobFilter.trim()
    return names.map((store) => {
      let target = 0
      for (const h of headList) {
        if (String(h.store || "").trim() !== store) continue
        if (jf && jobKey(h.job) !== jf) continue
        target += Math.max(0, Number(h.target_count) || 0)
      }
      let full = 0
      let part = 0
      let fte = 0
      let resignSoon = 0
      for (const e of empList) {
        if (String(e.store || "").trim() !== store) continue
        if (jf && jobKey(e.job) !== jf) continue
        if (!isEmployedAsOf(e.join, e.resign, todayBkk)) continue
        if (isPartTimeSalType(e.salType)) {
          part += 1
          fte += employeeHeadcountWeight(e.salType)
        } else {
          full += 1
          fte += 1
        }
        if (isResignScheduledInWindow(e.join, e.resign, todayBkk, resignWindowEndYmd)) resignSoon += 1
      }
      return { store, target, full, part, fte, diff: fte - target, resignSoon }
    })
  }, [stores, empList, headList, todayBkk, overviewJobFilter, resignWindowEndYmd])

  const overviewFiltered = React.useMemo(() => {
    type Row = (typeof overviewByStore)[number] & { viewKey: string }
    if (overviewStorePicks.length === 0 || overviewStorePicks.some((p) => p.store === ALL_STORES_VALUE)) {
      return overviewByStore.map((r) => ({ ...r, viewKey: r.store })) as Row[]
    }
    const byName = new Map(overviewByStore.map((r) => [r.store, r]))
    const out: Row[] = []
    for (const p of overviewStorePicks) {
      const r = byName.get(p.store)
      if (r) out.push({ ...r, viewKey: `pick-${p.id}` })
    }
    return out
  }, [overviewByStore, overviewStorePicks])

  const overviewChartData = React.useMemo((): HcOverviewChartRow[] => {
    return overviewFiltered.map((r, i) => {
      const short = r.store.length > 12 ? `${r.store.slice(0, 11)}…` : r.store
      return {
        label: `${i + 1}. ${short}`,
        full: r.store,
        target: r.target,
        actual: r.fte,
      }
    })
  }, [overviewFiltered])

  const addOverviewStorePick = React.useCallback(() => {
    const s = overviewPickSelect.trim()
    if (!s) return
    overviewPickSeq.current += 1
    setOverviewStorePicks((prev) => {
      if (s === ALL_STORES_VALUE) return [{ id: overviewPickSeq.current, store: s }]
      const withoutAll = prev.filter((x) => x.store !== ALL_STORES_VALUE)
      return [...withoutAll, { id: overviewPickSeq.current, store: s }]
    })
    setOverviewPickSelect("")
  }, [overviewPickSelect])

  const selectStoreFromOverview = (store: string) => {
    if (isManager && userStore && store !== userStore) return
    setSelectedStore(store)
  }

  const unusedJobOptions = React.useMemo(() => {
    const have = new Set(localRows.map((r) => r.job))
    return jobOptions.filter((j) => j && !have.has(j))
  }, [jobOptions, localRows])

  const updateTarget = (job: string, val: number) => {
    setLocalRows((prev) => prev.map((r) => (r.job === job ? { ...r, target: Math.max(0, Math.floor(val) || 0) } : r)))
  }

  const handleAddJob = () => {
    const j = addJobPick.trim()
    if (!j) return
    if (localRows.some((r) => r.job === j)) return
    setLocalRows((prev) => [...prev, { job: j, target: 0 }].sort((a, b) => a.job.localeCompare(b.job)))
    setAddJobPick("")
  }

  const handleSave = async () => {
    if (!selectedStore || selectedStore === ALL_STORES_VALUE) return
    setSaving(true)
    try {
      const res = await saveStoreJobHeadcount({
        store: selectedStore,
        rows: localRows.map((r) => ({ job: r.job, target_count: r.target })),
      })
      await appAlert(translateApiMessage(res.message || "", t) || (res.success ? t("msg_saved") : t("msg_save_fail")))
      if (res.success) await loadAll()
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (actual: number, target: number) => {
    const d = actual - target
    if (d < -0.001) {
      return (
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-800 dark:text-amber-200">{t("emp_hc_under")}</span>
      )
    }
    if (d > 0.001) {
      return <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-800 dark:text-sky-200">{t("emp_hc_over")}</span>
    }
    return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-800 dark:text-emerald-200">{t("emp_hc_ok")}</span>
  }

  const listPending = hasSearched && !displayListLoaded

  if (listPending) {
    return (
      <div className="flex justify-center py-16 text-sm text-muted-foreground">{t("loading")}</div>
    )
  }

  return (
    <div className="space-y-4">
      {tableMissing && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t("emp_hc_table_missing")}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("emp_hc_overview_title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("emp_hc_overview_sub")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("emp_hc_parttime_half_hint")}</p>
        </div>
        {overviewByStore.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("emp_result_empty")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/15 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("emp_hc_overview_pick_label")}</span>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={overviewPickSelect}
                    onChange={(e) => setOverviewPickSelect(e.target.value)}
                    className="h-9 min-w-[160px] flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label={t("emp_hc_overview_pick_label")}
                  >
                    <option value="">{t("emp_hc_overview_pick_placeholder")}</option>
                    <option value={ALL_STORES_VALUE}>{t("store_all_stores")}</option>
                    {overviewByStore.map((r) => (
                      <option key={r.store} value={r.store}>
                        {r.store}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={beginListSearch}
                    disabled={loading}
                    className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
                  >
                    {t("search")}
                  </button>
                  <button
                    type="button"
                    onClick={addOverviewStorePick}
                    disabled={!overviewPickSelect.trim()}
                    className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm hover:bg-muted/50 disabled:opacity-50"
                  >
                    {t("emp_hc_overview_pick_add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewStorePicks([])}
                    disabled={overviewStorePicks.length === 0}
                    className="h-9 shrink-0 rounded-md border border-border bg-muted/40 px-3 text-sm hover:bg-muted/60 disabled:opacity-50"
                  >
                    {t("emp_hc_overview_pick_clear")}
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{t("emp_hc_overview_pick_hint")}</p>
                {overviewStorePicks.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{t("emp_hc_overview_pick_list")}</div>
                    <ol className="flex flex-wrap gap-1.5">
                      {overviewStorePicks.map((p, idx) => (
                        <li
                          key={p.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                        >
                          <span className="shrink-0 tabular-nums text-muted-foreground">{idx + 1}.</span>
                          <span className="min-w-0 truncate font-medium">
                            {p.store === ALL_STORES_VALUE ? t("store_all_stores") : p.store}
                          </span>
                          <button
                            type="button"
                            onClick={() => setOverviewStorePicks((prev) => prev.filter((x) => x.id !== p.id))}
                            className="shrink-0 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={t("emp_hc_overview_pick_remove_one")}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <fieldset className="min-w-0 border-0 p-0">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("emp_hc_overview_show_label")}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {(["target", "actual", "both"] as const).map((m) => (
                    <label key={m} className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="hc-overview-chart-mode"
                        checked={overviewChartMode === m}
                        onChange={() => setOverviewChartMode(m)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span>
                        {m === "target"
                          ? t("emp_hc_overview_show_target")
                          : m === "actual"
                            ? t("emp_hc_overview_show_actual")
                            : t("emp_hc_overview_show_both")}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1">
                <label htmlFor="hc-overview-job" className="text-xs font-medium text-muted-foreground">
                  {t("emp_hc_overview_job_label")}
                </label>
                <select
                  id="hc-overview-job"
                  value={overviewJobFilter}
                  onChange={(e) => setOverviewJobFilter(e.target.value)}
                  className="h-9 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t("emp_job_all")}</option>
                  {overviewJobOptions.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {hasSearched && overviewFiltered.length > 0 ? (
              <HeadcountStoreOverviewChart
                key={overviewChartMode}
                data={overviewChartData}
                t={t}
                mode={overviewChartMode}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {hasSearched ? t("emp_hc_overview_no_results") : t("emp_hc_search_required")}
              </p>
            )}
          </>
        )}
        {hasSearched && overviewByStore.length > 0 && (
        <AdminTableScroll className="rounded-md border border-border" hint={false}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2 font-semibold">{t("emp_label_store")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_target")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_reg_count")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_part_count")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_fte_short")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_diff")}</th>
                <th className="px-3 py-2 font-semibold">{t("emp_hc_status_short")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_resign_soon_short")}</th>
              </tr>
            </thead>
            <tbody>
              {overviewFiltered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    {t("emp_hc_overview_no_results")}
                  </td>
                </tr>
              ) : (
              overviewFiltered.map((r) => {
                const rowLocked = Boolean(isManager && userStore && r.store !== userStore)
                return (
                <tr
                  key={r.viewKey}
                  role={rowLocked ? undefined : "button"}
                  tabIndex={rowLocked ? -1 : 0}
                  onClick={rowLocked ? undefined : () => selectStoreFromOverview(r.store)}
                  onKeyDown={
                    rowLocked
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            selectStoreFromOverview(r.store)
                          }
                        }
                  }
                  className={`border-b border-border/60 transition-colors ${
                    rowLocked ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted/25"
                  } ${selectedStore === r.store ? "bg-primary/10" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">{r.store}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.target}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.full}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.part}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-sky-800 dark:text-sky-200">
                    {formatHeadcountFte(r.fte)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      r.diff < 0 ? "text-amber-700 dark:text-amber-300" : r.diff > 0 ? "text-sky-700 dark:text-sky-300" : ""
                    }`}
                  >
                    {r.diff > 0 ? `+${formatHeadcountFte(r.diff)}` : formatHeadcountFte(r.diff)}
                  </td>
                  <td className="px-3 py-2">{statusBadge(r.fte, r.target)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.resignSoon > 0 ? "font-medium text-rose-700 dark:text-rose-300" : "text-muted-foreground"
                    }`}
                  >
                    {r.resignSoon}
                  </td>
                </tr>
                )
              })
              )}
            </tbody>
          </table>
        </AdminTableScroll>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t("emp_hc_per_store_edit")}</h3>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-[19px]">
          <label className="text-xs font-medium text-muted-foreground">{t("emp_hc_select_store")}</label>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            disabled={isManager && !!userStore}
            className="h-9 min-w-[200px] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70"
          >
            {storeChoices.map((s) => (
              <option key={s} value={s}>
                {s === ALL_STORES_VALUE ? t("store_all_stores") : s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={beginListSearch}
          disabled={loading}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
        >
          {t("search")}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !selectedStore || selectedStore === ALL_STORES_VALUE || tableMissing || !hasSearched}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? t("loading") : t("emp_hc_save")}
        </button>
      </div>

      {hasSearched ? (
      <>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <span className="text-xs text-muted-foreground">{t("emp_hc_add_job")}</span>
        <select
          value={addJobPick}
          onChange={(e) => setAddJobPick(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]"
        >
          <option value="">{t("emp_job_all")}</option>
          {unusedJobOptions.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={beginListSearch}
          disabled={loading}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
        >
          {t("search")}
        </button>
        <button
          type="button"
          onClick={handleAddJob}
          disabled={!addJobPick}
          className="h-8 rounded-md bg-secondary px-2 text-xs font-medium disabled:opacity-50"
        >
          +
        </button>
      </div>
      <AdminTableScroll className="rounded-lg border border-border bg-card" hint={false}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-3 py-2 font-semibold">{t("emp_label_job")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_target")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_reg_count")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_part_count")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_fte_short")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_diff")}</th>
              <th className="px-3 py-2 font-semibold">{t("emp_hc_status_short")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_resign_soon_short")}</th>
            </tr>
          </thead>
          <tbody>
            {localRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  {selectedStore ? t("emp_hc_empty_jobs") : t("emp_hc_select_store")}
                </td>
              </tr>
            ) : (
              localRows.map((row) => {
                const det = actualByJobDetail.get(row.job) || { full: 0, part: 0, fte: 0 }
                const diff = det.fte - row.target
                const rs = resignSoonByJob.get(row.job) ?? 0
                return (
                  <tr key={row.job} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{row.job}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.target}
                        onChange={(e) => updateTarget(row.job, Number(e.target.value))}
                        className="w-16 rounded border border-input bg-background px-1 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{det.full}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{det.part}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-sky-800 dark:text-sky-200">
                      {formatHeadcountFte(det.fte)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        diff < 0 ? "text-amber-700 dark:text-amber-300" : diff > 0 ? "text-sky-700 dark:text-sky-300" : ""
                      }`}
                    >
                      {diff > 0 ? `+${formatHeadcountFte(diff)}` : formatHeadcountFte(diff)}
                    </td>
                    <td className="px-3 py-2">{statusBadge(det.fte, row.target)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        rs > 0 ? "font-medium text-rose-700 dark:text-rose-300" : "text-muted-foreground"
                      }`}
                    >
                      {rs}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </AdminTableScroll>
      <p className="text-xs text-muted-foreground">{t("emp_hc_asof_hint")}</p>
      <p className="text-xs text-muted-foreground">{t("emp_hc_resign_soon_hint")}</p>
      <p className="text-xs text-muted-foreground">{t("emp_hc_parttime_half_hint")}</p>
      </>
      ) : (
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
          {t("emp_hc_search_required")}
        </div>
      )}
    </div>
  )
}
