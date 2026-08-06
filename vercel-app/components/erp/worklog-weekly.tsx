"use client"

import * as React from "react"
import {
  BarChart3,
  CalendarIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  CheckCircle2,
  ArrowRightFromLine,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getWorkLogWeekly, getWorkLogOfficeOptions, type WorkLogWeeklySummary } from "@/lib/api-client"
import { formatWorkLogStaffSelectLabel } from "@/lib/work-log-name"
import { getBangkokWeekRange, getBangkokMonthRangeWithOffset } from "@/lib/bangkok-time"
import { downloadCsv, workLogProgressBarClass } from "@/lib/work-log-shared"
import { WorklogKpiCard } from "./worklog-shared-ui"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

type WorkLogStaffOpt = { id: number; name: string; displayName: string; store?: string; job?: string }
type SortKey = "avg" | "carried" | "completed" | "name"

export function WorklogWeekly() {
  const { lang } = useLang()
  const t = useT(lang)
  const [periodType, setPeriodType] = React.useState<"week" | "month">("week")
  const [periodOffset, setPeriodOffset] = React.useState(0)
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("avg")
  const [depts, setDepts] = React.useState<string[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [staffList, setStaffList] = React.useState<WorkLogStaffOpt[]>([])
  const [data, setData] = React.useState<{
    summaries: WorkLogWeeklySummary[]
    totalTasks: number
    totalCompleted: number
    totalCarried: number
    overallAvg: number
  } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)

  const staffOptions = React.useMemo(
    () =>
      staffList
        .filter((s) => {
          if (storeFilter !== "all" && s.store !== storeFilter) return false
          if (deptFilter !== "all" && s.job !== deptFilter) return false
          return true
        })
        .map((s) => ({ ...s, label: formatWorkLogStaffSelectLabel(s) })),
    [staffList, storeFilter, deptFilter]
  )

  const dateRange = React.useMemo(() => {
    if (periodType === "week") return getBangkokWeekRange(periodOffset)
    return getBangkokMonthRangeWithOffset(periodOffset)
  }, [periodType, periodOffset])

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setDepts(r.depts || [])
      setStores(r.stores || [])
      setStaffList((r.staff || []) as WorkLogStaffOpt[])
    })
  }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogWeekly({
        startStr: dateRange.start,
        endStr: dateRange.end,
        dept: deptFilter,
        employee: employeeFilter,
        store: storeFilter,
      })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange.start, dateRange.end, deptFilter, employeeFilter, storeFilter])

  const handleSearch = () => {
    setHasSearched(true)
    void loadData()
  }

  const weeklyData = data?.summaries || []
  const totalTasks = data?.totalTasks ?? 0
  const totalCompleted = data?.totalCompleted ?? 0
  const totalCarried = data?.totalCarried ?? 0
  const overallAvg = data?.overallAvg ?? 0

  const sortedData = React.useMemo(() => {
    const rows = [...weeklyData]
    rows.sort((a, b) => {
      if (sortKey === "name") return a.employee.localeCompare(b.employee)
      if (sortKey === "carried") return b.carried - a.carried || b.avgProgress - a.avgProgress
      if (sortKey === "completed") return b.completed - a.completed || b.avgProgress - a.avgProgress
      return b.avgProgress - a.avgProgress || b.completed - a.completed
    })
    return rows
  }, [weeklyData, sortKey])

  const chartData = React.useMemo(
    () =>
      sortedData.slice(0, 12).map((row) => {
        const staffRow = staffList.find(
          (s) => s.name === row.employee || s.displayName === row.employee
        )
        return {
          name: staffRow ? formatWorkLogStaffSelectLabel(staffRow) : row.employee,
          completed: row.completed,
          carried: row.carried,
        }
      }),
    [sortedData, staffList]
  )

  const handleExportCsv = () => {
    if (sortedData.length === 0) return
    downloadCsv(
      `work-log-${dateRange.start}_${dateRange.end}.csv`,
      [
        t("workLogColEmployee"),
        t("workLogColRole"),
        t("workLogTotalTasks"),
        t("workLogCompleted"),
        t("workLogCarried"),
        t("workLogInProgress"),
        t("workLogAvgProgress"),
      ],
      sortedData.map((row) => {
        const staffRow = staffList.find(
          (s) => s.name === row.employee || s.displayName === row.employee
        )
        const label = staffRow ? formatWorkLogStaffSelectLabel(staffRow) : row.employee
        return [
          label,
          row.role,
          row.totalTasks,
          row.completed,
          row.carried,
          row.inProgress,
          `${row.avgProgress}%`,
        ]
      })
    )
  }

  const chartConfig = {
    completed: { label: t("workLogCompleted"), color: "hsl(var(--success))" },
    carried: { label: t("workLogCarried"), color: "hsl(var(--warning))" },
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogPeriodType")}</label>
            <Select
              value={periodType}
              onValueChange={(v) => {
                setPeriodType(v as "week" | "month")
                setPeriodOffset(0)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{t("workLogWeek")}</SelectItem>
                <SelectItem value="month">{t("workLogMonth")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {periodType === "week" ? t("workLogWeek") : t("workLogMonth")} {t("workLogPeriodSelect")}
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setPeriodOffset((o) => o - 1)
                  setHasSearched(false)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-9 min-w-[180px] items-center justify-center rounded-md border bg-card px-4 text-xs font-bold">
                {dateRange.label}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setPeriodOffset((o) => o + 1)
                  setHasSearched(false)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogDept")}</label>
            <Select
              value={deptFilter}
              onValueChange={(v) => {
                setDeptFilter(v)
                setEmployeeFilter("all")
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {depts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stores.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">{t("workLogStore")}</label>
              <Select
                value={storeFilter}
                onValueChange={(v) => {
                  setStoreFilter(v)
                  setEmployeeFilter("all")
                  setHasSearched(false)
                }}
              >
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogEmployee")}</label>
            <Select
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
          {hasSearched && sortedData.length > 0 && (
            <Button size="sm" variant="outline" className="h-9 px-4 text-xs" onClick={handleExportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("workLogExportCsv")}
            </Button>
          )}
        </div>
      </div>

      {hasSearched && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <WorklogKpiCard
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
            }
            label={t("workLogTotalTasks")}
            value={totalTasks}
          />
          <WorklogKpiCard
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
            }
            label={t("workLogCompleted")}
            value={totalCompleted}
            tone="success"
          />
          <WorklogKpiCard
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                <ArrowRightFromLine className="h-4 w-4 text-warning" />
              </div>
            }
            label={t("workLogCarried")}
            value={totalCarried}
            tone="warning"
          />
          <WorklogKpiCard
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
            }
            label={t("workLogAvgProgress")}
            value={`${overallAvg}%`}
          />
        </div>
      )}

      {hasSearched && chartData.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-foreground">{t("workLogChartWeekly")}</h3>
          <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={64} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="carried" fill="var(--color-carried)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            {t("workLogColEmployee")} {periodType === "week" ? t("workLogWeek") : t("workLogMonth")}{" "}
            {t("workLogWeeklyTitle")}
          </h3>
          {hasSearched && sortedData.length > 0 && (
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="ml-auto h-8 w-40 text-xs">
                <SelectValue placeholder={t("workLogSortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avg">{t("workLogSortAvgDesc")}</SelectItem>
                <SelectItem value="completed">{t("workLogSortCompletedDesc")}</SelectItem>
                <SelectItem value="carried">{t("workLogSortCarriedDesc")}</SelectItem>
                <SelectItem value="name">{t("workLogColEmployee")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <AdminTableScroll hint={false}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !hasSearched ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("orderSearchHint") || "조회 버튼을 눌러 주세요."}
            </div>
          ) : sortedData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("workLogNoWeeklyData")}</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">{t("workLogColEmployee")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">{t("workLogColRole")}</th>
                  <th className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground w-24">
                    {t("workLogTotalTasks")}
                  </th>
                  <th className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground w-24">
                    {t("workLogCompleted")}
                  </th>
                  <th className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground w-24">
                    {t("workLogCarried")}
                  </th>
                  <th className="px-5 py-3 text-center text-[11px] font-bold text-muted-foreground w-24">
                    {t("workLogInProgress")}
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-48">{t("workLogAvgProgress")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row) => {
                  const staffRow = staffList.find(
                    (s) => s.name === row.employee || s.displayName === row.employee
                  )
                  const empLabel = staffRow ? formatWorkLogStaffSelectLabel(staffRow) : row.employee
                  return (
                    <tr key={row.employee} className="border-b last:border-b-0 hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-sm font-bold text-foreground">{empLabel}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-muted-foreground">{row.role}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-sm font-bold tabular-nums">{row.totalTasks}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-success/10 px-2 text-xs font-bold tabular-nums text-success">
                          {row.completed}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-warning/10 px-2 text-xs font-bold tabular-nums text-warning">
                          {row.carried}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-2 text-xs font-bold tabular-nums text-primary">
                          {row.inProgress}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full transition-all", workLogProgressBarClass(row.avgProgress))}
                              style={{ width: `${row.avgProgress}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              "w-9 text-right text-xs font-bold tabular-nums",
                              row.avgProgress === 100 ? "text-success" : "text-muted-foreground"
                            )}
                          >
                            {row.avgProgress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </AdminTableScroll>
      </div>
    </div>
  )
}
