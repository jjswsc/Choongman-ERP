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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getWorkLogWeekly, getWorkLogOfficeOptions, type WorkLogWeeklySummary } from "@/lib/api-client"

function getWeekRange(date: Date): { start: string; end: string; label: string } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  const start = monday.toISOString().slice(0, 10)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const end = sunday.toISOString().slice(0, 10)
  const fmt = (x: Date) =>
    `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(x.getDate()).padStart(2, "0")}`
  return { start, end, label: `${fmt(monday)} ~ ${fmt(sunday)}` }
}

function getMonthRange(date: Date): { start: string; end: string; label: string } {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = d.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  const start = first.toISOString().slice(0, 10)
  const end = last.toISOString().slice(0, 10)
  const fmt = `${y}.${String(m + 1).padStart(2, "0")}`
  return { start, end, label: `${fmt} (${first.getDate()} ~ ${last.getDate()}일)` }
}

export function WorklogWeekly() {
  const { lang } = useLang()
  const t = useT(lang)
  const today = new Date()
  const [periodType, setPeriodType] = React.useState<"week" | "month">("week")
  const [periodOffset, setPeriodOffset] = React.useState(0)
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [depts, setDepts] = React.useState<string[]>([])
  const [staffList, setStaffList] = React.useState<{ name: string; displayName: string }[]>([])
  const [data, setData] = React.useState<{
    summaries: WorkLogWeeklySummary[]
    totalTasks: number
    totalCompleted: number
    totalCarried: number
    overallAvg: number
  } | null>(null)
  const [loading, setLoading] = React.useState(false)

  const dateRange = React.useMemo(() => {
    const d = new Date(today)
    if (periodType === "week") {
      d.setDate(d.getDate() + periodOffset * 7)
      return getWeekRange(d)
    } else {
      d.setMonth(d.getMonth() + periodOffset)
      return getMonthRange(d)
    }
  }, [periodType, periodOffset])

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setDepts(r.depts || [])
      setStaffList(r.staff || [])
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
      })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange.start, dateRange.end, deptFilter, employeeFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const weeklyData = data?.summaries || []
  const totalTasks = data?.totalTasks ?? 0
  const totalCompleted = data?.totalCompleted ?? 0
  const totalCarried = data?.totalCarried ?? 0
  const overallAvg = data?.overallAvg ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogPeriodType")}</label>
            <Select value={periodType} onValueChange={(v) => { setPeriodType(v as "week" | "month"); setPeriodOffset(0) }}>
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
                onClick={() => setPeriodOffset((o) => o - 1)}
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
                onClick={() => setPeriodOffset((o) => o + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogDept")}</label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
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
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">{t("workLogEmployee")}</label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.name} value={s.displayName || s.name}>
                    {s.displayName || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{t("workLogTotalTasks")}</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{totalTasks}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{t("workLogCompleted")}</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-success">{totalCompleted}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
              <ArrowRightFromLine className="h-4 w-4 text-warning" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{t("workLogCarried")}</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-warning">{totalCarried}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{t("workLogAvgProgress")}</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{overallAvg}%</p>
        </div>
      </div>

      {/* Employee table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{t("workLogColEmployee")} {periodType === "week" ? t("workLogWeek") : t("workLogMonth")} {t("workLogWeeklyTitle")}</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : weeklyData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("workLogNoWeeklyData")}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">{t("workLogColEmployee")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">{t("workLogColRole")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">{t("workLogTotalTasks")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">{t("workLogCompleted")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">{t("workLogCarried")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">{t("workLogInProgress")}</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-48">{t("workLogAvgProgress")}</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.map((row) => (
                  <tr key={row.employee} className="border-b last:border-b-0 hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-sm font-bold text-foreground">{row.employee}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-muted-foreground">{row.role}</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="text-sm font-bold tabular-nums text-foreground">{row.totalTasks}</span>
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
                            className={cn(
                              "h-full rounded-full transition-all",
                              row.avgProgress === 100
                                ? "bg-success"
                                : row.avgProgress >= 70
                                  ? "bg-primary"
                                  : row.avgProgress >= 40
                                    ? "bg-warning"
                                    : "bg-destructive/60"
                            )}
                            style={{ width: `${row.avgProgress}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-xs font-bold tabular-nums w-9 text-right",
                            row.avgProgress === 100 ? "text-success" : "text-muted-foreground"
                          )}
                        >
                          {row.avgProgress}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
