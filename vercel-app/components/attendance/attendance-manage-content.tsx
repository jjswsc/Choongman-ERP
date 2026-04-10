"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Clock, Save, Search } from "lucide-react"
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
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsRootScrollableCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
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
import { isAttendanceOutApproved, todayStrBangkok } from "@/lib/attendance-utils"

function todayStr() {
  return todayStrBangkok()
}
function statusToKey(s: string): string | null {
  const st = (s || "").trim()
  if (!st) return null
  if (st.includes("정상") && st.includes("승인")) return "att_status_approved"
  if (st.includes("정상")) return "att_status_normal"
  if (st.includes("반려")) return "att_status_rejected"
  if (st.includes("퇴근미기록") || st.includes("미퇴근")) return "att_status_no_out"
  if (st.includes("지각")) return "att_status_late"
  if (st.includes("조퇴")) return "att_status_early"
  if (st.includes("연장")) return "att_status_overtime"
  if (st.includes("위치미확인") && st.includes("승인대기")) return "att_status_gps_pending"
  if (st.includes("위치미확인")) return "att_status_gps"
  if (st.includes("강제퇴근") && st.includes("승인대기")) return "att_status_forced_out_pending"
  if (st.includes("강제퇴근")) return "att_status_forced_out"
  if (st.includes("휴게초과")) return "att_status_break_over"
  if (st.includes("휴게정상")) return "att_status_break_ok"
  return null
}

function statusLabel(s: string | undefined, t: (key: string) => string): string {
  const raw = String(s || "").trim()
  if (!raw) return "-"
  const key = statusToKey(raw)
  return key ? t(key) : raw
}

type LateApproveCtx = { optionalInLogId?: number | null; optLateMinutes?: number | null }

function readLateAdjustFromForm(
  form: HTMLFormElement | null | undefined,
  inLogKey: number | null
): LateApproveCtx | undefined {
  if (!form || inLogKey == null || inLogKey <= 0) return undefined
  const el = form.elements.namedItem(`adj_late_${inLogKey}`) as HTMLInputElement | null
  const raw = el?.value?.trim()
  if (raw === undefined || raw === "") return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 0 || n > 9999) return undefined
  return { optionalInLogId: inLogKey, optLateMinutes: n }
}

/** 강제 퇴근 시 조퇴(분) 입력 — `forced_early_in_*` / `forced_early_row_*` */
/** 근태 행별 조정 저장 UI 상태 키 (승인 후 파란 표시용) */
function adjustRowKey(row: AttendanceDailyRow, index: number): string {
  return `${row.date}|${row.store}|${row.name}|${row.employeeId ?? 0}|${index}`
}

function readForcedEarlyFromForm(
  form: HTMLFormElement | null | undefined,
  row: AttendanceDailyRow,
  rowIndex: number
): number | undefined {
  if (!form) return undefined
  const forcedKey = row.inLogId != null && row.inLogId > 0 ? `in_${row.inLogId}` : `row_${rowIndex}`
  const el = form.elements.namedItem(`forced_early_${forcedKey}`) as HTMLInputElement | null
  const raw = el?.value?.trim()
  if (raw === undefined || raw === '') return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 0 || n > 9999) return undefined
  return n
}

/** 퇴근 로그 조정: 조퇴(early)·OT 분 — `adj_early_*` / `adj_ot_*` */
function readEarlyOtFromForm(
  form: HTMLFormElement | null | undefined,
  adjustKey: string | number,
  defaults: { early: number; ot: number }
): { early: number; ot: number } {
  const ke = String(adjustKey)
  const eEl = form?.elements.namedItem(`adj_early_${ke}`) as HTMLInputElement | null
  const oEl = form?.elements.namedItem(`adj_ot_${ke}`) as HTMLInputElement | null
  const eRaw = eEl?.value?.trim()
  const oRaw = oEl?.value?.trim()
  const eNum = eRaw !== undefined && eRaw !== "" ? parseInt(eRaw, 10) : NaN
  const oNum = oRaw !== undefined && oRaw !== "" ? parseInt(oRaw, 10) : NaN
  return {
    early: !isNaN(eNum) && eNum >= 0 ? Math.min(9999, eNum) : defaults.early,
    ot: !isNaN(oNum) && oNum >= 0 ? Math.min(9999, oNum) : defaults.ot,
  }
}

function AttAdjustApplyButton({
  saved,
  titleApply,
  titleApplied,
  onClick,
}: {
  saved: boolean
  titleApply: string
  titleApplied: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>
}) {
  return (
    <Button
      type="button"
      size="sm"
      className={cn(
        "h-7 w-7 shrink-0 p-0",
        saved
          ? "border-0 bg-sky-600 text-white shadow-sm hover:bg-sky-700"
          : "border border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
      title={saved ? titleApplied : titleApply}
      onClick={onClick}
    >
      {saved ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} /> : <Save className="h-4 w-4" strokeWidth={2.25} />}
    </Button>
  )
}

/** 근태 기록/승인: 긴 목록은 이 박스 안에서 세로·가로 스크롤 (헤더 행 sticky) */
const attStatusTableScrollCn =
  "max-h-[min(72vh,42rem)] overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch] scroll-smooth"
const attStatusTableCn =
  "w-full min-w-max border-separate border-spacing-0 text-xs " +
  "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[2] [&_thead_th]:bg-muted/95 [&_thead_th]:backdrop-blur-sm [&_thead_th]:shadow-[0_1px_0_0_hsl(var(--border))] " +
  /* border-separate에서는 tr 밑줄이 안 보이는 경우가 많아 셀 기준 구분선 */
  "[&_tbody_td]:border-b [&_tbody_td]:border-border/70"

/** 관리자 `/admin/attendance`와 POS `/pos/attendance`에서 공통 사용 — 동일 API·세션 연동 */
export function AttendanceManageContent({ readOnly = false }: { readOnly?: boolean }) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const allowEdit = !readOnly
  const searchParams = useSearchParams()
  const focusDateParam = String(searchParams.get("focusDate") || "").trim()
  const focusStoreParam = String(searchParams.get("store") || "").trim()
  const focusEmployeeParam = String(searchParams.get("employee") || "").trim()

  const [attTab, setAttTab] = React.useState("status")

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
  const [, setOtMinutesByRow] = React.useState<Record<number | string, string>>({})
  /** 조정값 반영 완료한 행 — 숫자 변경 시 해제 → 회색(다시 반영) */
  const [adjustSavedKeys, setAdjustSavedKeys] = React.useState<Set<string>>(() => new Set())

  const isOffice = React.useMemo(() => {
    const r = (auth?.role || "").toLowerCase()
    return ["director", "officer", "ceo", "hr"].includes(r)
  }, [auth?.role])

  const { stores: storeList, users: usersMap, staffByStore } = useStoreList()
  React.useEffect(() => {
    const st = (storeList || []).filter((s) => s && String(s).trim())
    setStores(isOffice ? ["All", ...st.filter((s) => s !== "All")] : ["All", auth?.store || ""].filter(Boolean))
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

  const employeeOptionsForSelect = React.useMemo(() => {
    const opts = [...employeeOptions]
    const want = employeeFilter
    if (want && want !== "All" && !opts.includes(want)) opts.push(want)
    return opts
  }, [employeeOptions, employeeFilter])

  React.useEffect(() => {
    const p = searchParams.get("tab")
    if (p === "help" || p === "today" || p === "view") {
      setAttTab(p)
      return
    }
    if (p === "schedule" && allowEdit) {
      setAttTab("schedule")
      return
    }
    if (p === "status") setAttTab("status")
  }, [searchParams, allowEdit])

  /** 급여 수정 등 ?month=yyyy-MM&store&employee&tab=status */
  React.useEffect(() => {
    const month = searchParams.get("month")
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return

    const [y, mo] = month.split("-").map(Number)
    const start = `${month}-01`
    const lastD = new Date(y, mo, 0)
    const mm = String(mo).padStart(2, "0")
    const end = `${y}-${mm}-${String(lastD.getDate()).padStart(2, "0")}`

    const storeRaw = searchParams.get("store")
    const decStore = storeRaw ? decodeURIComponent(storeRaw).trim() : ""
    const empRaw = searchParams.get("employee")
    const decEmp = empRaw ? decodeURIComponent(empRaw).trim() : ""

    setStartDate(start)
    setEndDate(end)

    const effStore =
      !isOffice && auth?.store
        ? auth.store
        : decStore && decStore !== "All"
          ? decStore
          : undefined

    if (!isOffice && auth?.store) {
      setStoreFilter(auth.store)
    } else if (decStore) {
      setStoreFilter(decStore)
    }

    if (decEmp) setEmployeeFilter(decEmp)

    setHasSearched(true)
    setLoading(true)
    getAttendanceRecordsAdmin({
      startDate: start,
      endDate: end,
      storeFilter: effStore,
      employeeFilter: decEmp || undefined,
      statusFilter: "all",
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 쿼리 문자열 변경 시에만 자동 조회
  }, [auth?.store, auth?.role, isOffice, searchParams.toString()])

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

  React.useEffect(() => {
    setAdjustSavedKeys(new Set())
  }, [startDate, endDate, storeFilter, employeeFilter, statusFilter])

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

  const isFocusedRow = React.useCallback((row: AttendanceDailyRow) => {
    if (!focusDateParam || row.date !== focusDateParam) return false
    if (focusStoreParam && focusStoreParam !== "All" && row.store !== focusStoreParam) return false
    if (focusEmployeeParam && focusEmployeeParam !== "All" && row.name !== focusEmployeeParam) return false
    return true
  }, [focusDateParam, focusStoreParam, focusEmployeeParam])

  const getFocusRowId = React.useCallback(
    (row: AttendanceDailyRow) =>
      `att-focus-${encodeURIComponent(row.date)}-${encodeURIComponent(row.store)}-${encodeURIComponent(row.name)}`,
    []
  )

  React.useEffect(() => {
    if (!focusDateParam || displayList.length === 0) return
    const target = displayList.find((row) => isFocusedRow(row))
    if (!target) return
    const id = getFocusRowId(target)
    const el = document.getElementById(id)
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" })
    })
  }, [displayList, focusDateParam, getFocusRowId, isFocusedRow])

  const handleEmergencyApprove = async (row: AttendanceNoRecordRow) => {
    const res = await createAttendanceFromSchedule({
      date: row.date,
      store: row.store,
      name: row.name,
      ...(row.employeeId != null && row.employeeId > 0 ? { employeeId: row.employeeId } : {}),
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) {
      loadRecords()
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("att_process_failed"))
    }
  }

  const handleApprove = async (
    id: number,
    optOtMinutes?: number | null,
    waiveLate?: boolean,
    optEarlyMinutes?: number | null,
    skipReload?: boolean,
    lateCtx?: LateApproveCtx
  ): Promise<boolean> => {
    const res = await processAttendanceApproval({
      id,
      decision: "승인완료",
      optOtMinutes: optOtMinutes != null ? optOtMinutes : undefined,
      optEarlyMinutes: optEarlyMinutes != null ? optEarlyMinutes : undefined,
      waiveLate,
      ...(lateCtx?.optLateMinutes != null && !Number.isNaN(Number(lateCtx.optLateMinutes))
        ? { optLateMinutes: Number(lateCtx.optLateMinutes) }
        : {}),
      ...(lateCtx?.optionalInLogId != null && lateCtx.optionalInLogId > 0
        ? { optionalInLogId: lateCtx.optionalInLogId }
        : {}),
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) {
      setOtMinutesByRow((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      if (!skipReload) loadRecords()
      return true
    }
    await appAlert(translateApiMessage(res.message, t) || t("att_process_failed"))
    return false
  }

  const handleReject = async (id: number) => {
    const res = await processAttendanceApproval({
      id,
      decision: "반려",
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) loadRecords()
    else await appAlert(translateApiMessage(res.message, t) || t("att_process_failed"))
  }

  const handleApproveNoClockOut = async (
    row: AttendanceDailyRow,
    rowIndex: number,
    form?: HTMLFormElement | null
  ): Promise<boolean> => {
    const optEarly = readForcedEarlyFromForm(form ?? null, row, rowIndex)
    const res = await approveNoClockOut({
      date: row.date,
      store: row.store,
      name: row.name,
      ...(row.employeeId != null && row.employeeId > 0 ? { employeeId: row.employeeId } : {}),
      ...(optEarly != null ? { optEarlyMinutes: optEarly } : {}),
      userStore: auth?.store,
      userRole: auth?.role,
    })
    if (res.success) {
      loadRecords()
      return true
    }
    await appAlert(translateApiMessage(res.message, t) || t("att_process_failed"))
    return false
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminAttendance")}</h1>
            <p className="text-xs text-muted-foreground">{t("tab_att_status")}</p>
            {readOnly && (
              <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5">
                {t("posAttendanceReadOnlyHint")}
              </p>
            )}
          </div>
        </div>

        <Tabs value={attTab} onValueChange={setAttTab} className={adminTabsRootScrollableCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="status" className={adminTabsTriggerCn}>
                  {t("tab_att_status")}
                </TabsTrigger>
                <TabsTrigger value="help" className={adminTabsTriggerCn}>
                  {t("att_tab_help")}
                </TabsTrigger>
                <TabsTrigger value="today" className={adminTabsTriggerCn}>
                  {t("tab_att_today_realtime")}
                </TabsTrigger>
                <TabsTrigger value="view" className={adminTabsTriggerCn}>
                  {t("tab_att_view")}
                </TabsTrigger>
                {!readOnly && (
                  <TabsTrigger value="schedule" className={adminTabsTriggerCn}>
                    {t("tab_att_schedule")}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          <TabsContent value="help" className={cn(adminTabsContentFlushCn, "space-y-4")}>
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h2 className="text-base font-semibold">{t("att_help_title")}</h2>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_approve_in")} / {t("att_approve_out")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_approval_in")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("att_help_approval_out")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">
                  {t("att_adjust_late")} / {t("att_adjust_early")} / {t("att_adjust_ot")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("att_help_adjust_split")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_ot_label")} (O.T)</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_ot")}</p>
              </section>
              <section>
                <h3 className="text-sm font-medium mb-1">{t("att_col_diff")}</h3>
                <p className="text-xs text-muted-foreground">{t("att_help_diff")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("att_help_diff_types")}</p>
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

          <TabsContent value="status" className={cn(adminTabsContentFlushCn, "space-y-4")}>
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
                  <Select
                    value={stores.includes(storeFilter) ? storeFilter : (stores[0] || "All")}
                    onValueChange={(v) => setStoreFilter(v)}
                  >
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue placeholder={t("all")} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {stores.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("label_employee")}</label>
                  <Select value={employeeOptionsForSelect.includes(employeeFilter) ? employeeFilter : "All"} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {employeeOptionsForSelect.map((e) => (
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

            <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                <div className={attStatusTableScrollCn}>
                <table className={attStatusTableCn}>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2.5 text-center font-semibold">{t("label_date")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold">{t("stockFilterStore")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("emp_label_name")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold">{t("emp_label_employee_code")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_in")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_out")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_break_min")}</th>
                      {allowEdit && (
                        <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[60px]">
                          {t("att_btn_emergency_approve")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {noRecordList
                      .filter((row) => employeeFilter === "All" || row.name === employeeFilter)
                      .map((row) => (
                        <tr key={`${row.date}-${row.store}-${row.name}`}>
                          <td className="px-3 py-2.5 text-center">{row.date}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap text-[11px]">{row.store}</td>
                          <td className="px-3 py-2.5 text-center font-medium">{row.name}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap tabular-nums">{row.employeeCode || '-'}</td>
                          <td className="px-3 py-2.5 text-center">{row.inTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.outTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.breakMin}</td>
                          {allowEdit && (
                            <td className="px-2 py-2.5 text-center">
                              <Button
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => handleEmergencyApprove(row)}
                              >
                                {t("att_btn_emergency_approve")}
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                </div>
                )
              ) : displayList.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {t("adminLeaveNoResult")}
                </div>
              ) : (
                <div className={attStatusTableScrollCn}>
                <form
                  id="att-adjust-form"
                  onSubmit={(e) => e.preventDefault()}
                  onInput={(e) => {
                    const el = e.target as HTMLElement
                    if (el.tagName !== "INPUT") return
                    const inp = el as HTMLInputElement
                    const n = inp.name || ""
                    if (!n.startsWith("adj_") && !n.startsWith("forced_early_")) return
                    const tr = inp.closest("tr[data-att-adjust-row]")
                    const rk = tr?.getAttribute("data-att-adjust-row")
                    if (!rk) return
                    setAdjustSavedKeys((prev) => {
                      if (!prev.has(rk)) return prev
                      const next = new Set(prev)
                      next.delete(rk)
                      return next
                    })
                  }}
                  className="contents"
                >
                <table className={attStatusTableCn}>
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2.5 text-center font-semibold">{t("label_date")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold min-w-[5rem]">{t("stockFilterStore")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("emp_label_name")}</th>
                      <th className="px-2 py-2.5 text-center font-semibold">{t("emp_label_employee_code")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_in")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_out")}</th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_break_min")} <span className="text-[10px] text-muted-foreground">(M)</span></th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_actual_hrs")} <span className="text-[10px] text-muted-foreground">(H)</span></th>
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_planned_hrs")} <span className="text-[10px] text-muted-foreground">(H)</span></th>
                      {allowEdit && (
                        <>
                          <th className="px-2 py-2.5 text-center font-semibold min-w-[4rem] w-16">
                            {t("att_adjust_late")} <span className="text-[10px] text-muted-foreground">(M)</span>
                          </th>
                          <th className="px-2 py-2.5 text-center font-semibold min-w-[4rem] w-16">
                            {t("att_adjust_early")} <span className="text-[10px] text-muted-foreground">(M)</span>
                          </th>
                          <th className="px-2 py-2.5 text-center font-semibold min-w-[4rem] w-16">
                            {t("att_adjust_ot")} <span className="text-[10px] text-muted-foreground">(M)</span>
                          </th>
                        </>
                      )}
                      <th className="px-3 py-2.5 text-center font-semibold">{t("att_col_status")}</th>
                      {allowEdit && (
                        <th
                          className="px-2 py-2.5 text-center font-semibold whitespace-nowrap min-w-[48px]"
                          title={t("att_adjust_col_hint")}
                        >
                          <Save className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
                          <span className="sr-only">{t("att_adjust_col_hint")}</span>
                        </th>
                      )}
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
                      const isOvertimeRow = row.diffMin > 0 && (row.otMin ?? 0) >= 30
                      const defaultEarly =
                        row.plannedWorkHrs > 0 && row.diffMin < 0
                          ? (row.earlyMin ?? Math.abs(row.diffMin))
                          : 0
                      const defaultOt =
                        row.plannedWorkHrs > 0 && row.diffMin > 0
                          ? isOvertimeRow
                            ? (row.otMin ?? row.diffMin)
                            : row.diffMin >= 30
                              ? (row.otMin ?? row.diffMin)
                              : 0
                          : 0
                      const lateBefore = Math.max(0, Math.round(row.lateBeforeMin ?? row.lateMin ?? 0))
                      const lateAfter = Math.max(0, Math.round(row.lateAfterMin ?? row.lateMin ?? 0))
                      const earlyBefore = Math.max(0, Math.round(row.earlyBeforeMin ?? defaultEarly))
                      const earlyAfter = Math.max(0, Math.round(row.earlyAfterMin ?? defaultEarly))
                      const otBefore = Math.max(0, Math.round(row.otBeforeMin ?? defaultOt))
                      const otAfter = Math.max(0, Math.round(row.otAfterMin ?? defaultOt))
                      /** 퇴근 로그 없음: 조퇴/OT 입력은 퇴근 승인용이라 표시하면 저장 버튼과 안 맞음 */
                      const isMissingClockOut =
                        row.status === "퇴근미기록" ||
                        !row.outTimeStr ||
                        row.outTimeStr === "-"
                      const rk = adjustRowKey(row, i)
                      const applySaved = adjustSavedKeys.has(rk)
                      return (
                        <tr
                          key={`${row.date}-${row.store}-${row.name}-${i}`}
                          id={getFocusRowId(row)}
                          data-att-adjust-row={rk}
                          className={cn(
                            row.plannedWorkHrs === 0 && !row.isPartTime && "bg-red-100 dark:bg-red-950/40",
                            isFocusedRow(row) && "ring-2 ring-amber-400/80 ring-inset bg-amber-50/70 dark:bg-amber-950/20"
                          )}
                        >
                          <td className="px-3 py-2.5 text-center">{row.date}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap text-[11px]">{row.store}</td>
                          <td className="px-3 py-2.5 text-center font-medium">{row.name}</td>
                          <td className="px-2 py-2.5 text-center whitespace-nowrap tabular-nums">{row.employeeCode || '-'}</td>
                          <td className="px-3 py-2.5 text-center">{row.inTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.outTimeStr}</td>
                          <td className="px-3 py-2.5 text-center">{row.breakMin}</td>
                          <td className="px-3 py-2.5 text-center">{row.actualWorkHrs}</td>
                          <td className="px-3 py-2.5 text-center">{row.plannedWorkHrs}</td>
                          {allowEdit ? (
                            <>
                              <td className="px-2 py-2.5 text-center min-w-[4rem]">
                                {(() => {
                                  const isNormal =
                                    row.status === "정상" ||
                                    (row.status && String(row.status).includes("정상(승인)"))
                                  const statusStr = String(row.status || "")
                                  const showAdjustInput =
                                    ((!isNormal &&
                                      ((row.plannedWorkHrs > 0 && row.diffMin !== 0) ||
                                        row.lateMin > 0 ||
                                        (row.status && String(row.status).includes("강제퇴근(승인)")))) ||
                                      (row.status && String(row.status).includes("정상(승인)")) ||
                                      (row.plannedWorkHrs > 0 && statusStr.includes("조퇴"))) &&
                                    !isMissingClockOut
                                  const inLogKey = row.inLogId ?? pendingIn ?? null
                                  const showLateInput =
                                    showAdjustInput &&
                                    row.plannedWorkHrs > 0 &&
                                    inLogKey != null &&
                                    (row.lateMin > 0 || pendingIn != null)
                                  const lateDefault = String(lateAfter)
                                  return showLateInput ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                                      <span className="text-xs font-medium text-muted-foreground tabular-nums">{lateBefore}→</span>
                                      <Input
                                        key={`late-${inLogKey}`}
                                        name={`adj_late_${inLogKey}`}
                                        type="number"
                                        min={0}
                                        max={999}
                                        placeholder="0"
                                        defaultValue={lateDefault}
                                        className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-red-600 tabular-nums text-center mx-auto"
                                      />
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                                      <span className="text-muted-foreground">{lateBefore}</span>
                                      <span className="text-xs text-muted-foreground">→</span>
                                      <span className="text-red-600">{lateAfter}</span>
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="px-2 py-2.5 text-center min-w-[4rem]">
                                {(() => {
                                  if (isMissingClockOut && allowEdit) {
                                    const forcedKey =
                                      row.inLogId != null && row.inLogId > 0 ? `in_${row.inLogId}` : `row_${i}`
                                    const defEarly = Math.max(0, Math.round(earlyAfter))
                                    return (
                                      <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                                        <span className="text-[10px] text-muted-foreground text-center leading-tight px-0.5">
                                          {t("att_adjust_early")}
                                        </span>
                                        <Input
                                          name={`forced_early_${forcedKey}`}
                                          type="number"
                                          min={0}
                                          max={999}
                                          placeholder="0"
                                          defaultValue={String(defEarly)}
                                          className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-amber-600 tabular-nums text-center mx-auto"
                                        />
                                      </div>
                                    )
                                  }
                                  const isNormal =
                                    row.status === "정상" ||
                                    (row.status && String(row.status).includes("정상(승인)"))
                                  const statusStr = String(row.status || "")
                                  const showAdjustInput =
                                    ((!isNormal &&
                                      ((row.plannedWorkHrs > 0 && row.diffMin !== 0) ||
                                        row.lateMin > 0 ||
                                        (row.status && String(row.status).includes("강제퇴근(승인)")))) ||
                                      (row.status && String(row.status).includes("정상(승인)")) ||
                                      (row.plannedWorkHrs > 0 && statusStr.includes("조퇴"))) &&
                                    !isMissingClockOut
                                  const adjustKey =
                                    hasPendingOut && (pendingOut != null || row.pendingId != null)
                                      ? (pendingOut ?? row.pendingId)!
                                      : row.outLogId != null
                                        ? row.outLogId
                                        : `${row.date}-${row.store}-${row.name}`
                                  const isPureLate =
                                    row.lateMin > 0 &&
                                    row.diffMin === 0 &&
                                    (row.earlyMin ?? 0) === 0 &&
                                    (row.otMin ?? 0) < 30
                                  const showOutPair = showAdjustInput && !isPureLate
                                  return showOutPair ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                                      <span className="text-xs font-medium text-muted-foreground tabular-nums">{earlyBefore}→</span>
                                      <Input
                                        key={`early-${adjustKey}`}
                                        name={`adj_early_${adjustKey}`}
                                        type="number"
                                        min={0}
                                        max={999}
                                        placeholder="0"
                                        defaultValue={String(earlyAfter)}
                                        className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-amber-600 tabular-nums text-center mx-auto"
                                      />
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                                      <span className="text-muted-foreground">{earlyBefore}</span>
                                      <span className="text-xs text-muted-foreground">→</span>
                                      <span className="text-amber-600">{earlyAfter}</span>
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="px-2 py-2.5 text-center min-w-[4rem]">
                                {(() => {
                                  const isNormal =
                                    row.status === "정상" ||
                                    (row.status && String(row.status).includes("정상(승인)"))
                                  const statusStr = String(row.status || "")
                                  const showAdjustInput =
                                    ((!isNormal &&
                                      ((row.plannedWorkHrs > 0 && row.diffMin !== 0) ||
                                        row.lateMin > 0 ||
                                        (row.status && String(row.status).includes("강제퇴근(승인)")))) ||
                                      (row.status && String(row.status).includes("정상(승인)")) ||
                                      (row.plannedWorkHrs > 0 && statusStr.includes("조퇴"))) &&
                                    !isMissingClockOut
                                  const adjustKey =
                                    hasPendingOut && (pendingOut != null || row.pendingId != null)
                                      ? (pendingOut ?? row.pendingId)!
                                      : row.outLogId != null
                                        ? row.outLogId
                                        : `${row.date}-${row.store}-${row.name}`
                                  const isPureLate =
                                    row.lateMin > 0 &&
                                    row.diffMin === 0 &&
                                    (row.earlyMin ?? 0) === 0 &&
                                    (row.otMin ?? 0) < 30
                                  const showOutPair = showAdjustInput && !isPureLate
                                  return showOutPair ? (
                                    <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                                      <span className="text-xs font-medium text-muted-foreground tabular-nums">{otBefore}→</span>
                                      <Input
                                        key={`ot-${adjustKey}`}
                                        name={`adj_ot_${adjustKey}`}
                                        type="number"
                                        min={0}
                                        max={999}
                                        placeholder="0"
                                        defaultValue={String(otAfter)}
                                        data-adjust-key={String(adjustKey)}
                                        className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-blue-600 tabular-nums text-center mx-auto"
                                      />
                                    </div>
                                  ) : row.status === "퇴근미기록" || !row.outTimeStr || row.outTimeStr === "-" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                                      title={t("att_force_out_hint")}
                                      onClick={(e) =>
                                        handleApproveNoClockOut(
                                          row,
                                          i,
                                          (e.currentTarget as HTMLButtonElement).closest("form")
                                        )
                                      }
                                    >
                                      {t("att_approve_forced_out")}
                                    </Button>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                                      <span className="text-muted-foreground">{otBefore}</span>
                                      <span className="text-xs text-muted-foreground">→</span>
                                      <span className="text-blue-600">{otAfter}</span>
                                    </span>
                                  )
                                })()}
                              </td>
                            </>
                          ) : null}
                          <td className="px-3 py-2.5 text-center">
                            {pendingIn != null && allowEdit ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className={cn(
                                    "h-6 px-2 text-[10px] font-medium text-muted-foreground border-border hover:bg-muted"
                                  )}>
                                    {t("att_btn_process")}
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
                                {!row.outTimeStr ? t("att_status_no_out") : statusLabel(row.status, t)}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            {!allowEdit ? (
                              <span className="flex justify-center text-[10px] text-muted-foreground"></span>
                            ) : isMissingClockOut ? (
                              <div className="flex items-center gap-1 justify-center">
                                <AttAdjustApplyButton
                                  saved={applySaved}
                                  titleApply={t("att_save_apply_hint")}
                                  titleApplied={t("att_adjust_applied_hint")}
                                  onClick={async (e) => {
                                    const ok = await handleApproveNoClockOut(
                                      row,
                                      i,
                                      (e.currentTarget as HTMLButtonElement).closest("form")
                                    )
                                    if (ok) setAdjustSavedKeys((p) => new Set(p).add(rk))
                                  }}
                                />
                              </div>
                            ) : hasPendingOut && (row.status !== "정상" || row.otMin >= 30 || row.lateMin > 0 || row.diffMin < 0) ? (
                              <div className="flex items-center gap-1 justify-center">
                                <AttAdjustApplyButton
                                  saved={applySaved}
                                  titleApply={t("att_save_apply_hint")}
                                  titleApplied={t("att_adjust_applied_hint")}
                                  onClick={async (e) => {
                                    e.preventDefault()
                                    const outId = pendingOut ?? row.pendingId!
                                    const adjustKey = hasPendingOut && (pendingOut != null || row.pendingId != null)
                                      ? (pendingOut ?? row.pendingId)!
                                      : `${row.date}-${row.store}-${row.name}`
                                    const keyForInput = String(pendingOut ?? row.pendingId ?? row.outLogId ?? adjustKey)
                                    const form = (e.currentTarget as HTMLButtonElement).form
                                    const { early, ot } = readEarlyOtFromForm(form, keyForInput, {
                                      early: defaultEarly,
                                      ot: defaultOt,
                                    })
                                    const inKey = row.inLogId ?? pendingIn
                                    const lateCtx = readLateAdjustFromForm(form, inKey)
                                    if ((ot ?? 0) === 0 && row.lateMin > 0 && pendingIn != null && (row.diffMin > 0 || row.otMin >= 30)) {
                                      const okIn = await handleApprove(pendingIn, undefined, true, undefined, true)
                                      if (!okIn) return
                                    }
                                    const ok = await handleApprove(outId, ot, undefined, early, false, lateCtx)
                                    if (ok) setAdjustSavedKeys((p) => new Set(p).add(rk))
                                  }}
                                />
                              </div>
                            ) : !hasPendingOut &&
                              row.outLogId != null &&
                              !isAttendanceOutApproved(row.approval) &&
                              row.outTimeStr &&
                              row.outTimeStr !== "-" &&
                              (row.diffMin < 0 ||
                                row.lateMin > 0 ||
                                (row.diffMin > 0 && (row.otMin ?? 0) >= 30) ||
                                String(row.status || "").includes("조퇴")) ? (
                              <div className="flex items-center gap-1 justify-center">
                                <AttAdjustApplyButton
                                  saved={applySaved}
                                  titleApply={t("att_save_apply_hint")}
                                  titleApplied={t("att_adjust_applied_hint")}
                                  onClick={async (e) => {
                                    e.preventDefault()
                                    const outId = row.outLogId!
                                    const keyForInput = String(outId)
                                    const form = (e.currentTarget as HTMLButtonElement).form
                                    const { early, ot } = readEarlyOtFromForm(form, keyForInput, {
                                      early: defaultEarly,
                                      ot: defaultOt,
                                    })
                                    const inKey = row.inLogId ?? pendingIn
                                    const lateCtx = readLateAdjustFromForm(form, inKey)
                                    if ((ot ?? 0) === 0 && row.lateMin > 0 && pendingIn != null && (row.diffMin > 0 || row.otMin >= 30)) {
                                      const okIn = await handleApprove(pendingIn, undefined, true, undefined, true)
                                      if (!okIn) return
                                    }
                                    const ok = await handleApprove(outId, ot, undefined, early, false, lateCtx)
                                    if (ok) setAdjustSavedKeys((p) => new Set(p).add(rk))
                                  }}
                                />
                              </div>
                            ) : !hasPendingOut &&
                              row.outLogId != null &&
                              isAttendanceOutApproved(row.approval) &&
                              (row.diffMin < 0 ||
                                (row.earlyMin ?? 0) > 0 ||
                                (row.diffMin > 0 && (row.otMin ?? 0) >= 30) ||
                                row.lateMin > 0 ||
                                (row.status && String(row.status).includes("강제퇴근(승인)")) ||
                                (row.status && String(row.status).includes("정상(승인)")) ||
                                String(row.status || "").includes("조퇴")) ? (
                              <AttAdjustApplyButton
                                saved={applySaved}
                                titleApply={t("att_save_apply_hint")}
                                titleApplied={t("att_adjust_applied_hint")}
                                onClick={async (e) => {
                                  e.preventDefault()
                                  const outId = row.outLogId!
                                  const form = (e.currentTarget as HTMLButtonElement).form
                                  const { early, ot } = readEarlyOtFromForm(form, outId, {
                                    early: defaultEarly,
                                    ot: defaultOt,
                                  })
                                  const inKey = row.inLogId ?? pendingIn
                                  const lateCtx = readLateAdjustFromForm(form, inKey)
                                  const isLateOnly =
                                    row.lateMin > 0 &&
                                    row.diffMin === 0 &&
                                    (row.earlyMin ?? 0) === 0 &&
                                    (row.otMin ?? 0) < 30
                                  let ok = false
                                  if (isLateOnly && inKey) {
                                    const onlyLate = readLateAdjustFromForm(form, inKey)
                                    if (onlyLate?.optLateMinutes != null) {
                                      ok = await handleApprove(inKey, undefined, undefined, undefined, false, {
                                        optLateMinutes: onlyLate.optLateMinutes,
                                      })
                                    } else {
                                      ok = await handleApprove(outId, ot, undefined, early, false, lateCtx)
                                    }
                                  } else {
                                    ok = await handleApprove(outId, ot, undefined, early, false, lateCtx)
                                  }
                                  if (ok) setAdjustSavedKeys((p) => new Set(p).add(rk))
                                }}
                              />
                            ) : (
                              <span className="text-[10px] text-muted-foreground"></span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </form>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="today" className={cn(adminTabsContentFlushCn, "space-y-3")}>
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

          <TabsContent value="view" className={cn(adminTabsContentFlushCn, "space-y-3")}>
            <div className="rounded-lg border bg-card p-4">
              <WeeklySchedule
                storeFilter={scheduleStore || stores.find((s) => s !== "All") || ""}
                storeList={stores.filter((s) => s !== "All")}
                onStoreChange={setScheduleStore}
              />
            </div>
          </TabsContent>

          {!readOnly && (
            <TabsContent value="schedule" className={cn(adminTabsContentFlushCn, "space-y-3")}>
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-4 flex items-center gap-3">
                  <label className="text-xs font-semibold">{t("stockFilterStore")}</label>
                  <Select value={scheduleStore} onValueChange={setScheduleStore}>
                    <SelectTrigger className="h-9 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.filter((s) => s !== "All").map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
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
          )}
        </Tabs>
      </div>
    </div>
  )
}
