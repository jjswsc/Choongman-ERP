"use client"

import * as React from "react"
import {
  CalendarIcon,
  Search,
  Building2,
  User,
  Briefcase,
  Clock,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getWorkLogEmployeeInsights,
  getWorkLogOfficeOptions,
  type WorkLogEmployeeInsights,
} from "@/lib/api-client"
import { getBangkokMonthRangeWithOffset } from "@/lib/bangkok-time"
import { formatWorkLogStaffSelectLabel } from "@/lib/work-log-name"
import { useAuth } from "@/lib/auth-context"
import {
  isWorklogDraftDate,
  useWorklogQueryDraftPersistence,
  worklogQueryDraftKey,
} from "@/lib/worklog-query-draft"
import { WorklogKpiCard } from "./worklog-shared-ui"

type WorkLogStaffOpt = { id: number; name: string; displayName: string; store?: string }

type InsightsQueryDraft = {
  startStr?: string
  endStr?: string
  employeeFilter?: string
  storeFilter?: string
  hasSearched?: boolean
}

export function WorklogInsightsPanel() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const monthRange = React.useMemo(() => getBangkokMonthRangeWithOffset(0), [])
  const [startStr, setStartStr] = React.useState(monthRange.start)
  const [endStr, setEndStr] = React.useState(monthRange.end)
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [staffList, setStaffList] = React.useState<WorkLogStaffOpt[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [data, setData] = React.useState<WorkLogEmployeeInsights | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setStaffList((r.staff || []) as WorkLogStaffOpt[])
      setStores(r.stores || [])
    })
  }, [])

  const staffOptions = React.useMemo(
    () =>
      staffList
        .filter((s) => storeFilter === "all" || s.store === storeFilter)
        .map((s) => ({ ...s, label: formatWorkLogStaffSelectLabel(s) })),
    [staffList, storeFilter]
  )

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogEmployeeInsights({
        startStr,
        endStr,
        employeeId: employeeFilter,
        store: storeFilter,
      })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, employeeFilter, storeFilter])

  const queryDraft = React.useMemo<InsightsQueryDraft>(
    () => ({ startStr, endStr, employeeFilter, storeFilter, hasSearched }),
    [startStr, endStr, employeeFilter, storeFilter, hasSearched]
  )
  const shouldPersistQueryDraft =
    hasSearched ||
    startStr !== monthRange.start ||
    endStr !== monthRange.end ||
    employeeFilter !== "all" ||
    storeFilter !== "all"

  const applyQueryDraft = React.useCallback(
    (d: InsightsQueryDraft) => {
      const meaningful =
        d.hasSearched === true ||
        (isWorklogDraftDate(d.startStr) && d.startStr !== monthRange.start) ||
        (isWorklogDraftDate(d.endStr) && d.endStr !== monthRange.end) ||
        (typeof d.employeeFilter === "string" && d.employeeFilter !== "all") ||
        (typeof d.storeFilter === "string" && d.storeFilter !== "all")
      if (!meaningful) return false
      if (isWorklogDraftDate(d.startStr)) setStartStr(d.startStr)
      if (isWorklogDraftDate(d.endStr)) setEndStr(d.endStr)
      if (typeof d.employeeFilter === "string") setEmployeeFilter(d.employeeFilter)
      if (typeof d.storeFilter === "string") setStoreFilter(d.storeFilter)
      if (d.hasSearched) setHasSearched(true)
      return true
    },
    [monthRange.start, monthRange.end]
  )

  const { restoreEpoch } = useWorklogQueryDraftPersistence({
    storageKey: worklogQueryDraftKey("insights", auth?.user || ""),
    draft: queryDraft,
    shouldPersist: shouldPersistQueryDraft,
    applyDraft: applyQueryDraft,
  })

  const restoredFetchEpochRef = React.useRef(0)
  React.useEffect(() => {
    if (restoreEpoch === 0 || !hasSearched) return
    if (restoredFetchEpochRef.current === restoreEpoch) return
    restoredFetchEpochRef.current = restoreEpoch
    void loadData()
  }, [restoreEpoch, hasSearched, loadData])

  const handleSearch = () => {
    setHasSearched(true)
    void loadData()
  }

  const workRows = data?.work || []
  const attendanceRows = data?.attendance || []
  const evalRows = data?.evaluations || []

  const workTotals = React.useMemo(() => {
    let completed = 0
    let carried = 0
    let days = 0
    for (const r of workRows) {
      completed += Number(r.completed) || 0
      carried += Number(r.carried) || 0
      if ((Number(r.total_tasks) || 0) > 0) days++
    }
    return { completed, carried, days }
  }, [workRows])

  const attTotals = React.useMemo(() => {
    let clockIn = 0
    let otMin = 0
    for (const r of attendanceRows) {
      clockIn += Number(r.clock_in_count) || 0
      otMin += Number(r.ot_min_sum) || 0
    }
    return { clockIn, otMin }
  }, [attendanceRows])

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="mb-4 text-xs text-muted-foreground">{t("workLogInsightsHint")}</p>
        <div className="flex flex-wrap items-end gap-3">
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
          {stores.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {t("workLogStore")}
              </label>
              <Select
                value={storeFilter}
                onValueChange={(v) => {
                  setStoreFilter(v)
                  setEmployeeFilter("all")
                  setHasSearched(false)
                }}
              >
                <SelectTrigger className="h-9 w-32 text-xs shrink-0">
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
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <Select
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-40 text-xs shrink-0">
                <SelectValue placeholder={t("workLogInsightsPickEmployee")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("workLogInsightsPickEmployee")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            className="h-9 px-4 text-xs font-semibold"
            onClick={handleSearch}
            disabled={loading || employeeFilter === "all"}
          >
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
        </div>
      </div>

      {employeeFilter === "all" && (
        <div className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
          {t("workLogInsightsPickEmployee")}
        </div>
      )}

      {employeeFilter !== "all" && loading && (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {employeeFilter !== "all" && hasSearched && !loading && (
        <>
          {(data?.employeeName || data?.employeeStore) && (
            <div className="rounded-lg border bg-muted/30 px-4 py-2 text-sm">
              <span className="font-semibold">{data?.employeeName}</span>
              {data?.employeeStore ? (
                <span className="ml-2 text-muted-foreground">
                  · {t("workLogStore")}: {data.employeeStore}
                </span>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <WorklogKpiCard
              icon={<Briefcase className="h-4 w-4 text-primary" />}
              label={t("workLogInsightsWorkDays")}
              value={workTotals.days}
              tone="primary"
            />
            <WorklogKpiCard
              icon={<Briefcase className="h-4 w-4 text-success" />}
              label={t("workLogCompleted")}
              value={workTotals.completed}
              tone="success"
            />
            <WorklogKpiCard
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              label={t("workLogInsightsClockInDays")}
              value={attTotals.clockIn}
            />
            <WorklogKpiCard
              icon={<Clock className="h-4 w-4 text-warning" />}
              label={t("workLogInsightsOtHours")}
              value={Math.round(attTotals.otMin / 60)}
              tone="warning"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-3">
                <Briefcase className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">{t("workLogInsightsWorkSection")}</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {workRows.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">{t("workLogNoInsightsWork")}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="px-3 py-2 font-semibold">{t("workLogColDate")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogTotalTasks")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogCompleted")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogAvgProgress")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workRows.map((r) => (
                        <tr key={r.log_date} className="border-b last:border-0">
                          <td className="px-3 py-2 tabular-nums">{String(r.log_date).slice(0, 10)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.total_tasks}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-success">{r.completed}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{Math.round(Number(r.avg_progress) || 0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-bold">{t("workLogInsightsAttendanceSection")}</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {attendanceRows.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">{t("workLogNoInsightsAttendance")}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left">
                        <th className="px-3 py-2 font-semibold">{t("workLogColDate")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogInsightsClockIn")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogInsightsClockOut")}</th>
                        <th className="px-3 py-2 font-semibold text-right">{t("workLogInsightsOtMin")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRows.map((r) => (
                        <tr key={r.log_date} className="border-b last:border-0">
                          <td className="px-3 py-2 tabular-nums">{String(r.log_date).slice(0, 10)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.clock_in_count}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.clock_out_count}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.ot_min_sum}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-warning/5 px-4 py-3">
              <Star className="h-4 w-4 text-warning" />
              <h3 className="text-sm font-bold">{t("workLogInsightsEvalSection")}</h3>
            </div>
            <AdminTableScroll hint={false}>
              {evalRows.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">{t("workLogNoInsightsEval")}</p>
              ) : (
                <table className="w-full min-w-[480px] text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-3 py-2 font-semibold">{t("workLogColDate")}</th>
                      <th className="px-3 py-2 font-semibold">{t("workLogInsightsEvalType")}</th>
                      <th className="px-3 py-2 font-semibold">{t("workLogInsightsEvalGrade")}</th>
                      <th className="px-3 py-2 font-semibold">{t("workLogStore")}</th>
                      <th className="px-3 py-2 font-semibold">{t("workLogInsightsEvaluator")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalRows.map((r, i) => (
                      <tr key={`${r.eval_date}-${i}`} className="border-b last:border-0">
                        <td className="px-3 py-2 tabular-nums">{String(r.eval_date).slice(0, 10)}</td>
                        <td className="px-3 py-2">{r.eval_type || "-"}</td>
                        <td className="px-3 py-2 font-semibold">{r.final_grade || "-"}</td>
                        <td className="px-3 py-2">{r.store_name || "-"}</td>
                        <td className="px-3 py-2">{r.evaluator || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminTableScroll>
          </section>
        </>
      )}
    </div>
  )
}
