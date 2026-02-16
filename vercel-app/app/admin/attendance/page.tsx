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
  type AttendanceDailyRow,
} from "@/lib/api-client"
import { RealtimeWork } from "@/components/erp/realtime-work"
import { WeeklySchedule } from "@/components/erp/weekly-schedule"
import { AdminScheduleEdit } from "@/components/admin/admin-schedule-edit"
import { cn } from "@/lib/utils"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function weekAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
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

  const [startDate, setStartDate] = React.useState(weekAgoStr)
  const [endDate, setEndDate] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [employeeFilter, setEmployeeFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [hasSearched, setHasSearched] = React.useState(false)
  const [list, setList] = React.useState<AttendanceDailyRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [todayStore, setTodayStore] = React.useState("")
  const [scheduleStore, setScheduleStore] = React.useState("")
  const [otMinutesByRow, setOtMinutesByRow] = React.useState<Record<number, string>>({})

  const isOffice = React.useMemo(() => {
    const r = (auth?.role || "").toLowerCase()
    return ["director", "officer", "ceo", "hr"].includes(r)
  }, [auth?.role])

  const { stores: storeList, users: usersMap } = useStoreList()
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
    getAttendanceRecordsAdmin({
      startDate,
      endDate,
      storeFilter: storeFilter === "All" ? undefined : storeFilter,
      employeeFilter: employeeFilter === "All" ? undefined : employeeFilter,
      statusFilter,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [startDate, endDate, storeFilter, employeeFilter, statusFilter, auth?.store, auth?.role])

  const handleApprove = async (id: number, optOtMinutes?: number | null, waiveLate?: boolean) => {
    const res = await processAttendanceApproval({
      id,
      decision: "승인완료",
      optOtMinutes: optOtMinutes != null ? optOtMinutes : undefined,
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
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="status">{t("tab_att_status")}</TabsTrigger>
            <TabsTrigger value="today">{t("tab_att_today_realtime")}</TabsTrigger>
            <TabsTrigger value="view">{t("tab_att_view")}</TabsTrigger>
            <TabsTrigger value="schedule">{t("tab_att_schedule")}</TabsTrigger>
          </TabsList>

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
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("noticeFilterAll")}</SelectItem>
                      <SelectItem value="pending">{t("att_pending_only")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-9" onClick={loadRecords} disabled={loading}>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  {loading ? t("loading") : t("stockBtnSearch")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("att_approval_help")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("att_ot_help")}</p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              {!hasSearched ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {t("att_query_please")}
                </div>
              ) : loading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>
              ) : list.length === 0 ? (
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
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_late_extra")}</th>
                      <th className="px-1 py-2.5 text-center font-semibold w-12" title={t("att_ot_help")}>{t("att_ot_label")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_status")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[100px]">{t("att_approve_btn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row, i) => {
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
                            isPending && "bg-amber-50/50 dark:bg-amber-950/20"
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
                          <td className="px-3 py-2.5 text-center">{row.diffMin}</td>
                          <td className="px-3 py-2.5 text-center">
                            {row.lateMin > 0 && <span className="text-amber-600">{t("att_late_label")} {row.lateMin}{t("att_min_unit")} </span>}
                            {row.otMin > 0 && <span className="text-blue-600">{t("att_ot_label")} {row.otMin}{t("att_min_unit")}</span>}
                            {row.lateMin === 0 && row.otMin === 0 && "-"}
                          </td>
                          <td className="px-1 py-2.5 text-center">
                            {hasPendingOut ? (
                              <Input
                                type="number"
                                min={0}
                                max={999}
                                placeholder="0"
                                value={otMinutesByRow[pendingOut ?? row.pendingId!] ?? String(row.otMin ?? 0)}
                                onChange={(e) => setOtMinutesByRow((p) => ({ ...p, [pendingOut ?? row.pendingId!]: e.target.value }))}
                                className="h-7 w-12 text-xs text-center mx-auto"
                              />
                            ) : row.otMin > 0 ? (
                              <span className="text-blue-600 text-[11px]">{row.otMin}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
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
                                  {row.inStatus?.includes("위치미확인") && (
                                    <DropdownMenuItem onClick={() => handleApprove(pendingIn, undefined, false)}>{t("att_approve_location_only")}</DropdownMenuItem>
                                  )}
                                  {(row.lateMin > 0 || !row.inStatus?.includes("위치미확인")) && (
                                    <DropdownMenuItem onClick={() => handleApprove(pendingIn, undefined, row.lateMin > 0 ? true : undefined)}>{t("att_approve_in")}</DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => handleReject(pendingIn)}>{t("att_btn_reject")}</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span
                                className={cn(
                                  "text-[10px] font-medium",
                                  isPending && "text-amber-600",
                                  row.status === "퇴근미기록" && "text-red-600"
                                )}
                              >
                                {statusToKey(row.status) ? t(statusToKey(row.status)!) : row.status}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            {hasPendingOut ? (
                              <div className="flex items-center gap-1 justify-center">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => {
                                    const outId = pendingOut ?? row.pendingId!
                                    const otVal = otMinutesByRow[outId] ?? String(row.otMin ?? 0)
                                    const n = parseInt(otVal, 10)
                                    handleApprove(outId, !isNaN(n) && n >= 0 ? n : undefined)
                                  }}
                                >
                                  {t("att_btn_approve")}
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => handleReject(pendingOut ?? row.pendingId!)}>{t("att_btn_reject")}</Button>
                              </div>
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
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
