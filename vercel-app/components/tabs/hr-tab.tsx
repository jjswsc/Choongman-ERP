"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, type I18nKeys } from "@/lib/i18n"
import {
  getTodayAttendanceTypes,
  getAttendanceList,
  submitAttendance,
  requestLeave,
  getMyLeaveInfo,
} from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Users, Sun, Moon, Coffee, Play, Clock } from "lucide-react"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const ATT_TYPE_TO_KEY: Record<string, string> = {
  출근: "attIn",
  퇴근: "attOut",
  휴식시작: "attBreak",
  휴식종료: "attResume",
}

function translateAttType(type: string, t: (k: I18nKeys) => string): string {
  const key = ATT_TYPE_TO_KEY[type]
  return key ? t(key as I18nKeys) : type
}

const LEAVE_TYPE_TO_KEY: Record<string, string> = {
  연차: "annual",
  반차: "half",
  병가: "sick",
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
  const key = LEAVE_TYPE_TO_KEY[type] || LEAVE_TYPE_TO_KEY[type.trim()]
  return key ? t(key as I18nKeys) : type
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
  const [attLog, setAttLog] = useState<{ timestamp: string; type: string; status: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [leaveStats, setLeaveStats] = useState({ usedAnn: 0, usedSick: 0, remain: 15 })
  const [leaveHistory, setLeaveHistory] = useState<{ date: string; type: string; reason: string; status: string }[]>([])
  const [leaveType, setLeaveType] = useState("연차")
  const [leaveDate, setLeaveDate] = useState(todayStr)
  const [leaveReason, setLeaveReason] = useState("")
  const [leaveSubmitting, setLeaveSubmitting] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const tid = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tid)
  }, [])

  const loadButtonState = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    getTodayAttendanceTypes({ storeName: auth.store, name: auth.user }).then(setTodayTypes)
  }, [auth?.store, auth?.user])

  const loadTodayLog = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    const today = todayStr()
    getAttendanceList({
      startDate: today,
      endDate: today,
      storeFilter: auth.store,
      employeeFilter: auth.user,
    }).then(setAttLog)
  }, [auth?.store, auth?.user])

  const loadLeaveInfo = useCallback(() => {
    if (!auth?.store || !auth?.user) return
    getMyLeaveInfo({ store: auth.store, name: auth.user }).then((r) => {
      setLeaveStats(r.stats)
      setLeaveHistory(r.history)
    })
  }, [auth?.store, auth?.user])

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

  const sendAttendance = (type: string) => {
    if (!auth?.store || !auth?.user) return
    const key = ATT_TYPE_TO_KEY[type] || "attIn"
    const msg = t(key as "attIn" | "attOut" | "attBreak" | "attResume") || `${type}하시겠습니까?`
    if (!confirm(msg)) return

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
      })
        .then((res) => {
          const isGpsPending = res.code === "ATT_GPS_PENDING"
          const isDuplicate =
            typeof res.message === "string" &&
            res.message.includes("오늘 이미") &&
            res.message.includes("기록이 있습니다")

          if (isDuplicate) {
            alert(t("attDuplicateOnce"))
            loadButtonState()
            return
          }
          if (!isGpsPending && res.message && (res.message.includes("지각") || res.message.includes("조퇴") || res.message.includes("연장"))) {
            const reason = prompt(t("attReasonPrompt"))
            if (reason) {
              // updateLastReason would need an API - skip for now
            }
          }
          if (isGpsPending) alert(t("attGpsPendingSaved"))
          else alert(res.message || "완료")

          if ((res.message && res.message.includes("✅")) || isGpsPending) {
            loadButtonState()
            loadTodayLog()
          }
        })
        .catch((e) => alert((e instanceof Error ? e.message : String(e)) + "\n" + t("orderFail")))
        .finally(() => setSubmitting(null))
    }

    navigator.geolocation.getCurrentPosition(
      (p) => doSend(p.coords.latitude, p.coords.longitude),
      (e) => {
        if (confirm(gpsFailMsg)) doSend("Unknown", "Unknown")
      },
      options
    )
  }

  const handleRequestLeave = async () => {
    if (!auth?.store || !auth?.user) return
    if (!leaveDate.trim()) {
      alert("날짜를 선택해 주세요.")
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
      })
      if (res.success) {
        alert(res.message || "신청 완료")
        setLeaveReason("")
        loadLeaveInfo()
      } else {
        alert(res.message || "신청 실패")
      }
    } catch (e) {
      alert("오류: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLeaveSubmitting(false)
    }
  }

  const hasClockIn = todayTypes.includes("출근")
  const hasBreak = todayTypes.includes("휴식시작")
  const hasResume = todayTypes.includes("휴식종료")
  const hasClockOut = todayTypes.includes("퇴근")

  if (!auth?.store || !auth?.user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Users className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t("att_select_store_login")}</p>
      </div>
    )
  }

  const formatTime = (iso: string) => {
    if (!iso) return "-"
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className="h-5 w-5 text-primary" />
          <span className="text-2xl font-bold tabular-nums">
            {now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
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
          ) : attLog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-sm text-muted-foreground">
              {t("attHelp")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">{t("time")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("leaveType")}</th>
                    <th className="px-3 py-2 text-left font-medium">{t("attStatusCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {attLog.map((r, i) => {
                    const timePart = formatTime(r.timestamp || "")
                    const isPending =
                      String(r.status || "").includes("위치미확인") ||
                      String(r.status || "").includes("승인대기")
                    return (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{timePart}</td>
                        <td className="px-3 py-2 font-medium">{translateAttType(r.type, t)}</td>
                        <td
                          className={`px-3 py-2 text-xs ${isPending ? "text-amber-600 font-medium" : "text-green-600"}`}
                        >
                          {isPending ? t("attStatusPending") : t("attSuccess")}
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
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("usedAnn")}</p>
              <p className="text-lg font-bold">{leaveStats.usedAnn}</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("usedSick")}</p>
              <p className="text-lg font-bold">{leaveStats.usedSick}</p>
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t("remain")}</p>
              <p className="text-lg font-bold text-primary">{leaveStats.remain}</p>
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
            onChange={(e) => setLeaveType(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="연차">{t("annual")}</option>
            <option value="반차">{t("half")}</option>
            <option value="병가">{t("sick")}</option>
          </select>
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
          {leaveHistory.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t("leaveHistoryEmpty")}</div>
          ) : (
            <div className="space-y-1">
              {leaveHistory.map((h, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2.5"
                >
                  <div>
                    <span className="text-sm font-medium">{h.date}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{translateLeaveType(h.type, t)}</span>
                  </div>
                  <Badge
                    variant={h.status === "승인" || h.status === "Approved" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {translateLeaveStatus(h.status, t)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
