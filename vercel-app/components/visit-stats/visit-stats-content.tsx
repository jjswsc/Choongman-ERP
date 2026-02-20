"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { CalendarDays, Search } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"
import {
  aggregateBy,
  getWeeklyTrend,
  getStorePurposeMatrix,
} from "@/lib/visit-data"
import { getStoreVisitRecords } from "@/lib/api-client"
import { SummaryCards } from "./summary-cards"
import { RankedBarChart } from "./ranked-bar-chart"
import { TrendChart } from "./trend-chart"
import { HeatmapTable } from "./heatmap-table"
import { PurposeDonut } from "./purpose-donut"
import { cn } from "@/lib/utils"

const ALL = "__ALL__"

function defaultStartDate() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function defaultEndDate() {
  return new Date().toISOString().slice(0, 10)
}

export function VisitStatsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()

  const [startDate, setStartDate] = useState(defaultEndDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [storeFilter, setStoreFilter] = useState(ALL)
  const [employeeFilter, setEmployeeFilter] = useState(ALL)
  const [deptFilter, setDeptFilter] = useState(ALL)
  const [purposeFilter, setPurposeFilter] = useState(ALL)
  const [records, setRecords] = useState<{ id: number; employee: string; department: string; store: string; purpose: string; date: string; durationMin: number }[]>([])
  const [statsLoading, setStatsLoading] = useState(false)

  const fetchRecords = useCallback(async () => {
    setStatsLoading(true)
    try {
      const list = await getStoreVisitRecords({
        startStr: startDate,
        endStr: endDate,
        store: storeFilter !== ALL ? storeFilter : undefined,
        employeeName: employeeFilter !== ALL ? employeeFilter : undefined,
        department: deptFilter !== ALL ? deptFilter : undefined,
        purpose: purposeFilter !== ALL ? purposeFilter : undefined,
        userStore: isManager && userStore ? userStore : undefined,
        userRole: isManager ? auth?.role : undefined,
      })
      setRecords(Array.isArray(list) ? list : [])
    } catch {
      setRecords([])
    } finally {
      setStatsLoading(false)
    }
  }, [startDate, endDate, storeFilter, employeeFilter, deptFilter, purposeFilter, isManager, userStore, auth?.role])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const filterOptions = useMemo(() => {
    const stores = isManager && userStore ? [userStore] : [...new Set(records.map((r) => r.store))].filter(Boolean).sort()
    const employees = [...new Set(records.map((r) => r.employee))].filter(Boolean).sort()
    const depts = [...new Set(records.map((r) => r.department))].filter(Boolean).sort()
    const purposes = [...new Set(records.map((r) => r.purpose))].filter(Boolean).sort()
    return { stores, employees, depts, purposes }
  }, [records, isManager, userStore])

  const filtered = records

  const byDept = useMemo(() => aggregateBy(filtered, "department"), [filtered])
  const byEmployee = useMemo(() => aggregateBy(filtered, "employee"), [filtered])
  const byStore = useMemo(() => aggregateBy(filtered, "store"), [filtered])
  const byPurpose = useMemo(() => aggregateBy(filtered, "purpose"), [filtered])
  const weeklyTrend = useMemo(() => getWeeklyTrend(filtered), [filtered])
  const crossMatrix = useMemo(() => getStorePurposeMatrix(filtered), [filtered])

  const totalMin = filtered.reduce((s, r) => s + r.durationMin, 0)
  const uniqueStores = new Set(filtered.map((r) => r.store)).size
  const uniqueEmployees = new Set(filtered.map((r) => r.employee)).size

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_start_date")}</label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-[160px] rounded border border-border bg-background pl-8 pr-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_end_date")}</label>
          <div className="relative">
            <CalendarDays className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-[160px] rounded border border-border bg-background pl-8 pr-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_stats_filter_store")}</label>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            disabled={isManager && !!userStore}
            className={cn(
              "h-9 min-w-[140px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none",
              isManager && "bg-muted cursor-not-allowed"
            )}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
          >
            {!isManager && <option value={ALL}>{t("all")}</option>}
            {(isManager && userStore ? [userStore] : filterOptions.stores).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_stats_filter_employee")}</label>
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="h-9 min-w-[140px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
          >
            <option value={ALL}>{t("all")}</option>
            {filterOptions.employees.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_stats_filter_dept")}</label>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 min-w-[120px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
          >
            <option value={ALL}>{t("all")}</option>
            {filterOptions.depts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("visit_stats_filter_purpose")}</label>
          <select
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
            className="h-9 min-w-[120px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
          >
            <option value={ALL}>{t("all")}</option>
            {filterOptions.purposes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => fetchRecords()}
          disabled={statsLoading}
          className="inline-flex h-9 items-center gap-2 rounded bg-[#2563eb] px-5 text-[13px] font-medium text-[hsl(0,0%,100%)] hover:bg-[#1d4ed8] transition-colors disabled:opacity-60"
        >
          <Search className="h-3.5 w-3.5" />
          {statsLoading ? t("visit_stats_querying") : t("visit_stats_query_btn")}
        </button>
        <div className="ml-auto text-[12px] text-muted-foreground">
          {t("visit_stats_result_count")}: <span className="font-medium text-foreground">{filtered.length}</span>{t("visit_count_suffix")}
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        totalMin={totalMin}
        totalVisits={filtered.length}
        uniqueStores={uniqueStores}
        uniqueEmployees={uniqueEmployees}
      />

      {/* Trend + Purpose Donut */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart data={weeklyTrend} />
        </div>
        <div className="lg:col-span-1">
          <PurposeDonut data={byPurpose} />
        </div>
      </div>

      {/* Bar Charts - 2x2 grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <RankedBarChart title={t("visit_chart_store_hours")} color="#2563eb" data={byStore} />
        <RankedBarChart title={t("visit_chart_employee_hours")} color="#059669" data={byEmployee} />
        <RankedBarChart title={t("visit_chart_dept_hours")} color="#d97706" data={byDept} />
        <RankedBarChart title={t("visit_chart_purpose_hours")} color="#dc2626" data={byPurpose} />
      </div>

      {/* Cross Analysis Heatmap */}
      <HeatmapTable
        stores={crossMatrix.stores}
        purposes={crossMatrix.purposes}
        matrix={crossMatrix.matrix}
      />
    </div>
  )
}
