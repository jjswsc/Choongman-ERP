"use client"

import * as React from "react"
import { CalendarIcon, Search, CheckCircle2, ArrowRightFromLine, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getWorkLogPeriodSummary, type WorkLogPeriodDay } from "@/lib/api-client"
import { getBangkokMonthRangeWithOffset } from "@/lib/bangkok-time"
import { WorklogKpiCard } from "./worklog-shared-ui"
import { workLogProgressBarClass } from "@/lib/work-log-shared"

type Props = {
  employeeId?: number
  employeeName: string
  onDatePick?: (dateStr: string) => void
  embedded?: boolean
}

export function WorklogPeriodPanel({ employeeId, employeeName, onDatePick, embedded }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const monthRange = React.useMemo(() => getBangkokMonthRangeWithOffset(0), [])
  const [startStr, setStartStr] = React.useState(monthRange.start)
  const [endStr, setEndStr] = React.useState(monthRange.end)
  const [days, setDays] = React.useState<WorkLogPeriodDay[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)

  const loadData = React.useCallback(async () => {
    if (!employeeName) return
    setLoading(true)
    try {
      const rows = await getWorkLogPeriodSummary({
        startStr,
        endStr,
        employeeId,
        name: employeeName,
      })
      setDays(rows)
    } catch {
      setDays([])
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, employeeId, employeeName])

  const totals = React.useMemo(() => {
    let totalTasks = 0
    let completed = 0
    let carried = 0
    let activeDays = 0
    let progressSum = 0
    let progressCount = 0
    for (const d of days) {
      totalTasks += d.totalTasks
      completed += d.completed
      carried += d.carried
      if (d.hasActivity || d.totalTasks > 0) activeDays++
      if (d.totalTasks > 0) {
        progressSum += d.avgProgress
        progressCount++
      }
    }
    return {
      totalTasks,
      completed,
      carried,
      activeDays,
      avgProgress: progressCount > 0 ? Math.round(progressSum / progressCount) : 0,
    }
  }, [days])

  return (
    <div className={cn("flex flex-col gap-6", embedded && "pb-4")}>
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {t("workLogPeriod")}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => {
                  setStartStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => {
                  setEndStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
            </div>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={() => { setHasSearched(true); void loadData() }} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
        </div>
      </div>

      {hasSearched && !loading && days.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WorklogKpiCard
            icon={<BarChart3 className="h-4 w-4 text-primary" />}
            label={t("workLogPeriodActiveDays")}
            value={totals.activeDays}
            tone="primary"
          />
          <WorklogKpiCard
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            label={t("workLogCompleted")}
            value={totals.completed}
            tone="success"
          />
          <WorklogKpiCard
            icon={<ArrowRightFromLine className="h-4 w-4 text-warning" />}
            label={t("workLogCarried")}
            value={totals.carried}
            tone="warning"
          />
          <WorklogKpiCard
            icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
            label={t("workLogAvgProgress")}
            value={`${totals.avgProgress}%`}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : hasSearched && days.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          {t("workLogNoPeriodData")}
        </div>
      ) : (
        hasSearched && (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-semibold">{t("workLogColDate")}</th>
                  <th className="px-3 py-2.5 font-semibold text-right">{t("workLogTotalTasks")}</th>
                  <th className="px-3 py-2.5 font-semibold text-right">{t("workLogCompleted")}</th>
                  <th className="px-3 py-2.5 font-semibold text-right">{t("workLogCarried")}</th>
                  <th className="px-3 py-2.5 font-semibold text-right">{t("workLogInProgress")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogColProgress")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogPeriodClosed")}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr
                    key={d.date}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30",
                      onDatePick && "cursor-pointer"
                    )}
                    onClick={() => onDatePick?.(d.date)}
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">{d.date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.totalTasks}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{d.completed}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-warning">{d.carried}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.inProgress}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", workLogProgressBarClass(d.avgProgress))}
                            style={{ width: `${d.avgProgress}%` }}
                          />
                        </div>
                        <span className="tabular-nums">{d.avgProgress}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {d.hasActivity ? (
                        <span className="text-success font-medium">{t("workLogPeriodClosedYes")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("workLogPeriodClosedNo")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
