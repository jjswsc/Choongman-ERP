"use client"
import { appAlert } from "@/lib/app-message"

import { useState, useEffect, useCallback, useRef } from "react"
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
import { UserCog, Search, Palmtree } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NoticeCompose } from "@/components/erp/notice-compose"
import { NoticeHistory } from "@/components/erp/notice-history"
import { displayLabelShort } from "@/lib/utils"
import { cn } from "@/lib/utils"

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
  const [otMinutesByRow, setOtMinutesByRow] = useState<Record<number | string, string>>({})

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

  const uniqueStatuses = [...new Set(recordList.map((r) => r.status).filter(Boolean))].sort() as string[]
  const displayRecordList =
    attStatusFilter === "all"
      ? recordList
      : attStatusFilter === "noRecord"
        ? []
        : attStatusFilter === "exceptNormal"
          ? recordList.filter((r) => r.status !== "정상")
          : recordList.filter((r) => r.status === attStatusFilter)

  const handleApprove = async (id: number, optOtMinutes?: number | null, waiveLate?: boolean, optEarlyMinutes?: number | null, skipReload?: boolean) => {
    if (!auth) return
    const res = await processAttendanceApproval({
      id,
      decision: "승인완료",
      optOtMinutes: optOtMinutes != null ? optOtMinutes : undefined,
      optEarlyMinutes: optEarlyMinutes != null ? optEarlyMinutes : undefined,
      waiveLate,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) {
      setOtMinutesByRow((p) => { const next = { ...p }; delete next[id]; return next })
      if (!skipReload) loadAttendance()
    } else {
      await appAlert(translateApiMessage(res.message) || t("processFail"))
    }
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

  const handleApproveNoClockOut = async (row: AttendanceDailyRow) => {
    if (!auth) return
    const res = await approveNoClockOut({
      date: row.date,
      store: row.store,
      name: row.name,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) loadAttendance()
    else await appAlert(translateApiMessage(res.message) || t("processFail"))
  }

  const handleEmergencyApprove = async (row: AttendanceNoRecordRow) => {
    if (!auth) return
    const res = await createAttendanceFromSchedule({
      date: row.date,
      store: row.store,
      name: row.name,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) loadAttendance()
    else await appAlert(translateApiMessage(res.message) || t("processFail"))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 공지사항 (탭: 새 공지 보내기 | 발송 내역) */}
      <Tabs defaultValue="compose" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-3">
          <TabsTrigger value="compose" className="text-sm font-medium">
            {t("noticeNewTitle")}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">
            {t("noticeHistoryTitle")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="compose">
          <NoticeCompose />
        </TabsContent>
        <TabsContent value="history">
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
              <form id="att-adjust-form" onSubmit={(e) => e.preventDefault()} className="contents">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("label_date")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("emp_label_name")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_in")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_out")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_break_min")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_actual_hrs")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_planned_hrs")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_diff")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[3rem]">{t("att_late_extra")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[4rem]">{t("att_adjust_label")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap">{t("att_col_status")}</th>
                    <th className="px-2 py-2 text-center font-semibold whitespace-nowrap min-w-[90px]">{t("att_approve_btn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRecordList.map((row, i) => {
                    const pendingIn = row.pendingInId ?? null
                    const pendingOut = row.pendingOutId ?? null
                    const hasLegacyPending = !pendingIn && !pendingOut && row.pendingId != null
                    const hasPendingOut = pendingOut != null || (hasLegacyPending && row.pendingId != null)
                    const earlyMinDisplay = row.diffMin < 0 ? Math.abs(row.diffMin) : 0
                    const savedEarly = row.earlyMin ?? earlyMinDisplay
                    const isNormal = row.status === "정상" || (row.status && String(row.status).includes("정상(승인)"))
                    const showAdjustInput = (!isNormal && ((row.plannedWorkHrs > 0 && row.diffMin !== 0) || row.lateMin > 0 || (row.status && String(row.status).includes("강제퇴근(승인)")))) || (row.status && String(row.status).includes("정상(승인)"))
                    const adjustKey = hasPendingOut && (pendingOut != null || row.pendingId != null)
                      ? (pendingOut ?? row.pendingId)!
                      : row.outLogId != null
                        ? row.outLogId
                        : `${row.date}-${row.store}-${row.name}`
                    const isOvertimeCell = row.diffMin > 0 && (row.otMin ?? 0) >= 30
                    const defaultVal = String(
                      row.plannedWorkHrs > 0 && row.diffMin < 0
                        ? (row.earlyMin ?? Math.abs(row.diffMin))
                        : row.plannedWorkHrs > 0 && row.diffMin > 0
                          ? (isOvertimeCell ? (row.otMin ?? row.diffMin) : row.diffMin >= 30 ? (row.otMin ?? row.diffMin) : 0)
                          : row.lateMin > 0
                            ? Math.max(1, row.lateMin)
                            : 0
                    )
                    const isLateOrPendingIn = row.lateMin > 0 || pendingIn != null
                    return (
                      <tr key={`r-${row.date}-${row.store}-${row.name}-${i}`} className="border-b last:border-b-0">
                        <td className="px-2 py-2 text-center">{row.date}</td>
                        <td className="px-2 py-2 text-center font-medium">{row.name}</td>
                        <td className="px-2 py-2 text-center">{row.inTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.outTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.breakMin}</td>
                        <td className="px-2 py-2 text-center">{row.actualWorkHrs}</td>
                        <td className="px-2 py-2 text-center">{row.plannedWorkHrs}</td>
                        <td className="px-2 py-2 text-center">
                          {row.plannedWorkHrs === 0 ? "-" : (
                            <span className={row.diffMin < 0 ? "text-amber-600" : undefined}>
                              {row.diffMin === 0 ? "0" : `${row.diffMin > 0 ? "+" : ""}${row.diffMin}`}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {(() => {
                            if (row.plannedWorkHrs === 0) return "-"
                            if (row.diffMin < 0) return <span className="text-amber-600">{row.earlyMin ?? Math.abs(row.diffMin)}</span>
                            if (row.diffMin > 0) return <span className="text-blue-600">{row.otMin ?? row.diffMin}</span>
                            if (row.lateMin > 0) return <span className="text-red-600">{row.lateMin}</span>
                            return "-"
                          })()}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {showAdjustInput ? (
                            <Input
                              key={String(adjustKey)}
                              name={`adj_${adjustKey}`}
                              type="number"
                              min={isLateOrPendingIn ? 1 : 0}
                              max={999}
                              placeholder={isLateOrPendingIn ? "1" : "0"}
                              defaultValue={defaultVal}
                              data-adjust-key={String(adjustKey)}
                              className="h-7 min-w-[3rem] w-14 text-xs text-center tabular-nums mx-auto"
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {pendingIn != null ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]">
                                  {row.inStatus?.includes("위치미확인") ? "위치미확인" : row.status}
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
                          {hasPendingOut && (row.status !== "정상" || row.otMin >= 30 || row.lateMin > 0 || row.diffMin < 0) ? (
                            <div className="flex items-center gap-1 justify-center flex-wrap">
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-6 px-1.5 text-[10px]"
                                onClick={async (e) => {
                                  e.preventDefault()
                                  const outId = pendingOut ?? row.pendingId!
                                  const keyForInput = String(pendingOut ?? row.pendingId ?? adjustKey)
                                  const form = (e.currentTarget as HTMLButtonElement).form
                                  const input = form?.elements.namedItem(`adj_${keyForInput}`) as HTMLInputElement | null
                                  const fromInput = input?.value?.trim()
                                  const otVal = fromInput !== undefined && fromInput !== "" ? fromInput : defaultVal
                                  const n = parseInt(otVal, 10)
                                  const num = !isNaN(n) && n >= 0 ? n : undefined
                                  if (row.diffMin < 0) {
                                    handleApprove(outId, undefined, undefined, num ?? 0)
                                  } else if (row.diffMin > 0 || row.otMin >= 30) {
                                    if ((num ?? 0) === 0 && row.lateMin > 0 && pendingIn != null) {
                                      await handleApprove(pendingIn, undefined, true, undefined, true)
                                    }
                                    handleApprove(outId, num ?? undefined, undefined)
                                  } else {
                                    handleApprove(outId, undefined, undefined)
                                  }
                                }}
                              >
                                {t("att_btn_approve")}
                              </Button>
                              <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => handleReject(pendingOut ?? row.pendingId!)}>{t("att_btn_reject")}</Button>
                            </div>
                          ) : !hasPendingOut && row.outLogId != null && row.approval === "승인완료" && (row.diffMin < 0 || (row.earlyMin ?? 0) > 0 || (row.diffMin > 0 && (row.otMin ?? 0) >= 30) || row.lateMin > 0 || (row.status && String(row.status).includes("강제퇴근(승인)")) || (row.status && String(row.status).includes("정상(승인)"))) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                                onClick={(e) => {
                                e.preventDefault()
                                const outId = row.outLogId!
                                const form = (e.currentTarget as HTMLButtonElement).form
                                const input = form?.elements.namedItem(`adj_${outId}`) as HTMLInputElement | null
                                const fromInput = input?.value?.trim()
                                const isOvertimeRow = row.diffMin > 0 && (row.otMin ?? 0) >= 30
                                const defaultVal =
                                  row.plannedWorkHrs > 0 && row.diffMin < 0
                                    ? (row.earlyMin ?? Math.abs(row.diffMin))
                                    : row.plannedWorkHrs > 0 && row.diffMin > 0
                                      ? (isOvertimeRow ? (row.otMin ?? row.diffMin) : row.diffMin >= 30 ? (row.otMin ?? row.diffMin) : 0)
                                      : row.lateMin > 0
                                        ? Math.max(1, row.lateMin)
                                        : 0
                                const otVal = fromInput !== undefined && fromInput !== "" ? fromInput : String(defaultVal)
                                const n = parseInt(otVal, 10)
                                const num = !isNaN(n) && n >= 0 ? n : 0
                                // 사용자가 0을 입력한 경우 절대 덮어쓰지 않음. 기존 noUserInput 시 currentOvertime으로 덮어쓰던 로직 제거.
                                const isLateOnly = row.lateMin > 0 && row.diffMin === 0 && (row.earlyMin ?? 0) === 0 && (row.otMin ?? 0) < 30
                                if (isLateOnly) {
                                  handleApprove(outId, undefined, undefined)
                                } else if (row.diffMin < 0 || (row.earlyMin ?? 0) > 0) {
                                  handleApprove(outId, undefined, undefined, num)
                                } else {
                                  handleApprove(outId, num, undefined)
                                }
                              }}
                            >
                              {t("att_apply_adjust")}
                            </Button>
                          ) : row.status === "퇴근미기록" || !row.outTimeStr || row.outTimeStr === "-" ? (
                            <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px] text-amber-600" onClick={() => handleApproveNoClockOut(row)}>
                              {t("att_approve_forced_out")}
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
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
