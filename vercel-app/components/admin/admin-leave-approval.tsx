"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
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
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { CalendarCheck, Search, Image as ImageIcon } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage as translateApiMsg } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { useStoreList, getLeavePendingList, processLeaveApproval } from "@/lib/api-client"
import { displayLabelShort } from "@/lib/utils"
import { hasOfficeStaffScope } from "@/lib/permissions"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { translateLeaveTypeFromDb } from "@/lib/leave-type-i18n"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
  AdminTableScroll,
} from "@/components/erp/admin-responsive-list"
import { cn } from "@/lib/utils"

function todayStr() {
  return getBangkokTodayDateString()
}

export function AdminLeaveApproval() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()

  const [leaveDateFilterType, setLeaveDateFilterType] = useState<'request' | 'leave'>('leave')
  const [leaveStart, setLeaveStart] = useState(todayStr)
  const [leaveEnd, setLeaveEnd] = useState(todayStr)
  const [leaveStoreFilter, setLeaveStoreFilter] = useState("All")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("All")
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("대기")
  const [leaveStores, setLeaveStores] = useState<string[]>([])
  const [leaveList, setLeaveList] = useState<
    {
      id: number
      store: string
      name: string
      employeeCode: string
      nick: string
      type: string
      date: string
      requestDate: string
      requestTimeBangkok?: string
      reason: string
      status: string
      certificateUrl: string
    }[]
  >([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [certPreviewUrl, setCertPreviewUrl] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ id: number } | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [leaveNameFilter, setLeaveNameFilter] = useState("")

  const { posStores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    const isOffice = hasOfficeStaffScope(auth.role || "", auth.store)
    queueMicrotask(() => {
      if (isOffice) {
        setLeaveStores(["All", ...storeList.filter((s) => s !== "All")])
      } else {
        setLeaveStores([auth.store])
        setLeaveStoreFilter(auth.store)
      }
    })
  }, [auth?.store, auth?.role, storeList])

  const isOffice = hasOfficeStaffScope(auth?.role || "", auth?.store)

  /** 급여 수정 등에서 ?month=yyyy-MM&store&name&status=all 로 진입 시 기간·조회 자동 적용 */
  useEffect(() => {
    if (!auth?.store) return
    const month = searchParams.get("month")
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return

    const [y, mo] = month.split("-").map(Number)
    const lastD = new Date(y, mo, 0)
    const mm = String(mo).padStart(2, "0")
    const monthEnd = `${y}-${mm}-${String(lastD.getDate()).padStart(2, "0")}`
    const focusRaw = String(searchParams.get("focusDate") || "").trim()
    const useFocusDay = /^\d{4}-\d{2}-\d{2}$/.test(focusRaw)
    const start = useFocusDay ? focusRaw : `${month}-01`
    const end = useFocusDay ? focusRaw : monthEnd

    const storeRaw = searchParams.get("store")
    const decStore = storeRaw ? decodeURIComponent(storeRaw).trim() : ""
    const nameRaw = searchParams.get("name")
    const decName = nameRaw ? decodeURIComponent(nameRaw).trim() : ""

    setLeaveStart(start)
    setLeaveEnd(end)
    setLeaveDateFilterType("leave")
    if (searchParams.get("status") === "all") setLeaveStatusFilter("All")

    if (!isOffice && auth.store) {
      setLeaveStoreFilter(auth.store)
    } else if (decStore) {
      setLeaveStoreFilter(decStore)
    }

    if (decName) setLeaveNameFilter(decName)

    const apiStore = !isOffice && auth.store ? auth.store : decStore && decStore !== "All" ? decStore : undefined

    setLeaveLoading(true)
    const statusForApi = searchParams.get("status") === "all" ? "All" : leaveStatusFilter

    getLeavePendingList({
      startStr: start,
      endStr: end,
      store: apiStore,
      typeFilter: undefined,
      status: statusForApi,
      userStore: auth.store,
      userRole: auth.role,
      dateFilterType: "leave",
    })
      .then(setLeaveList)
      .catch(() => setLeaveList([]))
      .finally(() => setLeaveLoading(false))
     
  }, [auth?.store, auth?.role, isOffice, searchParams.toString()])

  const statusLabelMap: Record<string, string> = { "대기": "statusPending", "승인": "statusApproved", "반려": "statusRejected" }
  const translateLeaveType = (type: string) => translateLeaveTypeFromDb(type, t)

  const translateApiMessage = (msg: string | undefined) => translateApiMsg(msg, t)

  const nameQ = leaveNameFilter.trim().toLowerCase()
  const visibleLeaveList = nameQ
    ? leaveList.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(nameQ) ||
          (item.nick || "").toLowerCase().includes(nameQ) ||
          (item.employeeCode || "").toLowerCase().includes(nameQ)
      )
    : leaveList

  const loadLeaveList = () => {
    if (!auth?.store) return
    setLeaveLoading(true)
    getLeavePendingList({
      startStr: leaveStart,
      endStr: leaveEnd,
      store: leaveStoreFilter === "All" ? undefined : leaveStoreFilter,
      typeFilter: leaveTypeFilter === "All" ? undefined : leaveTypeFilter,
      status: leaveStatusFilter,
      userStore: auth.store,
      userRole: auth.role,
      dateFilterType: leaveDateFilterType,
    })
      .then(setLeaveList)
      .catch(() => setLeaveList([]))
      .finally(() => setLeaveLoading(false))
  }

  const handleLeaveApprove = async (id: number, decision: string, rejectReasonArg?: string) => {
    if (!auth?.store) return
    const res = await processLeaveApproval({
      id,
      decision,
      userStore: auth.store,
      userRole: auth.role,
      ...(rejectReasonArg != null && { rejectReason: rejectReasonArg }),
    })
    if (res.success) {
      setRejectDialog(null)
      setRejectReason("")
      loadLeaveList()
    } else {
      await appAlert(translateApiMessage(res.message) || t("processFail"))
    }
  }

  const handleRejectClick = (id: number) => {
    setRejectReason("")
    setRejectDialog({ id })
  }

  const handleRejectConfirm = async () => {
    if (!rejectDialog) return
    const reason = rejectReason.trim()
    if (!reason) {
      await appAlert(t("leaveRejectReasonRequired") || "반려 사유를 입력해 주세요.")
      return
    }
    handleLeaveApprove(rejectDialog.id, "반려", reason)
  }

  return (
    <>
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <CalendarCheck className="h-3.5 w-3.5 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{t("adminLeaveApproval")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={leaveDateFilterType} onValueChange={(v: 'request' | 'leave') => setLeaveDateFilterType(v)}>
            <SelectTrigger className="h-10 w-full min-w-0 text-xs sm:h-9 sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="request">{t("adminLeaveByRequest")}</SelectItem>
              <SelectItem value="leave">{t("adminLeaveByLeave")}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="h-10 w-[calc(50%-0.25rem)] min-w-0 flex-1 text-xs sm:h-9 sm:w-[130px] sm:flex-none" />
          <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="h-10 w-[calc(50%-0.25rem)] min-w-0 flex-1 text-xs sm:h-9 sm:w-[130px] sm:flex-none" />
          <Select value={leaveStoreFilter} onValueChange={setLeaveStoreFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] min-w-0 flex-1 text-xs sm:h-9 sm:w-[100px] sm:flex-none">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {leaveStores.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={leaveTypeFilter} onValueChange={setLeaveTypeFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] min-w-0 flex-1 text-xs sm:h-9 sm:w-[90px] sm:flex-none">
              <SelectValue placeholder={t("leave_col_type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t("all")}</SelectItem>
              <SelectItem value="연차">{t("annual")}</SelectItem>
              <SelectItem value="ลากิจ">{t("lakij")}</SelectItem>
              <SelectItem value="반차">{t("half")}</SelectItem>
              <SelectItem value="병가">{t("sick")}</SelectItem>
              <SelectItem value="무급휴가">{t("unpaid")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={leaveStatusFilter} onValueChange={setLeaveStatusFilter}>
            <SelectTrigger className="h-10 w-[calc(50%-0.25rem)] min-w-0 flex-1 text-xs sm:h-9 sm:w-20 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="대기">{t("statusPending")}</SelectItem>
              <SelectItem value="승인">{t("statusApproved")}</SelectItem>
              <SelectItem value="반려">{t("statusRejected")}</SelectItem>
              <SelectItem value="All">{t("all")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="min-w-[120px] w-full flex-1 space-y-1 sm:max-w-[200px]">
            <label className="sr-only">{t("leave_filter_name")}</label>
            <Input
              type="search"
              value={leaveNameFilter}
              onChange={(e) => setLeaveNameFilter(e.target.value)}
              placeholder={t("leave_filter_name")}
              className="h-10 text-xs sm:h-9"
            />
          </div>
          <Button className="h-10 w-full shrink-0 px-4 font-medium sm:h-9 sm:w-auto" onClick={loadLeaveList} disabled={leaveLoading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {leaveLoading ? t("loading") : t("search")}
          </Button>
        </div>
        {leaveList.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("adminLeaveNoResult")}</p>
        ) : visibleLeaveList.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t("pay_hist_no_match")}</p>
        ) : (
          <>
            <AdminDesktopOnly>
              <AdminTableScroll hint={false}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="p-2 text-center font-medium">{t("store")}</th>
                      <th className="p-2 text-center font-medium min-w-[100px] whitespace-nowrap">{t("leave_col_name")}</th>
                      <th className="p-2 text-center font-medium whitespace-nowrap tabular-nums">{t("emp_label_employee_code")}</th>
                      <th className="p-2 text-center font-medium whitespace-nowrap min-w-[108px]">
                        <div>{t("leave_col_request_date")}</div>
                        <div className="font-normal text-muted-foreground">{t("leave_col_request_time")}</div>
                      </th>
                      <th className="p-2 text-center font-medium whitespace-nowrap">{t("leave_col_leave_date")}</th>
                      <th className="p-2 text-center font-medium">{t("leave_col_type")}</th>
                      <th className="p-2 text-center font-medium min-w-[200px]">{t("leave_col_reason")}</th>
                      <th className="p-2 text-center font-medium w-20">{t("leave_col_cert")}</th>
                      <th className="p-2 text-center font-medium w-28">{t("leave_col_action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLeaveList.map((item) => (
                      <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30">
                        <td className="p-2 text-center">{item.store}</td>
                        <td className="p-2 text-center whitespace-nowrap">{item.name}{item.nick ? ` (${displayLabelShort(item.nick)})` : ""}</td>
                        <td className="p-2 text-center whitespace-nowrap tabular-nums">{item.employeeCode || "-"}</td>
                        <td className="p-2 text-center whitespace-nowrap align-top">
                          <div className="tabular-nums">{item.requestDate || "-"}</div>
                          {item.requestTimeBangkok ? (
                            <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground tabular-nums" title={t("leave_col_request_time")}>
                              {item.requestTimeBangkok} ICT
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">{item.date}</td>
                        <td className="p-2 text-center">{translateLeaveType(item.type)}</td>
                        <td className="p-2 text-center">{item.reason || "-"}</td>
                        <td className="p-2 text-center">
                          {(item.type.indexOf("병가") !== -1 || item.type.indexOf("ลากิจ") !== -1) ? (
                            item.certificateUrl ? (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCertPreviewUrl(item.certificateUrl)} title={item.type.indexOf("ลากิจ") !== -1 ? t("leaveProofView") : t("leaveCertView")}>
                                <ImageIcon className="h-4 w-4" aria-hidden />
                              </Button>
                            ) : (
                              <span className="text-amber-600 text-xs font-medium" title={t("leaveCertPending")}>{t("leaveCertPending")}</span>
                            )
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {item.status === "대기" ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <Button size="sm" className={`${ADMIN_BTN_XS_CN} text-xs font-medium`} onClick={() => handleLeaveApprove(item.id, "승인")}>{t("adminApproved")}</Button>
                              <Button variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs font-medium`} onClick={() => handleRejectClick(item.id)}>{t("adminRejected")}</Button>
                              <Button variant="outline" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs font-medium text-destructive hover:text-destructive`} onClick={async () => { if (await appConfirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) handleLeaveApprove(item.id, "삭제") }}>{t("delete")}</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <Badge variant={item.status === "승인" || item.status === "Approved" ? "default" : "outline"} className="text-xs">{t(statusLabelMap[item.status] || item.status)}</Badge>
                              <Button variant="ghost" size="sm" className={`${ADMIN_BTN_XS_CN} text-xs text-destructive hover:text-destructive`} onClick={async () => { if (await appConfirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) handleLeaveApprove(item.id, "삭제") }}>{t("delete")}</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
            </AdminDesktopOnly>

            <AdminMobileOnly className="rounded-lg border border-border/60">
              {visibleLeaveList.map((item) => (
                <div key={item.id} className="space-y-2 border-b border-border/60 px-3 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        {item.name}
                        {item.nick ? ` (${displayLabelShort(item.nick)})` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.store}
                        {item.employeeCode ? ` · ${item.employeeCode}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={item.status === "승인" || item.status === "Approved" ? "default" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {t(statusLabelMap[item.status] || item.status)}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                    <span className="text-muted-foreground">{t("leave_col_leave_date")}</span>
                    <span className="tabular-nums text-right font-medium">{item.date}</span>
                    <span className="text-muted-foreground">{t("leave_col_type")}</span>
                    <span className="text-right">{translateLeaveType(item.type)}</span>
                    <span className="text-muted-foreground">{t("leave_col_request_date")}</span>
                    <span className="tabular-nums text-right">
                      {item.requestDate || "-"}
                      {item.requestTimeBangkok ? ` ${item.requestTimeBangkok}` : ""}
                    </span>
                  </div>
                  {item.reason ? (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(item.type.indexOf("병가") !== -1 || item.type.indexOf("ลากิจ") !== -1) && item.certificateUrl ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-xs"
                        onClick={() => setCertPreviewUrl(item.certificateUrl)}
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                        {item.type.indexOf("ลากิจ") !== -1 ? t("leaveProofView") : t("leaveCertView")}
                      </Button>
                    ) : null}
                    {item.status === "대기" ? (
                      <>
                        <Button
                          size="sm"
                          className="h-9 flex-1 text-xs font-medium sm:flex-none"
                          onClick={() => handleLeaveApprove(item.id, "승인")}
                        >
                          {t("adminApproved")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 flex-1 text-xs font-medium sm:flex-none"
                          onClick={() => handleRejectClick(item.id)}
                        >
                          {t("adminRejected")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn("h-9 text-xs font-medium text-destructive hover:text-destructive")}
                          onClick={async () => {
                            if (await appConfirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) {
                              handleLeaveApprove(item.id, "삭제")
                            }
                          }}
                        >
                          {t("delete")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 text-xs text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (await appConfirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) {
                            handleLeaveApprove(item.id, "삭제")
                          }
                        }}
                      >
                        {t("delete")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </AdminMobileOnly>
          </>
        )}
      </CardContent>
    </Card>

    <Dialog open={!!rejectDialog} onOpenChange={(open) => !open && setRejectDialog(null)}>
      <DialogContent className={`max-w-md ${ADMIN_DIALOG_SCROLL_CN}`}>
        <DialogHeader>
          <DialogTitle>{t("leaveRejectTitle") || "반려 사유"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("leaveRejectPrompt") || "반려 사유를 입력하세요. 신청자에게 표시됩니다."}</p>
          <Input
            placeholder={t("leaveRejectReasonPh") || "반려 사유 입력"}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="h-10"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejectDialog(null)}>{t("cancel") || "취소"}</Button>
            <Button variant="destructive" size="sm" onClick={handleRejectConfirm}>{t("adminRejected")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!certPreviewUrl} onOpenChange={(open) => !open && setCertPreviewUrl(null)}>
      <DialogContent className={`max-w-2xl ${ADMIN_DIALOG_SCROLL_CN}`}>
        <DialogHeader>
          <DialogTitle>{t("leaveCertView")}</DialogTitle>
        </DialogHeader>
        {certPreviewUrl && (
          <div className="overflow-hidden rounded-md">
            <ImageViewerWithRotate
              src={certPreviewUrl}
              alt={t("leaveCertView")}
              imgClassName="w-full h-auto max-h-[70vh] object-contain"
              rotateLeftLabel={t("imageRotateLeft") || "반시계"}
              rotateRightLabel={t("imageRotateRight") || "시계"}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
