"use client"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"

import { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, type I18nKeys } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getTodayAttendanceTypes,
  getAttendanceRecordsAdmin,
  submitAttendance,
  requestLeave,
  getMyLeaveInfo,
  uploadLeaveCertificate,
  getMyPayroll,
  getHeadOfficeInfo,
  type AttendanceDailyRow,
} from "@/lib/api-client"
import { todayStrBangkok, daysAgoStrBangkok, ATTENDANCE_TZ } from "@/lib/attendance-utils"
import { translateLeaveTypeFromDb } from "@/lib/leave-type-i18n"
import { cn, compressImageForUpload } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { Users, Sun, Moon, Coffee, Play, Clock, Wallet, Search, Download, Image as ImageIcon, Upload } from "lucide-react"

function getAttendanceDateRange() {
  const now = new Date()
  const today = todayStrBangkok()
  const bangkokHour = parseInt(now.toLocaleString("en-US", { timeZone: ATTENDANCE_TZ, hour: "2-digit", hour12: false }), 10)
  if (bangkokHour >= 0 && bangkokHour < 6) {
    return { startDate: daysAgoStrBangkok(1), endDate: today }
  }
  return { startDate: today, endDate: today }
}

const ATT_TYPE_TO_CONFIRM_KEY: Record<string, string> = {
  출근: "attConfirmIn",
  퇴근: "attConfirmOut",
  휴식시작: "attConfirmBreak",
  휴식종료: "attConfirmResume",
}

const LEAVE_STATUS_TO_KEY: Record<string, string> = {
  승인: "statusApproved",
  Approved: "statusApproved",
  거부: "statusRejected",
  반려: "statusRejected",
  Rejected: "statusRejected",
  대기: "statusPending",
  Pending: "statusPending",
}

function translateLeaveType(type: string, t: (k: I18nKeys) => string): string {
  return translateLeaveTypeFromDb(type, t as (k: string) => string)
}

function translateLeaveStatus(status: string, t: (k: I18nKeys) => string): string {
  const key = LEAVE_STATUS_TO_KEY[status] || LEAVE_STATUS_TO_KEY[status.trim()]
  return key ? t(key as I18nKeys) : status
}

export function HrTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [todayTypes, setTodayTypes] = useState<string[]>([])
  const [dailyRecords, setDailyRecords] = useState<AttendanceDailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [leaveStats, setLeaveStats] = useState({
    usedAnn: 0,
    usedSick: 0,
    usedUnpaid: 0,
    usedLakij: 0,
    remain: 15,
    remainLakij: 3,
    remainSick: 30,
    annualTotal: 6,
    lakijTotal: 3,
    sickTotal: 30,
  })
  const [leaveHistory, setLeaveHistory] = useState<{ id?: number; date: string; type: string; reason: string; status: string; certificateUrl?: string; rejectReason?: string }[]>([])
  const [leaveType, setLeaveType] = useState("연차")
  const [leaveDate, setLeaveDate] = useState(() => todayStrBangkok())
  const [leaveReason, setLeaveReason] = useState("")
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [certUploadingId, setCertUploadingId] = useState<number | null>(null)
  const [certPreviewUrl, setCertPreviewUrl] = useState<string | null>(null)
  const leaveCertInputRef = useRef<HTMLInputElement>(null)
  const pendingCertIdRef = useRef<number | null>(null)
  const [now, setNow] = useState(() => new Date())

  // 내 급여 명세서
  const [payrollMonth, setPayrollMonth] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  })
  const [payrollData, setPayrollData] = useState<{
    month: string
    store: string
    name: string
    dept: string
    role: string
    companyName?: string
    salary: number
    pos_allow: number
    haz_allow: number
    diligence_allow: number
    birth_bonus: number
    holiday_pay: number
    spl_bonus: number
    ot_amt: number
    late_ded: number
    sso: number
    tax: number
    other_ded: number
    net_pay: number
  } | null>(null)
  const [companyName, setCompanyName] = useState("")
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [payrollPreviewOpen, setPayrollPreviewOpen] = useState(false)

  useEffect(() => {
    const tid = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tid)
  }, [])

  const loadButtonState = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    getTodayAttendanceTypes({
      storeName: auth.store,
      name: auth.user,
      ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
    }).then(setTodayTypes)
  }, [auth?.store, auth?.user, auth?.employeeId])

  const loadTodayLog = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    const { startDate, endDate } = getAttendanceDateRange()
    getAttendanceRecordsAdmin({
      startDate,
      endDate,
      storeFilter: auth.store,
      employeeFilter: auth.user,
      ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
      userStore: auth.store,
      userRole: auth?.role,
    }).then(setDailyRecords)
  }, [auth?.store, auth?.user, auth?.role, auth?.employeeId])

  const loadLeaveInfo = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    getMyLeaveInfo({
      store: auth.store,
      name: auth.user,
      ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
    }).then((r) => {
      setLeaveStats(r.stats)
      setLeaveHistory(r.history)
    })
  }, [auth?.store, auth?.user, auth?.employeeId])

  const fetchPayroll = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    setPayrollLoading(true)
    Promise.all([
      getMyPayroll({
        store: auth.store,
        name: auth.user,
        month: payrollMonth,
        ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
      }),
      getHeadOfficeInfo(),
    ])
      .then(([payRes, companyRes]) => {
        const data = payRes.success && payRes.data ? payRes.data : null
        setPayrollData(data)
        setCompanyName(data?.companyName || companyRes?.companyName || "CHOONGMAN")
      })
      .catch(() => {
        setPayrollData(null)
        setCompanyName("")
      })
      .finally(() => setPayrollLoading(false))
  }, [auth?.store, auth?.user, auth?.employeeId, payrollMonth])

  useEffect(() => {
    if (!auth?.store || !auth?.user) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadButtonState()
    loadTodayLog()
    loadLeaveInfo()
    setLoading(false)
  }, [auth?.store, auth?.user, loadButtonState, loadTodayLog, loadLeaveInfo])

  useEffect(() => {
    if (!auth?.store || !auth?.user) return
    fetchPayroll()
  }, [auth?.store, auth?.user, fetchPayroll])

  const sendAttendance = async (type: string) => {
    if (!auth?.store || !auth?.user) return
    const confirmKey = ATT_TYPE_TO_CONFIRM_KEY[type] || "attConfirmIn"
    const msg = t(confirmKey as "attConfirmIn" | "attConfirmOut" | "attConfirmBreak" | "attConfirmResume")
    if (!(await appConfirm(msg))) return

    const options = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    const gpsFailMsg = t("attGpsFailConfirm")
    const doSend = (lat: string | number, lng: string | number) => {
      setSubmitting(type)
      submitAttendance({
        storeName: auth.store,
        name: auth.user!,
        type,
        lat,
        lng,
        ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
      })
        .then(async (res) => {
          const isGpsPending = res.code === "ATT_GPS_PENDING"
          const isQueued = (res as { queued?: boolean }).queued === true
          const isDuplicate =
            typeof res.message === "string" &&
            res.message.includes("오늘 이미") &&
            res.message.includes("기록이 있습니다")

          if (isDuplicate) {
            await appAlert(t("attDuplicateOnce"))
            loadButtonState()
            return
          }
          if (!isGpsPending && res.message && (res.message.includes("지각") || res.message.includes("조퇴") || res.message.includes("연장"))) {
            const reason = await appPrompt(t("attReasonPrompt"))
            if (reason) {
              // updateLastReason would need an API - skip for now
            }
          }
          if (isGpsPending) await appAlert(t("attGpsPendingSaved"))
          else await appAlert(translateApiMessage(res.message, t) || t("msg_done"))

          if ((res.message && res.message.includes("✅")) || isGpsPending || isQueued) {
            loadButtonState()
            loadTodayLog()
          }
        })
        .catch(async (e) => {
          await appAlert((e instanceof Error ? e.message : String(e)) + "\n" + t("orderFail"))
        })
        .finally(() => setSubmitting(null))
    }

    navigator.geolocation.getCurrentPosition(
      (p) => doSend(p.coords.latitude, p.coords.longitude),
      async () => {
        if (await appConfirm(gpsFailMsg)) doSend("Unknown", "Unknown")
      },
      options
    )
  }

  const handleRequestLeave = async () => {
    if (!auth?.store || !auth?.user) return
    if (!leaveDate.trim()) {
      await appAlert(t("msg_select_date"))
      return
    }
    setLeaveSubmitting(true)
    try {
      const res = await requestLeave({
        store: auth.store,
        name: auth.user,
        type: leaveType,
        date: leaveDate,
        reason: leaveReason,
        ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("leaveRequestSuccess"))
        setLeaveReason("")
        loadLeaveInfo()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("leaveRequestFail"))
      }
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLeaveSubmitting(false)
    }
  }

  const triggerCertUpload = (id: number) => {
    if (!auth?.store || !auth?.user) return
    pendingCertIdRef.current = id
    leaveCertInputRef.current?.click()
  }

  const handleCertFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = pendingCertIdRef.current
    const file = e.target.files?.[0]
    e.target.value = ""
    pendingCertIdRef.current = null
    if (!id || !file || !auth?.store || !auth?.user) return
    setCertUploadingId(id)
    try {
      const dataUrl = await compressImageForUpload(file)
      const res = await uploadLeaveCertificate({
        id,
        store: auth.store,
        name: auth.user,
        certificateUrl: dataUrl,
      })
      if (res.success) {
        loadLeaveInfo()
        await appAlert(translateApiMessage(res.message, t) || t("leaveCertUploaded"))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
      }
    } catch (err) {
      await appAlert(t("msg_error_prefix") + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCertUploadingId(null)
    }
  }

  const hasClockIn = todayTypes.includes("출근")
  const hasBreak = todayTypes.includes("휴식시작")
  const hasResume = todayTypes.includes("휴식종료")
  const hasClockOut = todayTypes.includes("퇴근")

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const formatMonthLabel = (m: string) => {
    if (!m || m.length < 7) return m
    const [, mm] = m.split("-")
    const months = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
    return `${m.slice(0, 4)}년 ${months[parseInt(mm, 10) || 0] || mm}월`
  }
  const formatMonthForPrint = (m: string, l: string) => {
    if (!m || m.length < 7) return m
    const d = new Date(m + "-01")
    const localeMap: Record<string, string> = { ko: "ko-KR", en: "en-US", th: "th-TH", mm: "my-MM", la: "lo-LA" }
    return d.toLocaleDateString(localeMap[l] || "en-US", { year: "numeric", month: "long" })
  }
  const getPayrollHtml = () => {
    if (!payrollData) return ""
    const issueDate = new Date().toISOString().slice(0, 10)
    const monthLabel = formatMonthForPrint(payrollData.month, lang)
    const displayCompany = payrollData.companyName || companyName || "CHOONGMAN"
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("payMyTitle")} - ${payrollData.name}</title>
<style>
body{font-family:'Malgun Gothic',Arial,sans-serif;font-size:11pt;color:#1e293b;padding:24px;max-width:480px;margin:0 auto;}
h1{font-size:16pt;text-align:center;margin-bottom:4px;color:#0f172a;}
.company{text-align:center;font-size:12pt;font-weight:600;margin-bottom:20px;color:#374151;}
.meta{display:grid;grid-template-columns:80px 1fr;gap:4px 12px;margin-bottom:16px;font-size:10pt;}
.meta dt{color:#64748b;} .meta dd{margin:0;}
table{width:100%;border-collapse:collapse;font-size:10pt;}
th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;}
th{background:#f8fafc;font-weight:600;} td.num{text-align:right;}
.section{background:#f1f5f9;} .deduct{color:#dc2626;}
.net{font-weight:700;font-size:12pt;background:#e0f2fe;color:#0c4a6e;}
.footer{margin-top:24px;font-size:9pt;color:#94a3b8;text-align:right;}
</style></head><body>
<h1>${t("payPrintTitle")}</h1>
<div class="company">${displayCompany}</div>
<dl class="meta">
<dt>${t("payPrintMonth")}</dt><dd>${monthLabel}</dd>
<dt>${t("payPrintStore")}</dt><dd>${payrollData.store}</dd>
<dt>${t("payPrintRole")}</dt><dd>${payrollData.role || "-"}</dd>
<dt>${t("payPrintDept")}</dt><dd>${payrollData.dept || "-"}</dd>
<dt>${t("payPrintName")}</dt><dd>${payrollData.name}</dd>
</dl>
<table>
<tr class="section"><th colspan="2">${t("payPrintAllow")}</th></tr>
<tr><td>${t("pay_salary")}</td><td class="num">${fmt(payrollData.salary)} THB</td></tr>
<tr><td>${t("pay_pos_allow")}</td><td class="num">+${fmt(payrollData.pos_allow)}</td></tr>
<tr><td>${t("pay_haz_allow")}</td><td class="num">+${fmt(payrollData.haz_allow)}</td></tr>
<tr><td>${t("pay_diligence_allow")}</td><td class="num">+${fmt(payrollData.diligence_allow ?? 0)}</td></tr>
<tr><td>${t("pay_birth")}</td><td class="num">+${fmt(payrollData.birth_bonus)}</td></tr>
<tr><td>${t("pay_holiday")}</td><td class="num">+${fmt(payrollData.holiday_pay)}</td></tr>
<tr><td>${t("pay_spl_bonus")}</td><td class="num">+${fmt(payrollData.spl_bonus)}</td></tr>
<tr><td>${t("pay_ot_hours")}</td><td class="num">+${fmt(payrollData.ot_amt)}</td></tr>
<tr class="section"><th colspan="2">${t("payPrintDeduct")}</th></tr>
<tr><td>${t("pay_late_ded")}</td><td class="num deduct">-${fmt(payrollData.late_ded)}</td></tr>
<tr><td>${t("pay_sso")}</td><td class="num deduct">-${fmt(payrollData.sso)}</td></tr>
<tr><td>${t("pay_tax")}</td><td class="num deduct">-${fmt(payrollData.tax)}</td></tr>
<tr><td>${t("pay_other_ded")}</td><td class="num deduct">-${fmt(payrollData.other_ded)}</td></tr>
<tr class="net"><td><strong>${t("pay_net")}</strong></td><td class="num"><strong>${fmt(payrollData.net_pay)} THB</strong></td></tr>
</table>
<div class="footer">${t("payPrintIssueDate")}: ${issueDate}</div>
<div class="company" style="margin-top:16px;font-size:11pt;">${displayCompany}</div>
</body></html>`
  }

  const handleOpenPayrollPreview = () => {
    if (!payrollData) return
    setPayrollPreviewOpen(true)
  }

  const handleDownloadPayroll = () => {
    const html = getPayrollHtml()
    if (!html) return
    const fn = `payslip_${payrollData!.month}_${(payrollData!.name || "payroll").replace(/\s+/g, "_")}.html`
    const blob = new Blob(["\uFEFF" + html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fn
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!auth?.store || !auth?.user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Users className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("att_select_store_login")}</p>
      </div>
    )
  }

  function attStatusToKey(st: string): string | null {
    const s = (st || "").trim()
    if (!s) return null
    if (s === "정상") return "att_status_normal"
    if (s.includes("정상") && s.includes("승인")) return "att_status_approved"
    if (s === "퇴근미기록") return "att_status_no_out"
    if (s === "지각" || s === "지각(승인)") return "att_status_late"
    if (s === "조퇴") return "att_status_early"
    if (s === "연장") return "att_status_overtime"
    if (s.includes("위치미확인") && s.includes("승인대기")) return "att_status_gps_pending"
    if (s.includes("강제퇴근") && s.includes("승인대기")) return "att_status_forced_out_pending"
    if (s === "휴게초과") return "att_status_break_over"
    if (s === "휴게정상") return "att_status_break_ok"
    return null
  }

  const nowBangkok = now.toLocaleTimeString("ko-KR", { timeZone: ATTENDANCE_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-primary" />
          <span className="text-2xl font-bold tabular-nums">
            {nowBangkok}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("hrUser")}</p>
        <p className="text-lg font-bold text-primary">{auth.user}</p>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("attTodayRecord")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-12 bg-[#16a34a] hover:bg-[#16a34a]/90"
              disabled={hasClockIn || !!submitting}
              onClick={() => sendAttendance("출근")}
            >
              <Sun className="mr-2 h-4 w-4" />
              {t("attIn")}
            </Button>
            <Button
              className="h-12 bg-[#dc2626] hover:bg-[#dc2626]/90"
              disabled={!hasClockIn || hasClockOut || !!submitting}
              onClick={() => sendAttendance("퇴근")}
            >
              <Moon className="mr-2 h-4 w-4" />
              {t("attOut")}
            </Button>
            <Button
              className="h-12 bg-[#ea580c] hover:bg-[#ea580c]/90"
              disabled={!hasClockIn || hasBreak || hasClockOut || !!submitting}
              onClick={() => sendAttendance("휴식시작")}
            >
              <Coffee className="mr-2 h-4 w-4" />
              {t("attBreak")}
            </Button>
            <Button
              className="h-12 bg-[#2563eb] hover:bg-[#2563eb]/90"
              disabled={!hasClockIn || !hasBreak || hasResume || hasClockOut || !!submitting}
              onClick={() => sendAttendance("휴식종료")}
            >
              <Play className="mr-2 h-4 w-4" />
              {t("attResume")}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("attHelp")}</p>

          {loading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : dailyRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
              {t("attHelp")}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-2 py-2 text-center font-semibold">{t("label_date")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_in")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_out")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_break_min")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_actual_hrs")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_planned_hrs")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_diff")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_late_extra")}</th>
                    <th className="px-2 py-2 text-center font-semibold">{t("att_col_status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRecords.map((row, i) => {
                    const hasPending = (row.pendingInId ?? row.pendingOutId ?? row.pendingId) != null
                    return (
                      <tr
                        key={`${row.date}-${row.name}-${i}`}
                        className={`border-b border-border/60 last:border-0 ${hasPending ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                      >
                        <td className="px-2 py-2 text-center">{row.date}</td>
                        <td className="px-2 py-2 text-center">{row.inTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.outTimeStr}</td>
                        <td className="px-2 py-2 text-center">{row.breakMin}</td>
                        <td className="px-2 py-2 text-center">{row.actualWorkHrs}</td>
                        <td className="px-2 py-2 text-center">{row.plannedWorkHrs}</td>
                        <td className="px-2 py-2 text-center">{row.diffMin}</td>
                        <td className="px-2 py-2 text-center">
                          {row.lateMin > 0 && <span className="text-amber-600">{t("att_late_label")} {row.lateMin}{t("att_min_unit")} </span>}
                          {row.otMin > 0 && <span className="text-blue-600">{t("att_ot_label")} {row.otMin}{t("att_min_unit")}</span>}
                          {row.lateMin === 0 && row.otMin === 0 && "-"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn(
                            "text-[10px] font-medium",
                            hasPending && "text-amber-600",
                            row.status === "퇴근미기록" && "text-red-600"
                          )}>
                            {attStatusToKey(row.status) ? t(attStatusToKey(row.status)!) : row.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("leaveStats")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
            <div className="rounded-lg bg-primary/10 px-1.5 sm:px-3 py-2 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("annual")}</p>
              <p className="text-sm sm:text-base font-bold text-primary">{leaveStats.usedAnn ?? 0} / {leaveStats.remain ?? 0}</p>
            </div>
            <div className="rounded-lg bg-primary/10 px-1.5 sm:px-3 py-2 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("lakij")}</p>
              <p className="text-sm sm:text-base font-bold text-primary">{leaveStats.usedLakij ?? 0} / {leaveStats.remainLakij ?? 3}</p>
            </div>
            <div className="rounded-lg bg-primary/10 px-1.5 sm:px-3 py-2 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("sick")}</p>
              <p className="text-sm sm:text-base font-bold text-primary">{leaveStats.usedSick ?? 0} / {leaveStats.remainSick ?? 30}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-1.5 sm:px-3 py-2 min-w-0">
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{t("unpaid")}</p>
              <p className="text-sm sm:text-base font-bold">{leaveStats.usedUnpaid ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("leaveReq")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            value={leaveType}
            onChange={(e) => {
              const v = e.target.value
              setLeaveType(v)
              if (v.indexOf("ลากิจ") !== -1 || v.toLowerCase().indexOf("lakij") !== -1) {
                void appAlert(t("leaveLakijGovAlert"))
              }
            }}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="연차">{t("annual")}</option>
            <option value="ลากิจ">{t("lakij")}</option>
            <option value="반차">{t("half")}</option>
            <option value="병가">{t("sick")}</option>
            <option value="무급휴가">{t("unpaid")}</option>
          </select>
          {(leaveType.indexOf("병가") !== -1 || leaveType.indexOf("ลากิจ") !== -1) && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg px-3 py-2">
              {leaveType.indexOf("병가") !== -1 ? t("leaveSickHint") : t("leaveLakijHint")}
            </p>
          )}
          <Input
            type="date"
            value={leaveDate}
            onChange={(e) => setLeaveDate(e.target.value)}
            className="h-10"
          />
          <Input
            placeholder={t("reasonPh")}
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            className="h-10"
          />
          <Button
            className="w-full"
            onClick={handleRequestLeave}
            disabled={leaveSubmitting}
          >
            {leaveSubmitting ? t("loading") : t("submitReq")}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("reqHist")}</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={leaveCertInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCertFileChange}
          />
          {leaveHistory.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("leaveHistoryEmpty")}</div>
          ) : (
            <div className="space-y-1">
              {leaveHistory.map((h, i) => {
                const needsProof = h.type.indexOf("병가") !== -1 || h.type.indexOf("ลากิจ") !== -1
                const isProofPending = needsProof && (h.status === "대기" || h.status === "Pending")
                const canUpload = isProofPending && h.id && !h.certificateUrl
                const hasCert = isProofPending && h.certificateUrl
                const uploading = certUploadingId === h.id
                return (
                  <div
                    key={h.id ?? i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-medium">{h.date}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{translateLeaveType(h.type, t)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canUpload && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => triggerCertUpload(h.id!)}
                          disabled={uploading}
                        >
                          <Upload className="mr-1 h-3 w-3" />
                          {uploading ? t("loading") : h.type.indexOf("ลากิจ") !== -1 ? t("leaveProofUpload") : t("leaveCertUpload")}
                        </Button>
                      )}
                      {hasCert && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-green-600"
                          onClick={() => setCertPreviewUrl(h.certificateUrl!)}
                        >
                          <ImageIcon className="mr-1 h-3 w-3" aria-hidden />
                          {h.type.indexOf("ลากิจ") !== -1 ? t("leaveProofView") : t("leaveCertView")}
                        </Button>
                      )}
                      <Badge
                        variant={h.status === "승인" || h.status === "Approved" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {translateLeaveStatus(h.status, t)}
                      </Badge>
                    </div>
                    {(h.status === "반려" || h.status === "Rejected") && h.rejectReason && (
                      <p className="text-xs text-destructive/90 mt-1.5 border-l-2 border-destructive/50 pl-2">
                        {t("leaveRejectReasonLabel") || "반려 사유"}: {h.rejectReason}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 내 급여 명세서 - 인사탭 맨 아래 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("payMyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t("payMySub")}</p>
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value.slice(0, 7))}
              className="h-9 flex-1 min-w-0 text-xs"
            />
            <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => fetchPayroll()} disabled={payrollLoading}>
              <Search className="h-3.5 w-3.5 mr-1" />
              {t("search")}
            </Button>
          </div>
          {payrollLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("payMyLoading")}</div>
          ) : !payrollData ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("payMyNoData")}</div>
          ) : (
            <>
              <div className="rounded-lg border border-border/60 overflow-hidden text-xs">
                <div className="bg-muted/30 px-3 py-2 font-medium">
                  {formatMonthLabel(payrollData.month)} · {payrollData.store} · {payrollData.role || "-"}
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_salary")}</span>
                  <span className="font-medium">{fmt(payrollData.salary)} THB</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_pos_allow")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.pos_allow)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_haz_allow")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.haz_allow)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_diligence_allow")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.diligence_allow ?? 0)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_birth")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.birth_bonus)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_holiday")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.holiday_pay)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_spl_bonus")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.spl_bonus)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40">
                  <span className="text-muted-foreground">{t("pay_ot_hours")}</span>
                  <span className="text-green-600 dark:text-green-400">+{fmt(payrollData.ot_amt)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t("pay_late_ded")}</span>
                  <span className="text-destructive">-{fmt(payrollData.late_ded)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t("pay_sso")}</span>
                  <span className="text-destructive">-{fmt(payrollData.sso)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t("pay_tax")}</span>
                  <span className="text-destructive">-{fmt(payrollData.tax)}</span>
                </div>
                <div className="px-3 py-2 flex justify-between border-t border-border/40 bg-destructive/5">
                  <span className="text-muted-foreground">{t("pay_other_ded")}</span>
                  <span className="text-destructive">-{fmt(payrollData.other_ded)}</span>
                </div>
                <div className="px-3 py-3 flex justify-between items-center border-t-2 border-primary/30 bg-primary/5">
                  <span className="font-semibold text-sm">{t("pay_net")}</span>
                  <span className="font-bold text-base text-primary">{fmt(payrollData.net_pay)} THB</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-3 h-9" onClick={handleOpenPayrollPreview}>
                <Download className="h-3.5 w-3.5 mr-2" />
                {t("payMyViewDownload")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={payrollPreviewOpen} onOpenChange={setPayrollPreviewOpen}>
        <DialogContent className="max-w-[520px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("payMyTitle")}</DialogTitle>
          </DialogHeader>
          {payrollData && (
            <>
              <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border bg-white">
                <iframe
                  srcDoc={getPayrollHtml()}
                  title={t("payMyTitle")}
                  className="w-full border-0"
                  style={{ minHeight: "400px" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t("payMyPrintHint")}</p>
              <Button className="w-full mt-3" onClick={handleDownloadPayroll}>
                <Download className="h-4 w-4 mr-2" />
                {t("payMyDownloadFile")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!certPreviewUrl} onOpenChange={(open) => !open && setCertPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
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
    </div>
  )
}
