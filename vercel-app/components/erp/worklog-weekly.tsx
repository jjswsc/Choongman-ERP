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
import { getWorkLogWeekly, getNoticeOptions, type WorkLogWeeklySummary } from "@/lib/api-client"

function getWeekRange(date: Date): { start: string; end: string; label: string } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  const start = monday.toISOString().slice(0, 10)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const end = sunday.toISOString().slice(0, 10)
  const fmt = (x: Date) =>
    `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(x.getDate()).padStart(2, "0")}`
  return { start, end, label: `${fmt(monday)} ~ ${fmt(sunday)}` }
}

export function WorklogWeekly() {
  const today = new Date()
  const [weekOffset, setWeekOffset] = React.useState(0)
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [depts, setDepts] = React.useState<string[]>([])
  const [data, setData] = React.useState<{
    summaries: WorkLogWeeklySummary[]
    totalTasks: number
    totalCompleted: number
    totalCarried: number
    overallAvg: number
  } | null>(null)
  const [loading, setLoading] = React.useState(false)

  const week = React.useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + weekOffset * 7)
    return getWeekRange(d)
  }, [weekOffset])

  React.useEffect(() => {
    getNoticeOptions().then((r) => setDepts(r.roles || []))
  }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogWeekly({
        startStr: week.start,
        endStr: week.end,
        dept: deptFilter,
      })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [week.start, week.end, deptFilter])

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
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              주간 선택
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setWeekOffset((o) => o - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-9 items-center rounded-md border bg-card px-4 text-xs font-bold">
                {week.label}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setWeekOffset((o) => o + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">부서</label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {depts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
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
            <span className="text-xs font-semibold text-muted-foreground">총 업무</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{totalTasks}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">완료</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-success">{totalCompleted}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
              <ArrowRightFromLine className="h-4 w-4 text-warning" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">이월</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-warning">{totalCarried}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">평균 진행률</span>
          </div>
          <p className="text-2xl font-extrabold tabular-nums text-foreground">{overallAvg}%</p>
        </div>
      </div>

      {/* Employee table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">직원별 주간 실적</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : weeklyData.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              조회된 데이터가 없습니다.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">직원</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">직급</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">총 업무</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">완료</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">이월</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground text-center w-24">진행중</th>
                  <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-48">평균 진행률</th>
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
