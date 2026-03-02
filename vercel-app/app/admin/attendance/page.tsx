"use client"

import * as React from "react"
import { Clock, Search } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  useStoreList,
  getAttendanceRecordsAdmin,
  processAttendanceApproval,
  approveNoClockOut,
  getAttendanceNoRecordList,
  createAttendanceFromSchedule,
  type AttendanceDailyRow,
  type AttendanceNoRecordRow,
} from "@/lib/api-client"
import { RealtimeWork } from "@/components/erp/realtime-work"
import { WeeklySchedule } from "@/components/erp/weekly-schedule"
import { AdminScheduleEdit } from "@/components/admin/admin-schedule-edit"
import { cn } from "@/lib/utils"
import { todayStrBangkok, daysAgoStrBangkok } from "@/lib/attendance-utils"

function todayStr() {
  return todayStrBangkok()
}
function weekAgoStr() {
  return daysAgoStrBangkok(7)
}

function statusToKey(s: string): string | null {
  const st = (s || "").trim()
  if (!st) return null
  if (st === "정상") return "att_status_normal"
  if (st.includes("정상") && st.includes("승인")) return "att_status_approved"
  if (st === "반려") return "att_status_rejected"
  if (st === "퇴근미기록") return "att_status_no_out"
  if (st === "지각" || st === "지각(승인)") return "att_status_late"
  if (st === "조퇴") return "att_status_early"
  if (st === "연장") return "att_status_overtime"
  if (st.includes("위치미확인") && st.includes("승인대기")) return "att_status_gps_pending"
  if (st.includes("위치미확인")) return "att_status_gps"
  if (st.includes("강제퇴근") && st.includes("승인대기")) return "att_status_forced_out_pending"
  if (st.includes("강제퇴근")) return "att_status_forced_out"
  if (st === "휴게초과") return "att_status_break_over"
  if (st === "휴게정상") return "att_status_break_ok"
  return null
}

export default function AdminAttendancePage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [stores, setStores] = React.useState<string[]>([])
  const [employeeOptions, setEmployeeOptions] = React.useState<string[]>([])

  const [startDate, setStartDate] = React.useState(todayStr)
  const [endDate, setEndDate] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [employeeFilter, setEmployeeFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [hasSearched, setHasSearched] = React.useState(false)
  const [list, setList] = React.useState<AttendanceDailyRow[]>([])
  const [noRecordList, setNoRecordList] = React.useState<AttendanceNoRecordRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [todayStore, setTodayStore] = React.useState("")
  const [scheduleStore, setScheduleStore] = React.useState("")
  const [otMinutesByRow, setOtMinutesByRow] = React.useState<Record<number | string, string>>({})

  const isOffice = React.useMemo(() => {
    const r = (auth?.role || "").toLowerCase()
    return ["director", "officer", "ceo", "hr"].includes(r)
  }, [auth?.role])

  const { stores: storeList, users: usersMap, staffByStore } = useStoreList()
  React.useEffect(() => {
    const st = storeList
    setStores(isOffice ? ["All", ...st] : [auth?.store || ""].filter(Boolean))
    if (!isOffice && auth?.store) {
      setStoreFilter(auth.store)
      setTodayStore(auth.store)
      setScheduleStore(auth.store)
    } else if (isOffice && st.length > 0) {
      const firstStore = st[0]
      setTodayStore(firstStore)
      setScheduleStore(firstStore)
    }
  }, [auth?.store, isOffice, storeList])

  React.useEffect(() => {
    if (storeFilter === "All" || !storeFilter) {
      const names = new Set<string>()
      Object.values(usersMap || {}).flat().forEach((n) => names.add(String(n).trim()))
      setEmployeeOptions(["All", ...Array.from(names).filter(Boolean).sort()])
    } else {
      const names = (usersMap?.[storeFilter] || []) as string[]
      setEmployeeOptions(["All", ...names.filter(Boolean).sort()])
    }
  }, [storeFilter, usersMap])

  const loadRecords = React.useCallback(() => {
    setLoading(true)
    setHasSearched(true)
    if (statusFilter === "noRecord") {
      getAttendanceNoRecordList({
        startStr: startDate,
        endStr: endDate,
        store: storeFilter === "All" ? undefined : storeFilter,
        userStore: auth?.store,
        userRole: auth?.role,
      })
        .then(setNoRecordList)
        .catch(() => setNoRecordList([]))
        .finally(() => setLoading(false))
    } else {
      getAttendanceRecordsAdmin({
        startDate,
        endDate,
        storeFilter: storeFilter === "All" ? undefined : storeFilter,
        employeeFilter: employeeFilter === "All" ? undefined : employeeFilter,
        statusFilter: "all",
        userStore: auth?.store,
        userRole: auth?.role,
      })
        .then(setList)
        .catch(() => setList([]))
        .finally(() => setLoading(false))
    }
  }, [startDate, endDate, storeFilter, employeeFilter, statusFilter, auth?.store, auth?.role])

  const uniqueStatuses = React.useMemo(
    () => [...new Set(list.map((r) => r.status).filter(Boolean))].sort(),
    [list]
  )
  const displayList =
    statusFilter === "all"
      ? list
      : statusFilter === "exceptNormal"
        ? list.filter((r) => r.status !== "정상")
        : list.filter((r) => r.status === statusFilter)

  const handleEmergencyApprove = async (row: AttendanceNoRecordRow) => {
    const res = await createAttendanceFromSchedule({
      date: row.date,
      store: row.store,
      name: row.name,
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) {
      loadRecords()
    } else {
      alert(translateApiMessage(res.message, t) || t("att_process_failed"))
    }
  }

  const handleApprove = async (id: number, optOtMinutes?: number | null, waiveLate?: boolean, optEarlyMinutes?: number | null) => {
    const res = await processAttendanceApproval({
      id,
      decision: "승인완료",
      optOtMinutes: optOtMinutes != null ? optOtMinutes : undefined,
      optEarlyMinutes: optEarlyMinutes != null ? optEarlyMinutes : undefined,
      waiveLate,
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) {
      setOtMinutesByRow((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      loadRecords()
    } else alert(translateApiMessage(res.message, t) || t("att_process_failed"))
  }

  const handleReject = async (id: number) => {
    const res = await processAttendanceApproval({
      id,
      decision: "반려",
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) loadRecords()
    else alert(translateApiMessage(res.message, t) || t("att_process_failed"))
  }

  const handleApproveNoClockOut = async (row: AttendanceDailyRow) => {
    const res = await approveNoClockOut({
      date: row.date,
      store: row.store,
      name: row.name,
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) loadRecords()
    else alert(translateApiMessage(res.message, t) || t("att_process_failed"))
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminAttendance")}</h1>
            <p className="text-xs text-muted-foreground">{t("tab_att_status")}</p>
          </div>
        </div>

        <Tabs defaultValue="status" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
            <TabsTrigger value="status">{t("tab_att_status")}</TabsTrigger>
            <TabsTrigger value="help">{t("att_tab_help")}</TabsTrigger>
            <TabsTrigger value="today">{t("tab_att_today_realtime")}</TabsTrigger>
            <TabsTrigger value="view">{t("tab_att_view")}</TabsTrigger>
            <TabsTrigger value="schedule">{t("tab_att_schedule")}</TabsTrigger>
          </TabsList>

          <TabsContent value="help" className="mt-0 space-y-4">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h2 className="text-base font-semibold">{t("att_help_title")}</h2>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_approve_in")} / {t("att_approve_out")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_approval_in")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("att_help_approval_out")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_adjust_label")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_adjust")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_ot_label")} (O.T)</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_ot")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_col_diff")} / {t("att_late_extra")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_diff")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("att_help_late_ot")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_col_status")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_status")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_tab_no_record")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_no_record")}</p>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="status" className="mt-0 space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("att_start_date")}</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-36 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("att_end_date")}</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-36 text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("stockFilterStore")}</label>
                  <Select value={storeFilter} onValueChange={setStoreFilter}>
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("label_employee")}</label>
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {employeeOptions.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("att_status_filter")}</label>
                  <Select
                    value={
                      ["all", "noRecord", "exceptNormal", "연장", "지각"].includes(statusFilter) || uniqueStatuses.includes(statusFilter)
                        ? statusFilter
                        : "all"
                    }
                    onValueChange={setStatusFilter}
                  >
                    <SelectTrigger className="h-9 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("noticeFilterAll")}</SelectItem>
                      <SelectItem value="noRecord">{t("att_tab_no_record")}</SelectItem>
                      <SelectItem value="exceptNormal">{t("att_status_except_normal")}</SelectItem>
                      <SelectItem value="연장">{statusToKey("연장") ? t(statusToKey("연장")!) : "연장"}</SelectItem>
                      <SelectItem value="지각">{statusToKey("지각") ? t(statusToKey("지각")!) : "지각"}</SelectItem>
                      {uniqueStatuses.filter((s) => s !== "연장" && s !== "지각").map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusToKey(s) ? t(statusToKey(s)!) : s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-9" onClick={loadRecords} disabled={loading}>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  {loading ? t("loading") : t("stockBtnSearch")}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              {!hasSearched ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {t("att_query_please")}
                </div>
              ) : loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>
              ) : statusFilter === "noRecord" ? (
                noRecordList.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    {t("adminAttNoRecord")}
                  </div>
                ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2.5 text-center font-semibold">{t("label_date")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold">{t("stockFilterStore")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("emp_label_name")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_in")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_out")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_break_min")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[100px]">{t("att_btn_emergency_approve")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noRecordList
                      .filter((row) => employeeFilter === "All" || row.name === employeeFilter)
                      .map((row) => (
                        <tr key={`${row.date}-${row.store}-${row.name}`} className="border-b last:border-b-0">
                          <td className="px-3 py-2.5 text-center">{row.date}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap text-[11px]">{row.store}</td>
                          <td className="px-3 py-2.5 text-center font-medium">{row.name}</td>
                          <td className="px-3 py-2.5 text-center">{row.inTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.outTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.breakMin}</td>
                          <td className="px-2 py-2.5 text-center">
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleEmergencyApprove(row)}
                            >
                              {t("att_btn_emergency_approve")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                )
              ) : displayList.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {t("adminLeaveNoResult")}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2.5 text-center font-semibold">{t("label_date")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold min-w-[5rem]">{t("stockFilterStore")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("emp_label_name")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_in")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_out")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_break_min")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_actual_hrs")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_planned_hrs")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_diff")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold min-w-[3rem]">{t("att_late_extra")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold min-w-[4.5rem] w-20">{t("att_adjust_label")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_status")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[100px]">{t("att_approve_btn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map((row, i) => {
                      const pendingIn = row.pendingInId ?? null
                      const pendingOut = row.pendingOutId ?? null
                      const hasNewPending = pendingIn != null || pendingOut != null
                      const hasLegacyPending = !hasNewPending && row.pendingId != null
                      const hasPending = hasNewPending || hasLegacyPending
                      const isPending = hasPending
                      const hasPendingOut = pendingOut != null || (hasLegacyPending && row.pendingId != null)
                      return (
                        <tr
                          key={`${row.date}-${row.store}-${row.name}-${i}`}
                          className={cn(
                            "border-b last:border-b-0",
                            row.plannedWorkHrs === 0 && !row.isPartTime && "bg-red-100 dark:bg-red-950/40"
                          )}
                        >
                          <td className="px-3 py-2.5 text-center">{row.date}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap text-[11px]">{row.store}</td>
                          <td className="px-3 py-2.5 text-center font-medium">{row.name}</td>
                          <td className="px-3 py-2.5 text-center">{row.inTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.outTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.breakMin}</td>
                          <td className="px-3 py-2.5 text-center">{row.actualWorkHrs}</td>
                          <td className="px-3 py-2.5 text-center">{row.plannedWorkHrs}</td>
                          <td className="px-3 py-2.5 text-center">
                            {row.plannedWorkHrs === 0 ? "-" : (
                              <span className={row.diffMin < 0 ? "text-amber-600" : undefined}>
                                {row.diffMin === 0 ? "0" : `${row.diffMin > 0 ? "+" : ""}${row.diffMin}`}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            {(() => {
                              const earlyMinDisplay = (row.status === "조퇴" && row.diffMin < 0) ? Math.abs(row.diffMin) : 0
                              const hasAny = row.lateMin > 0 || earlyMinDisplay > 0 || row.otMin > 0
                              return hasAny ? (
                                <>
                                  {row.lateMin > 0 && <span className="font-medium text-red-600">{row.lateMin}</span>}
                                  {row.lateMin > 0 && (earlyMinDisplay > 0 || row.otMin > 0) && " "}
                                  {earlyMinDisplay > 0 && <span className="font-medium text-amber-600">{earlyMinDisplay}</span>}
                                  {earlyMinDisplay > 0 && row.otMin > 0 && " "}
                                  {row.otMin > 0 && <span className="font-medium text-blue-600">{row.otMin}</span>}
                                </>
                              ) : "-"
                            })()}
                          </td>
                          <td className="px-2 py-2.5 text-center min-w-[5rem]">
                            {(() => {
                              const earlyMinDisplay = (row.status === "조퇴" && row.diffMin < 0) ? Math.abs(row.diffMin) : 0
                              const showAdjustInput = row.lateMin > 0 || row.otMin >= 30 || earlyMinDisplay > 0
                              const adjustKey =
                                hasPendingOut && (pendingOut != null || row.pendingId != null)
                                  ? (pendingOut ?? row.pendingId)!
                                  : `${row.date}-${row.store}-${row.name}`
                              const defaultVal = String(
                                row.otMin >= 30 && earlyMinDisplay === 0
                                  ? row.otMin
                                  : row.lateMin > 0 || earlyMinDisplay > 0
                                    ? row.lateMin + earlyMinDisplay
                                    : 0
                              )
                              return showAdjustInput ? (
                                <Input
                                  type="number"
                                  min={0}
                                  max={999}
                                  placeholder="0"
                                  value={otMinutesByRow[adjustKey] ?? defaultVal}
                                  onChange={(e) =>
                                    setOtMinutesByRow((p) => ({ ...p, [adjustKey]: e.target.value }))
                                  }
                                  className="h-7 min-w-[4rem] w-16 text-xs tabular-nums text-center mx-auto"
                                />
                              ) : (
                                <span className="text-muted-foreground text-xs">
                                  {row.otMin > 0 ? "0" : "-"}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {pendingIn != null ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className={cn(
                                    "h-6 px-2 text-[10px] font-medium",
                                    row.status === "퇴근미기록"
                                      ? "text-red-600 border-red-300 hover:bg-red-50"
                                      : "text-amber-600 border-amber-300 hover:bg-amber-50"
                                  )}>
                                    {row.inStatus?.includes("위치미확인") ? "위치미확인" : row.status}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center">
                                  <DropdownMenuItem onClick={() => handleApprove(pendingIn, undefined, row.lateMin > 0 ? true : undefined)}>
                                  {row.lateMin > 0 ? t("att_approve_in_waive_late") : t("att_approve_in")}
                                </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => handleReject(pendingIn)}>{t("att_btn_reject")}</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span
                                className={cn(
                                  "text-[10px] font-medium",
                                  row.status === "정상" && "text-foreground",
                                  row.status === "퇴근미기록" && "text-red-600",
                                  row.status !== "정상" &&
                                    row.status !== "퇴근미기록" &&
                                    (isPending || row.status === "조퇴" || row.status === "지각" || row.status === "지각(승인)" || !row.outTimeStr) &&
                                    "text-amber-600"
                                )}
                              >
                                {!row.outTimeStr
                                  ? "미퇴근"
                                  : statusToKey(row.status)
                                    ? t(statusToKey(row.status)!)
                                    : row.status}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            {hasPendingOut && (row.status !== "정상" || row.otMin >= 30 || row.lateMin > 0 || (row.status === "조퇴" && row.diffMin < 0)) ? (
                              <div className="flex items-center gap-1 justify-center">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => {
                                    const outId = pendingOut ?? row.pendingId!
                                    const earlyMinDisplay = (row.status === "조퇴" && row.diffMin < 0) ? Math.abs(row.diffMin) : 0
                                    const defaultVal =
                                      row.otMin >= 30 && earlyMinDisplay === 0
                                        ? row.otMin
                                        : row.lateMin > 0 || earlyMinDisplay > 0
                                          ? row.lateMin + earlyMinDisplay
                                          : 0
                                    const otVal = otMinutesByRow[outId] ?? String(defaultVal)
                                    const n = parseInt(otVal, 10)
                                    const num = !isNaN(n) && n >= 0 ? n : undefined
                                    if (earlyMinDisplay > 0) {
                                      const earlyPart = row.lateMin > 0 ? Math.max(0, (num ?? 0) - row.lateMin) : (num ?? 0)
                                      handleApprove(outId, undefined, undefined, earlyPart)
                                    } else if (row.otMin >= 30) {
                                      handleApprove(outId, num, undefined)
                                    } else {
                                      handleApprove(outId, undefined, undefined)
                                    }
                                  }}
                                >
                                  {t("att_btn_approve")}
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handleReject(pendingOut ?? row.pendingId!)}>{t("att_btn_reject")}</Button>
                              </div>
                            ) : row.status === "퇴근미기록" || !row.outTimeStr || row.outTimeStr === "-" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] text-amber-600 border-amber-300 hover:bg-amber-50"
                                onClick={() => handleApproveNoClockOut(row)}
                              >
                                {t("att_approve_forced_out")}
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="today" className="mt-0 space-y-3">
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <label className="text-xs font-semibold">{t("stockFilterStore")}</label>
              <Select value={todayStore} onValueChange={setTodayStore}>
                <SelectTrigger className="h-9 w-40 text-xs">
                  <SelectValue placeholder={t("scheduleStorePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {stores.filter((s) => s !== "All").map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="max-w-4xl">
              <RealtimeWork
                storeFilter={todayStore || stores.find((s) => s !== "All") || ""}
                storeList={stores.filter((s) => s !== "All")}
              />
            </div>
          </TabsContent>

          <TabsContent value="view" className="mt-0 space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <WeeklySchedule
                storeFilter={scheduleStore || stores.find((s) => s !== "All") || ""}
                storeList={stores.filter((s) => s !== "All")}
                onStoreChange={setScheduleStore}
              />
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0 space-y-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-4 flex items-center gap-3">
                <label className="text-xs font-semibold">{t("stockFilterStore")}</label>
                <Select value={scheduleStore} onValueChange={setScheduleStore}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.filter((s) => s !== "All").map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AdminScheduleEdit
                stores={stores.filter((s) => s !== "All")}
                storeFilter={scheduleStore}
                onStoreChange={setScheduleStore}
                staffByStore={staffByStore}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
