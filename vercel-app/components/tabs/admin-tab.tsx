"use client"
import { appAlert } from "@/lib/app-message"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle2, Save, UserCog, Search, Palmtree } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage as translateApiMsg } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
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
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NoticeCompose } from "@/components/erp/notice-compose"
import { NoticeHistory } from "@/components/erp/notice-history"
import { displayLabelShort } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { isAttendanceOutApproved } from "@/lib/attendance-utils"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
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
  if (st.includes("강제퇴근") && st.includes("승인대기")) return "att_status_forced_out_pending"
  return null
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

function readForcedEarlyFromForm(
  form: HTMLFormElement | null | undefined,
  row: AttendanceDailyRow,
  rowIndex: number
): number | undefined {
  if (!form) return undefined
  const forcedKey = row.inLogId != null && row.inLogId > 0 ? `in_${row.inLogId}` : `row_${rowIndex}`
  const el = form.elements.namedItem(`forced_early_${forcedKey}`) as HTMLInputElement | null
  const raw = el?.value?.trim()
  if (raw === undefined || raw === "") return undefined
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 0 || n > 9999) return undefined
  return n
}

function adjustRowKey(row: AttendanceDailyRow, index: number): string {
  return `${row.date}|${row.store}|${row.name}|${row.employeeId ?? 0}|${index}`
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

export function AdminTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  // 근태 승인: 관리자 기준 단일 목록 (기록 + 미기록 통합)
  const [attStart, setAttStart] = useState(todayStr)
  const [attEnd, setAttEnd] = useState(todayStr)
  const [attStoreFilter, setAttStoreFilter] = useState("All")
  const [attStores, setAttStores] = useState<string[]>(["All"])
  const [attStatusFilter, setAttStatusFilter] = useState("all")
  const [recordList, setRecordList] = useState<AttendanceDailyRow[]>([])
  const [noRecordList, setNoRecordList] = useState<AttendanceNoRecordRow[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [attHasSearched, setAttHasSearched] = useState(false)
  const [, setOtMinutesByRow] = useState<Record<number | string, string>>({})
  const [adjustSavedKeys, setAdjustSavedKeys] = useState<Set<string>>(() => new Set())

  const { stores: storeList } = useStoreList()
  const isOffice = auth?.role && ["director", "officer", "ceo", "hr"].some((r) => String(auth?.role || "").toLowerCase().includes(r))

  useEffect(() => {
    if (!auth) return
    const list = (storeList || []).filter((s) => s && String(s).trim())
    if (isOffice) {
      setAttStores(["All", ...list.filter((s) => s !== "All")])
    } else if (auth.store) {
      setAttStores(["All", auth.store])
    }
  }, [auth, isOffice, storeList])

  const translateApiMessage = (msg: string | undefined) => translateApiMsg(msg, t)

  const loadAttendance = useCallback(() => {
    if (!auth || (attStores.length === 0 && !isOffice)) return
    setAttLoading(true)
    setAttHasSearched(true)
    const storeParam = attStoreFilter === "All" ? undefined : attStoreFilter
    const userStore = auth.store || ""
    const userRole = auth.role || ""
    Promise.all([
      getAttendanceRecordsAdmin({
        startDate: attStart,
        endDate: attEnd,
        storeFilter: storeParam,
        userStore,
        userRole,
      }),
      getAttendanceNoRecordList({
        startStr: attStart,
        endStr: attEnd,
        store: storeParam,
        userStore,
        userRole,
      }),
    ])
      .then(([records, noRecord]) => {
        setRecordList(records || [])
        setNoRecordList(noRecord || [])
      })
      .catch(() => {
        setRecordList([])
        setNoRecordList([])
      })
      .finally(() => setAttLoading(false))
  }, [auth, attStores.length, isOffice, attStart, attEnd, attStoreFilter])

  useEffect(() => {
    setAdjustSavedKeys(new Set())
  }, [attStart, attEnd, attStoreFilter, attStatusFilter])

  const uniqueStatuses = [...new Set(recordList.map((r) => r.status).filter(Boolean))].sort() as string[]
  const displayRecordList =
    attStatusFilter === "all"
      ? recordList
      : attStatusFilter === "noRecord"
        ? []
        : attStatusFilter === "exceptNormal"
          ? recordList.filter((r) => r.status !== "정상")
          : recordList.filter((r) => r.status === attStatusFilter)

  const handleApprove = async (
    id: number,
    optOtMinutes?: number | null,
    waiveLate?: boolean,
    optEarlyMinutes?: number | null,
    skipReload?: boolean,
    lateCtx?: LateApproveCtx
  ): Promise<boolean> => {
    if (!auth) return false
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
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) {
      setOtMinutesByRow((p) => { const next = { ...p }; delete next[id]; return next })
      if (!skipReload) loadAttendance()
      return true
    }
    await appAlert(translateApiMessage(res.message) || t("processFail"))
    return false
  }

  const handleReject = async (id: number) => {
    if (!auth) return
    const res = await processAttendanceApproval({
      id,
      decision: "반려",
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) loadAttendance()
    else await appAlert(translateApiMessage(res.message) || t("processFail"))
  }

  const handleApproveNoClockOut = async (
    row: AttendanceDailyRow,
    rowIndex: number,
    form?: HTMLFormElement | null
  ): Promise<boolean> => {
    if (!auth) return false
    const optEarly = readForcedEarlyFromForm(form ?? null, row, rowIndex)
    const res = await approveNoClockOut({
      date: row.date,
      store: row.store,
      name: row.name,
      ...(row.employeeId != null && row.employeeId > 0 ? { employeeId: row.employeeId } : {}),
      ...(optEarly != null ? { optEarlyMinutes: optEarly } : {}),
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) {
      loadAttendance()
      return true
    }
    await appAlert(translateApiMessage(res.message) || t("processFail"))
    return false
  }

  const handleEmergencyApprove = async (row: AttendanceNoRecordRow) => {
    if (!auth) return
    const res = await createAttendanceFromSchedule({
      date: row.date,
      store: row.store,
      name: row.name,
      ...(row.employeeId != null && row.employeeId > 0 ? { employeeId: row.employeeId } : {}),
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) loadAttendance()
    else await appAlert(translateApiMessage(res.message) || t("processFail"))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 공지사항 (탭: 새 공지 보내기 | 발송 내역) */}
      <Tabs defaultValue="compose" className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="compose" className={adminTabsTriggerCn}>
                {t("noticeNewTitle")}
              </TabsTrigger>
              <TabsTrigger value="history" className={adminTabsTriggerCn}>
                {t("noticeHistoryTitle")}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="compose" className={adminTabsContentCn}>
          <NoticeCompose />
        </TabsContent>
        <TabsContent value="history" className={adminTabsContentCn}>
          <NoticeHistory />
        </TabsContent>
      </Tabs>

      {/* 휴가 관리 링크 */}
      <Link href="/admin/leave">
        <Card className="shadow-sm hover:bg-muted/50 transition-colors cursor-pointer">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Palmtree className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-foreground">{t("adminLeave")}</p>
              <p className="text-xs text-muted-foreground">{t("adminLeaveApproval")}</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Attendance Approval: 관리자 기준 단일 테이블 (기록 + 미기록) */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("adminAttApproval")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground -mt-1">{t("adminAttMobileHelp")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">{t("att_start_date")}</label>
              <Input type="date" value={attStart} onChange={(e) => setAttStart(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">{t("att_end_date")}</label>
              <Input type="date" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("stockFilterStore")}</label>
            <Select
              value={attStores.includes(attStoreFilter) ? attStoreFilter : "All"}
              onValueChange={(v) => setAttStoreFilter(v)}
            >
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent position="popper">
                {attStores.map((st) => (
                  <SelectItem key={st} value={st}>{st === "All" ? t("noticeFilterAll") : st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("att_status_filter")}</label>
            <Select
              value={
                ["all", "noRecord", "exceptNormal", "연장", "지각"].includes(attStatusFilter) || uniqueStatuses.includes(attStatusFilter)
                  ? attStatusFilter
                  : "all"
              }
              onValueChange={setAttStatusFilter}
            >
              <SelectTrigger className="h-9 w-full text-xs">
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
          <Button className="h-10 w-full font-medium" onClick={loadAttendance} disabled={attLoading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {attLoading ? t("loading") : t("stockBtnSearch")}
          </Button>

          {!attHasSearched ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-xs text-muted-foreground">{t("att_query_please")}</p>
            </div>
          ) : attLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">{t("loading")}</div>
          ) : displayRecordList.length === 0 && noRecordList.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">{t("adminAttNoPending")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card -mx-1">
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
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("label_date")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("emp_label_name")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap tabular-nums">{t("emp_label_employee_code")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_in")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_out")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_break_min")} <span className="text-[10px] text-muted-foreground">(M)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_actual_hrs")} <span className="text-[10px] text-muted-foreground">(H)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_planned_hrs")} <span className="text-[10px] text-muted-foreground">(H)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[3.5rem]">{t("att_adjust_late")} <span className="text-[10px] text-muted-foreground">(M)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[3.5rem]">{t("att_adjust_early")} <span className="text-[10px] text-muted-foreground">(M)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[3.5rem]">{t("att_adjust_ot")} <span className="text-[10px] text-muted-foreground">(M)</span></th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_status")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[48px]" title={t("att_adjust_col_hint")}>
                      <Save className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="sr-only">{t("att_adjust_col_hint")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRecordList.map((row, i) => {
                    const pendingIn = row.pendingInId ?? null
                    const pendingOut = row.pendingOutId ?? null
                    const hasLegacyPending = !pendingIn && !pendingOut && row.pendingId != null
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
                    const isMissingClockOut =
                      row.status === "퇴근미기록" ||
                      !row.outTimeStr ||
                      row.outTimeStr === "-"
                    const isNormal = row.status === "정상" || (row.status && String(row.status).includes("정상(승인)"))
                    const statusStr = String(row.status || "")
                    const showAdjustInput =
                      ((!isNormal &&
                        ((row.plannedWorkHrs > 0 && row.diffMin !== 0) ||
                          row.lateMin > 0 ||
                          (row.status && String(row.status).includes("강제퇴근(승인)")))) ||
                        (row.status && String(row.status).includes("정상(승인)")) ||
                        (row.plannedWorkHrs > 0 && statusStr.includes("조퇴"))) &&
                      !isMissingClockOut
                    const adjustKey = hasPendingOut && (pendingOut != null || row.pendingId != null)
                      ? (pendingOut ?? row.pendingId)!
                      : row.outLogId != null
                        ? row.outLogId
                        : `${row.date}-${row.store}-${row.name}`
                    const isPureLate =
                      row.lateMin > 0 &&
                      row.diffMin === 0 &&
                      (row.earlyMin ?? 0) === 0 &&
                      (row.otMin ?? 0) < 30
                    const inLogKey = row.inLogId ?? pendingIn ?? null
                    const lateDefault = String(row.lateMin > 0 ? Math.max(1, row.lateMin) : 0)
                    const showLateInput =
                      showAdjustInput &&
                      row.plannedWorkHrs > 0 &&
                      inLogKey != null &&
                      (row.lateMin > 0 || pendingIn != null)
                    const showOutInput = showAdjustInput && !isPureLate
                    const lateBefore = Math.max(0, Math.round(row.lateBeforeMin ?? row.lateMin ?? 0))
                    const lateAfter = Math.max(0, Math.round(row.lateAfterMin ?? row.lateMin ?? 0))
                    const earlyBefore = Math.max(0, Math.round(row.earlyBeforeMin ?? defaultEarly))
                    const earlyAfter = Math.max(0, Math.round(row.earlyAfterMin ?? defaultEarly))
                    const otBefore = Math.max(0, Math.round(row.otBeforeMin ?? defaultOt))
                    const otAfter = Math.max(0, Math.round(row.otAfterMin ?? defaultOt))
                    const rk = adjustRowKey(row, i)
                    const applySaved = adjustSavedKeys.has(rk)
                    return (
                      <tr
                        key={`r-${row.date}-${row.store}-${row.name}-${i}`}
                        data-att-adjust-row={rk}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-2 py-2 text-center">{row.date}</td>
                        <td className="px-2 py-2 text-center font-medium">{row.name}</td>
                        <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">{row.employeeCode || "-"}</td>
                        <td className="px-2 py-2 text-center">{row.inTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.outTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.breakMin}</td>
                        <td className="px-2 py-2 text-center">{row.actualWorkHrs}</td>
                        <td className="px-2 py-2 text-center">{row.plannedWorkHrs}</td>
                        <td className="px-2 py-2 text-center">
                          {showLateInput ? (
                            <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                              <span className="text-xs font-medium text-muted-foreground tabular-nums">{lateBefore}→</span>
                              <Input
                                key={`late-${inLogKey}`}
                                name={`adj_late_${inLogKey}`}
                                type="number"
                                min={0}
                                max={999}
                                placeholder="0"
                                defaultValue={String(lateAfter)}
                                className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-red-600 text-center tabular-nums mx-auto"
                              />
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                              <span className="text-muted-foreground">{lateBefore}</span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className="text-red-600">{lateAfter}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {isMissingClockOut ? (
                            <div className="flex flex-col items-center justify-center gap-0.5 leading-none">
                              <span className="text-[10px] text-muted-foreground text-center leading-tight px-0.5">
                                {t("att_adjust_early")}
                              </span>
                              <Input
                                name={`forced_early_${row.inLogId != null && row.inLogId > 0 ? `in_${row.inLogId}` : `row_${i}`}`}
                                type="number"
                                min={0}
                                max={999}
                                placeholder="0"
                                defaultValue={String(Math.max(0, Math.round(earlyAfter)))}
                                className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-amber-600 text-center tabular-nums mx-auto"
                              />
                            </div>
                          ) : showOutInput ? (
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
                                className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-amber-600 text-center tabular-nums mx-auto"
                              />
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
                              <span className="text-muted-foreground">{earlyBefore}</span>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className="text-amber-600">{earlyAfter}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {showOutInput ? (
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
                                className="h-8 min-w-[3.5rem] w-16 text-base font-semibold text-blue-600 text-center tabular-nums mx-auto"
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
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {pendingIn != null ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-1.5 text-[10px] text-muted-foreground border-border hover:bg-muted"
                                >
                                  {t("att_btn_process")}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center">
                                <DropdownMenuItem onClick={() => handleApprove(pendingIn, undefined, (row.lateMin ?? 0) > 0)}>
                                  {(row.lateMin ?? 0) > 0 ? t("att_approve_in_waive_late") : t("att_approve_in")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => handleReject(pendingIn)}>{t("att_btn_reject")}</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className={cn(
                              "text-[10px] font-medium",
                              row.status === "정상" && "text-foreground",
                              row.status === "퇴근미기록" && "text-red-600",
                              row.status !== "정상" && row.status !== "퇴근미기록" && "text-amber-600"
                            )}>
                              {!row.outTimeStr ? "미퇴근" : statusToKey(row.status) ? t(statusToKey(row.status)!) : row.status}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {isMissingClockOut ? (
                            <div className="flex items-center gap-1 justify-center flex-wrap">
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
                            <div className="flex items-center gap-1 justify-center flex-wrap">
                              <AttAdjustApplyButton
                                saved={applySaved}
                                titleApply={t("att_save_apply_hint")}
                                titleApplied={t("att_adjust_applied_hint")}
                                onClick={async (e) => {
                                  e.preventDefault()
                                  const outId = pendingOut ?? row.pendingId!
                                  const keyForInput = String(pendingOut ?? row.pendingId ?? adjustKey)
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
                            <div className="flex items-center gap-1 justify-center flex-wrap">
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
                  {noRecordList.map((row) => (
                    <tr key={`n-${row.date}-${row.store}-${row.name}`} className="border-b last:border-b-0 bg-muted/20">
                      <td className="px-2 py-2 text-center">{row.date}</td>
                      <td className="px-2 py-2 text-center font-medium">
                        {row.name}
                        {row.nick && <span className="text-muted-foreground ml-0.5">({displayLabelShort(row.nick)})</span>}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">{row.employeeCode || "-"}</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">-</td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-[10px] text-slate-600">{t("att_tab_no_record")}</span>
                      </td>
                      <td className="px-2 py-2">
                        <Button size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => handleEmergencyApprove(row)}>
                          {t("att_btn_emergency_approve")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
