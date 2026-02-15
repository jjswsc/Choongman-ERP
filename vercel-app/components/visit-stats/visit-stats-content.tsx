"use client"

import { useState, useMemo, useEffect } from "react"
import { CalendarDays, Search, MapPin, BarChart3 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import {
  visitRecords,
  aggregateBy,
  getWeeklyTrend,
  getStorePurposeMatrix,
} from "@/lib/visit-data"
import { SummaryCards } from "./summary-cards"
import { RankedBarChart } from "./ranked-bar-chart"
import { TrendChart } from "./trend-chart"
import { HeatmapTable } from "./heatmap-table"
import { PurposeDonut } from "./purpose-donut"
import { cn } from "@/lib/utils"

const ALL = "__ALL__"

const pageTabs = [
  { id: "list", icon: MapPin, label: "방문 목록" },
  { id: "stats", icon: BarChart3, label: "매장 방문 통계" },
]

export function VisitStatsContent() {
  const { auth } = useAuth()
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()

  const [activeTab, setActiveTab] = useState("stats")
  const [startDate, setStartDate] = useState("2026-01-01")
  const [endDate, setEndDate] = useState("2026-02-15")
  const [storeFilter, setStoreFilter] = useState(ALL)
  const [employeeFilter, setEmployeeFilter] = useState(ALL)
  const [deptFilter, setDeptFilter] = useState(ALL)
  const [purposeFilter, setPurposeFilter] = useState(ALL)

  const dateFiltered = useMemo(() => {
    return visitRecords.filter((r) => r.date >= startDate && r.date <= endDate)
  }, [startDate, endDate])

  const scopeData = useMemo(() => {
    if (isManager && userStore) return dateFiltered.filter((r) => r.store === userStore)
    return dateFiltered
  }, [dateFiltered, isManager, userStore])

  const filterOptions = useMemo(() => {
    const stores = isManager && userStore ? [userStore] : [...new Set(dateFiltered.map((r) => r.store))].sort()
    const employees = [...new Set(scopeData.map((r) => r.employee))].sort()
    const depts = [...new Set(scopeData.map((r) => r.department))].sort()
    const purposes = [...new Set(scopeData.map((r) => r.purpose))].sort()
    return { stores, employees, depts, purposes }
  }, [dateFiltered, scopeData, isManager, userStore])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const filtered = useMemo(() => {
    let data = scopeData
    if (!isManager && storeFilter !== ALL) data = data.filter((r) => r.store === storeFilter)
    if (employeeFilter !== ALL) data = data.filter((r) => r.employee === employeeFilter)
    if (deptFilter !== ALL) data = data.filter((r) => r.department === deptFilter)
    if (purposeFilter !== ALL) data = data.filter((r) => r.purpose === purposeFilter)
    return data
  }, [scopeData, isManager, storeFilter, employeeFilter, deptFilter, purposeFilter])

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
    <div className="flex flex-col h-screen">
      {/* Page Title */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-foreground">매장 방문 현황</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          매장 방문 데이터를 다양한 관점에서 분석합니다
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {pageTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium transition-all",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {activeTab === "stats" && (
          <div className="space-y-5">
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  시작일
                </label>
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
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  종료일
                </label>
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

              {/* 매장 (매니저는 자기 매장만, 선택 불가) */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  매장
                </label>
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
                  {!isManager && <option value={ALL}>전체</option>}
                  {(isManager && userStore ? [userStore] : filterOptions.stores).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* 직원 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  직원
                </label>
                <select
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                  className="h-9 min-w-[140px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
                >
                  <option value={ALL}>전체</option>
                  {filterOptions.employees.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>

              {/* 부서 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  부서
                </label>
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="h-9 min-w-[120px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
                >
                  <option value={ALL}>전체</option>
                  {filterOptions.depts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* 목적 */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  목적
                </label>
                <select
                  value={purposeFilter}
                  onChange={(e) => setPurposeFilter(e.target.value)}
                  className="h-9 min-w-[120px] rounded border border-border bg-background pl-3 pr-8 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center" }}
                >
                  <option value={ALL}>전체</option>
                  {filterOptions.purposes.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <button className="inline-flex h-9 items-center gap-2 rounded bg-[#2563eb] px-5 text-[13px] font-medium text-[hsl(0,0%,100%)] hover:bg-[#1d4ed8] transition-colors">
                <Search className="h-3.5 w-3.5" />
                통계 조회
              </button>
              <div className="ml-auto text-[12px] text-muted-foreground">
                조회 결과: <span className="font-medium text-foreground">{filtered.length}</span>건
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
              <RankedBarChart title="매장별 투입시간" color="#2563eb" data={byStore} />
              <RankedBarChart title="직원별 투입시간" color="#059669" data={byEmployee} />
              <RankedBarChart title="부서별 투입시간" color="#d97706" data={byDept} />
              <RankedBarChart title="목적별 투입시간" color="#dc2626" data={byPurpose} />
            </div>

            {/* Cross Analysis Heatmap */}
            <HeatmapTable
              stores={crossMatrix.stores}
              purposes={crossMatrix.purposes}
              matrix={crossMatrix.matrix}
            />
          </div>
        )}

        {activeTab === "list" && (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-[14px]">
            방문 목록 탭 내용이 여기에 표시됩니다.
          </div>
        )}
      </div>
    </div>
  )
}
