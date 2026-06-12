"use client"

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
import { getAdminEmployeeList, type AdminEmployeeItem } from "@/lib/api-client"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import {
  employeeHeadcountWeight,
  formatHeadcountFte,
  isEmployedAsOf,
  isPartTimeSalType,
  joinInPeriod,
  resignInPeriod,
} from "@/lib/employee-headcount-utils"

type Agg = {
  joins: number
  resigns: number
  /** 기간 말 재직 인원 수(명) */
  headEndHeads: number
  /** 그중 파트타임 인원 수(명) */
  headEndPart: number
  /** 기간 말 재직 환산(FTE, 파트=0.5) */
  headEndFte: number
}

type MovementChartRow = {
  label: string
  full: string
  joins: number
  resigns: number
  headEndFte: number
  headEndHeads: number
  headEndPart: number
}

function MovementGroupedBarChart({
  title,
  subtitle,
  data,
  t,
}: {
  title: string
  subtitle?: string
  data: MovementChartRow[]
  t: (k: string) => string
}) {
  if (data.length === 0) return null
  const vertical = data.length > 10
  const h = vertical ? Math.min(720, 120 + data.length * 30) : 300
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="w-full" style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          {vertical ? (
            <BarChart layout="vertical" data={data} margin={{ left: 4, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals />
              <YAxis type="category" dataKey="label" width={108} tick={{ fontSize: 9 }} interval={0} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as MovementChartRow
                  return (
                    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
                      <div className="font-medium">{p.full}</div>
                      {payload.map((x) => (
                        <div key={String(x.name)} className="tabular-nums">
                          {x.name}: {x.dataKey === "headEndFte" ? formatHeadcountFte(Number(x.value)) : x.value}
                        </div>
                      ))}
                      <div className="mt-1 border-t border-border pt-1 text-[11px] text-muted-foreground">
                        {t("emp_mov_head_end_heads")}: {p.headEndHeads} ({t("emp_hc_reg_short")}{" "}
                        {p.headEndHeads - p.headEndPart} · {t("emp_hc_part_short")} {p.headEndPart})
                      </div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="joins" fill="#059669" name={t("emp_mov_joins")} radius={[0, 2, 2, 0]} maxBarSize={18} />
              <Bar dataKey="resigns" fill="#dc2626" name={t("emp_mov_resigns")} radius={[0, 2, 2, 0]} maxBarSize={18} />
              <Bar dataKey="headEndFte" fill="#2563eb" name={t("emp_mov_head_end_fte")} radius={[0, 2, 2, 0]} maxBarSize={18} />
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 64 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={72} interval={0} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as MovementChartRow
                  return (
                    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
                      <div className="font-medium">{p.full}</div>
                      {payload.map((x) => (
                        <div key={String(x.name)} className="tabular-nums">
                          {x.name}: {x.dataKey === "headEndFte" ? formatHeadcountFte(Number(x.value)) : x.value}
                        </div>
                      ))}
                      <div className="mt-1 border-t border-border pt-1 text-[11px] text-muted-foreground">
                        {t("emp_mov_head_end_heads")}: {p.headEndHeads} ({t("emp_hc_reg_short")}{" "}
                        {p.headEndHeads - p.headEndPart} · {t("emp_hc_part_short")} {p.headEndPart})
                      </div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="joins" fill="#059669" name={t("emp_mov_joins")} radius={[4, 4, 0, 0]} />
              <Bar dataKey="resigns" fill="#dc2626" name={t("emp_mov_resigns")} radius={[4, 4, 0, 0]} />
              <Bar dataKey="headEndFte" fill="#2563eb" name={t("emp_mov_head_end_fte")} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function emptyAgg(): Agg {
  return { joins: 0, resigns: 0, headEndHeads: 0, headEndPart: 0, headEndFte: 0 }
}

function addHeadEnd(a: Agg, e: { join: string; resign: string; salType: string }, endStr: string) {
  if (!isEmployedAsOf(e.join, e.resign, endStr)) return
  a.headEndHeads += 1
  if (isPartTimeSalType(e.salType)) a.headEndPart += 1
  a.headEndFte += employeeHeadcountWeight(e.salType)
}

export function EmployeeMovementTab({
  userStore,
  userRole,
}: {
  userStore: string
  userRole: string
}) {
  const t = useT(useLang().lang)
  const defaultYm = React.useMemo(() => getBangkokMonthRange().yearMonth, [])
  const [yearMonth, setYearMonth] = React.useState(defaultYm)
  const { startStr, endStr } = React.useMemo(() => getBangkokMonthRange(yearMonth), [yearMonth])
  const [storeFilter, setStoreFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [list, setList] = React.useState<AdminEmployeeItem[]>([])
  const [stores, setStores] = React.useState<string[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminEmployeeList({ userStore, userRole })
      setList(res.list || [])
      setStores(res.stores || [])
      setHasSearched(true)
    } finally {
      setLoading(false)
    }
  }, [userStore, userRole])

  React.useEffect(() => {
    setHasSearched(false)
    setList([])
    setStores([])
  }, [userStore, userRole])

  const filtered = React.useMemo(() => {
    const sf = storeFilter.trim()
    if (!sf) return list
    return list.filter((e) => String(e.store || "").trim() === sf)
  }, [list, storeFilter])

  const totals = React.useMemo(() => {
    const a = emptyAgg()
    for (const e of filtered) {
      if (joinInPeriod(e.join, startStr, endStr)) a.joins++
      if (resignInPeriod(e.resign, startStr, endStr)) a.resigns++
      addHeadEnd(a, e, endStr)
    }
    return a
  }, [filtered, startStr, endStr])

  const byStore = React.useMemo(() => {
    const m = new Map<string, Agg>()
    for (const e of filtered) {
      const st = String(e.store || "").trim() || "—"
      if (!m.has(st)) m.set(st, emptyAgg())
      const a = m.get(st)!
      if (joinInPeriod(e.join, startStr, endStr)) a.joins++
      if (resignInPeriod(e.resign, startStr, endStr)) a.resigns++
      addHeadEnd(a, e, endStr)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [filtered, startStr, endStr])

  const byJob = React.useMemo(() => {
    const m = new Map<string, Agg>()
    for (const e of filtered) {
      const job = String(e.job || "").trim() || "—"
      if (!m.has(job)) m.set(job, emptyAgg())
      const a = m.get(job)!
      if (joinInPeriod(e.join, startStr, endStr)) a.joins++
      if (resignInPeriod(e.resign, startStr, endStr)) a.resigns++
      addHeadEnd(a, e, endStr)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [filtered, startStr, endStr])

  const chartStoreData = React.useMemo((): MovementChartRow[] => {
    return byStore.map(([st, a]) => ({
      label: st.length > 14 ? `${st.slice(0, 13)}…` : st,
      full: st,
      joins: a.joins,
      resigns: a.resigns,
      headEndFte: a.headEndFte,
      headEndHeads: a.headEndHeads,
      headEndPart: a.headEndPart,
    }))
  }, [byStore])

  const chartJobData = React.useMemo((): MovementChartRow[] => {
    return byJob.map(([job, a]) => ({
      label: job.length > 14 ? `${job.slice(0, 13)}…` : job,
      full: job,
      joins: a.joins,
      resigns: a.resigns,
      headEndFte: a.headEndFte,
      headEndHeads: a.headEndHeads,
      headEndPart: a.headEndPart,
    }))
  }, [byJob])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex h-9 min-h-9 items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{t("emp_mov_month")}</span>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value || defaultYm)}
            className="h-9 w-[148px] shrink-0 rounded-md border border-input bg-background px-2 text-sm leading-none"
          />
        </div>
        <div className="flex h-9 min-h-9 items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{t("emp_mov_period")}</span>
          <div className="flex h-9 min-h-9 min-w-[220px] items-center rounded-md border border-input bg-background px-3 text-sm tabular-nums leading-none text-foreground">
            {startStr} ~ {endStr}
          </div>
        </div>
        <div className="flex h-9 min-h-9 items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{t("emp_label_store")}</span>
          <select
            value={storeFilter || "All"}
            onChange={(e) => setStoreFilter(e.target.value === "All" ? "" : e.target.value)}
            className="h-9 min-w-[168px] shrink-0 rounded-md border border-input bg-background px-2 text-sm leading-none"
          >
            <option value="All">{t("stockFilterStoreAll")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-9 min-h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? t("loading") : t("search")}
        </button>
      </div>

      {!hasSearched ? (
        <div className="rounded-lg border border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
          {t("emp_mov_search_hint")}
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_joins")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.joins}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_resigns")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.resigns}</div>
        </div>
        <div className="rounded-lg border border-border bg-primary/10 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_head_end_heads")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.headEndHeads}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("emp_hc_reg_short")} {totals.headEndHeads - totals.headEndPart} · {t("emp_hc_part_short")}{" "}
            {totals.headEndPart}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-sky-500/10 px-4 py-3 text-center dark:bg-sky-950/20">
          <div className="text-xs text-muted-foreground">{t("emp_mov_head_end_fte")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{formatHeadcountFte(totals.headEndFte)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{t("emp_mov_parttime_half_hint")}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MovementGroupedBarChart
          title={t("emp_mov_chart_by_store")}
          subtitle={storeFilter.trim() ? t("emp_mov_chart_filtered") : undefined}
          data={chartStoreData}
          t={t}
        />
        <MovementGroupedBarChart title={t("emp_mov_chart_by_job")} data={chartJobData} t={t} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{t("emp_mov_by_store")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left">
                <th className="px-3 py-2 font-semibold">{t("emp_label_store")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_joins")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_resigns")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end_heads")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_part_short")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end_fte")}</th>
              </tr>
            </thead>
            <tbody>
              {byStore.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("emp_result_empty")}
                  </td>
                </tr>
              ) : (
                byStore.map(([st, a]) => (
                  <tr key={st} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{st}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.joins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.resigns}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{a.headEndHeads}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.headEndPart}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-sky-800 dark:text-sky-200">
                      {formatHeadcountFte(a.headEndFte)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{t("emp_mov_by_job")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left">
                <th className="px-3 py-2 font-semibold">{t("emp_label_job")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_joins")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_resigns")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end_heads")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_part_short")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end_fte")}</th>
              </tr>
            </thead>
            <tbody>
              {byJob.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("emp_result_empty")}
                  </td>
                </tr>
              ) : (
                byJob.map(([job, a]) => (
                  <tr key={job} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{job}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.joins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.resigns}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{a.headEndHeads}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{a.headEndPart}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-sky-800 dark:text-sky-200">
                      {formatHeadcountFte(a.headEndFte)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
