"use client"

import React, { useEffect, useState, useCallback } from "react"
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
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getLoginData,
  getTodaySchedule,
  getTodayAttendanceSummary,
  getWeeklySchedule,
  getMyAttendanceSummary,
  type TodayScheduleItem,
  type TodayAttendanceItem,
  type WeeklyScheduleItem,
  type MyAttendanceSummary,
} from "@/lib/api-client"
import { Search, Timer, CalendarDays, UserCheck, Clock } from "lucide-react"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getMondayOfWeek(d?: Date): string {
  const date = d ? new Date(d) : new Date()
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(date)
  mon.setDate(diff)
  return mon.toISOString().slice(0, 10)
}

function getMonthOptions(count = 24): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    out.push({ value: `${y}-${m}`, label: `${y}-${m}` })
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function parseTimeToDecimal(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null
  const match = s.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60
}

/** 휴계·근무 반원을 휴계처럼 정확히 절반으로 표시 (12px 기준 좌/우 6px) */
function ScheduleCellMark({
  fullBreak,
  fullWork,
  breakFirst,
  breakSecond,
  workFirst,
  workSecond,
}: {
  fullBreak: boolean
  fullWork: boolean
  breakFirst: boolean
  breakSecond: boolean
  workFirst: boolean
  workSecond: boolean
}) {
  if (fullBreak) {
    return (
      <span className="inline-block size-3 rounded-full border border-foreground/70 bg-transparent" />
    )
  }
  if (fullWork) {
    return <span className="text-foreground">●</span>
  }
  if (breakFirst && workSecond) {
    return (
      <span className="relative inline-block h-3 w-3">
        <span className="absolute left-0 top-0 h-3 w-[6px] rounded-l-full border border-foreground/70 border-r-0 bg-transparent box-border" />
        <span className="absolute right-0 top-0 h-3 w-[6px] rounded-r-full bg-foreground" />
      </span>
    )
  }
  if (workFirst && breakSecond) {
    return (
      <span className="relative inline-block h-3 w-3">
        <span className="absolute left-0 top-0 h-3 w-[6px] rounded-l-full bg-foreground" />
        <span className="absolute right-0 top-0 h-3 w-[6px] rounded-r-full border border-foreground/70 border-l-0 bg-transparent box-border" />
      </span>
    )
  }
  if (workFirst && !workSecond) {
    return (
      <span className="relative inline-block h-3 w-3">
        <span className="absolute left-0 top-0 h-3 w-[6px] rounded-l-full bg-foreground" />
      </span>
    )
  }
  if (workSecond && !workFirst) {
    return (
      <span className="relative inline-block h-3 w-3">
        <span className="absolute right-0 top-0 h-3 w-[6px] rounded-r-full bg-foreground" />
      </span>
    )
  }
  return null
}

function scheduleTimeOnly(v: string | null | undefined): string {
  if (v == null || (typeof v === "string" && !v.trim())) return ""
  const s = String(v).trim()
  const match = s.match(/(\d{1,2}):(\d{2})/)
  if (match) return ("0" + match[1]).slice(-2) + ":" + match[2]
  if (s.indexOf("T") !== -1) {
    const tPart = s.split("T")[1]
    if (tPart) {
      const m = tPart.match(/(\d{1,2}):(\d{2})/)
      if (m) return ("0" + m[1]).slice(-2) + ":" + m[2]
    }
  }
  return s.length >= 5 && s.charAt(2) === ":" ? s.substring(0, 5) : s
}

function WeekScheduleTable({
  list,
  weekMonday,
  areaLabel,
  t,
}: {
  list: WeeklyScheduleItem[]
  weekMonday: string
  areaLabel: (ar: string) => string
  t: (k: string) => string
}) {
  const monDate = new Date(weekMonday + "T12:00:00")
  if (isNaN(monDate.getTime())) return null
  const dayStrs: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate.getTime())
    d.setDate(monDate.getDate() + i)
    dayStrs.push(d.toISOString().slice(0, 10))
  }
  const dayLabels = [
    t("scheduleMon") || "월", t("scheduleTue") || "화", t("scheduleWed") || "수",
    t("scheduleThu") || "목", t("scheduleFri") || "금", t("scheduleSat") || "토", t("scheduleSun") || "일",
  ]
  const byPerson: Record<string, { name: string; store: string; area: string; byDate: Record<string, WeeklyScheduleItem> }> = {}
  for (const r of list) {
    const key = `${r.store || ""}|${r.name || ""}`
    if (!byPerson[key]) {
      byPerson[key] = { name: r.nick || r.name || "", store: r.store || "", area: r.area || "Service", byDate: {} }
    }
    byPerson[key].byDate[r.date] = r
  }
  const personKeys = Object.keys(byPerson).sort()
  const dailyCount = [0, 0, 0, 0, 0, 0, 0]
  const multiArea = new Set(list.map((r) => r.area || "Service")).size > 1
  const showArea = multiArea

  type PersonRow = { name: string; store: string; area: string; workDays: string[]; breakDays: string[]; offCount: number; workCount: number }
  const persons: PersonRow[] = []
  for (const key of personKeys) {
    const p = byPerson[key]
    const workDays: string[] = []
    const breakDays: string[] = []
    let offCount = 0
    for (let i = 0; i < 7; i++) {
      const row = p.byDate[dayStrs[i]]
      const pIn = row?.pIn ? scheduleTimeOnly(row.pIn) : ""
      const pOut = row?.pOut ? scheduleTimeOnly(row.pOut) : ""
      const workStr = row && (pIn || pOut) ? `${pIn || "-"}-${pOut || "-"}` : "OFF"
      const pBS = row?.pBS ? scheduleTimeOnly(row.pBS) : ""
      const pBE = row?.pBE ? scheduleTimeOnly(row.pBE) : ""
      const breakStr = row && pBS && pBE ? `${pBS}-${pBE}` : "-"
      workDays.push(workStr)
      breakDays.push(breakStr)
      if (workStr === "OFF") offCount++
      else dailyCount[i]++
    }
    persons.push({
      name: p.name,
      store: p.store,
      area: p.area,
      workDays,
      breakDays,
      offCount,
      workCount: 7 - offCount,
    })
  }

  return (
    <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {showArea && (
              <th className="min-w-[42px] px-2 py-2 text-center font-medium">{t("scheduleArea") || "구역"}</th>
            )}
            <th className="min-w-[52px] px-2 py-2 text-center font-medium">{t("scheduleName") || "이름"}</th>
            {dayLabels.map((l, i) => (
              <th key={i} className="min-w-[58px] px-2 py-2 text-center font-medium">
                {l}
              </th>
            ))}
            <th className="min-w-[36px] px-2 py-2 text-center font-medium">{t("scheduleOff") || "휴무"}</th>
            <th className="min-w-[48px] px-2 py-2 text-center font-medium">{t("scheduleWorkingDay") || "근무일"}</th>
          </tr>
        </thead>
        <tbody>
          {persons.map((p, idx) => (
            <React.Fragment key={idx}>
              <tr className="border-b border-border/60">
                {showArea && (
                  <td className="px-2 py-1.5 text-center bg-blue-50 dark:bg-blue-950/20">{areaLabel(p.area)}</td>
                )}
                <td className="px-2 py-1.5 text-center font-semibold whitespace-nowrap bg-blue-50 dark:bg-blue-950/20">{p.name}</td>
                {p.workDays.map((w, i) => (
                  <td key={i} className="px-2 py-1.5 text-center bg-blue-50 dark:bg-blue-950/20">{w === "OFF" ? (t("scheduleOff") || "휴무") : w}</td>
                ))}
                <td className="px-2 py-1.5 text-center bg-blue-50 dark:bg-blue-950/20">{p.offCount}</td>
                <td className="px-2 py-1.5 text-center bg-blue-50 dark:bg-blue-950/20">{p.workCount}</td>
              </tr>
              <tr className="border-b border-border/60 last:border-0">
                {showArea && <td className="px-2 py-1 text-center bg-muted/30" />}
                <td className="px-2 py-1 text-center text-muted-foreground text-[11px] bg-muted/30">{t("scheduleBreakTime") || "휴게"}</td>
                {p.breakDays.map((b, i) => (
                  <td key={i} className="px-2 py-1 text-center text-muted-foreground text-[11px] bg-muted/30">{b}</td>
                ))}
                <td className="px-2 py-1 text-center bg-muted/30" />
                <td className="px-2 py-1 text-center bg-muted/30" />
              </tr>
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/50 font-semibold">
            {showArea && <td className="px-2 py-2 text-center" />}
            <td className="px-2 py-2 text-center">{t("scheduleDailyStaff") || "일일인원"}</td>
            {dailyCount.map((c, i) => (
              <td key={i} className="px-2 py-2 text-center">{c}</td>
            ))}
            <td className="px-2 py-2 text-center" />
            <td className="px-2 py-2 text-center" />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function MyAttendanceSummaryTable({ data, t }: { data: MyAttendanceSummary; t: (k: string) => string }) {
  return (
    <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
      <table className="w-full min-w-[280px] border-collapse text-xs">
        <tbody>
          <tr className="border-b border-border/60 bg-blue-50 dark:bg-blue-950/20">
            <td className="px-3 py-2.5 text-center">{t("scheduleNormalDays") || "정상출근"}</td>
            <td className="px-3 py-2.5 text-center font-semibold min-w-[48px]">{data.normalDays}</td>
          </tr>
          <tr className="border-b border-border/60">
            <td className="px-3 py-2.5 text-center">{t("scheduleOtHours") || "초과근무"} / {t("scheduleOtDays") || "초과일"}</td>
            <td className="px-3 py-2.5 text-center font-semibold min-w-[48px]">{data.otHours} h / {data.otDays}</td>
          </tr>
          <tr className="border-b border-border/60 bg-blue-50 dark:bg-blue-950/20">
            <td className="px-3 py-2.5 text-center">{t("scheduleLateMin") || "지각(분)"} / {t("scheduleLateDays") || "지각일"}</td>
            <td className="px-3 py-2.5 text-center font-semibold min-w-[48px]">{data.lateMinutes} min / {data.lateDays}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function TimesheetTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [storeList, setStoreList] = useState<string[]>([])
  const [storeFilter, setStoreFilter] = useState("")
  const [scheduleDate, setScheduleDate] = useState(todayStr)
  const [areaFilter, setAreaFilter] = useState("All")
  const [schedule, setSchedule] = useState<TodayScheduleItem[]>([])
  const [attendance, setAttendance] = useState<TodayAttendanceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [weekMonday, setWeekMonday] = useState(getMondayOfWeek)
  const [weekAreaFilter, setWeekAreaFilter] = useState("All")
  const [weekSchedule, setWeekSchedule] = useState<WeeklyScheduleItem[]>([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [myMonth, setMyMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [mySummary, setMySummary] = useState<MyAttendanceSummary | null>(null)
  const [myLoading, setMyLoading] = useState(false)

  useEffect(() => {
    if (auth?.store) {
      setStoreFilter(auth.store)
      getLoginData().then((r) => {
        const stores = Object.keys(r.users || {}).filter(Boolean)
        const unique = Array.from(new Set([auth.store, ...stores])).filter(Boolean).sort()
        setStoreList(unique)
      })
    }
  }, [auth?.store])

  const loadTodayData = useCallback(() => {
    const store = storeFilter || auth?.store
    if (!store) return
    setLoading(true)
    Promise.all([
      getTodaySchedule({ store, date: scheduleDate }),
      getTodayAttendanceSummary({ store, date: scheduleDate }),
    ])
      .then(([sch, att]) => {
        setSchedule(sch || [])
        setAttendance(att || [])
      })
      .catch(() => {
        setSchedule([])
        setAttendance([])
      })
      .finally(() => setLoading(false))
  }, [storeFilter, auth?.store, scheduleDate])

  useEffect(() => {
    if (storeFilter || auth?.store) loadTodayData()
  }, [storeFilter, auth?.store, loadTodayData])

  const loadWeekData = useCallback(() => {
    const store = storeFilter || auth?.store
    if (!store) return
    setWeekLoading(true)
    getWeeklySchedule({
      store,
      monday: weekMonday,
      area: weekAreaFilter === "All" ? undefined : weekAreaFilter,
    })
      .then((list) => setWeekSchedule(list || []))
      .catch(() => setWeekSchedule([]))
      .finally(() => setWeekLoading(false))
  }, [storeFilter, auth?.store, weekMonday, weekAreaFilter])

  const loadMyAttendance = useCallback(() => {
    const store = auth?.store
    const name = auth?.user
    if (!store || !name) return
    setMyLoading(true)
    getMyAttendanceSummary({ store, name, yearMonth: myMonth })
      .then((data) => setMySummary(data))
      .catch(() => setMySummary(null))
      .finally(() => setMyLoading(false))
  }, [auth?.store, auth?.user, myMonth])

  useEffect(() => {
    if (auth?.store && auth?.user) loadMyAttendance()
  }, [auth?.store, auth?.user, loadMyAttendance])

  const filteredSchedule =
    areaFilter === "All"
      ? schedule
      : schedule.filter((r) => (r.area || "Service") === areaFilter)

  const attByKey: Record<string, TodayAttendanceItem> = {}
  for (const a of attendance) {
    attByKey[`${a.store}|${a.name}`] = a
  }

  const byPerson: Record<string, { name: string; store: string; area: string; pIn: string; pOut: string; pBS: string; pBE: string }> = {}
  for (const s of filteredSchedule) {
    const key = `${s.store}|${s.name}`
    byPerson[key] = {
      name: s.nick || s.name,
      store: s.store,
      area: s.area || "Service",
      pIn: s.pIn,
      pOut: s.pOut,
      pBS: s.pBS,
      pBE: s.pBE,
    }
  }

  let minDec = 24,
    maxDec = 0
  for (const p of Object.values(byPerson)) {
    const inD = parseTimeToDecimal(p.pIn),
      outD = parseTimeToDecimal(p.pOut),
      bsD = parseTimeToDecimal(p.pBS),
      beD = parseTimeToDecimal(p.pBE)
    if (inD != null && inD < minDec) minDec = inD
    if (bsD != null && bsD < minDec) minDec = bsD
    if (outD != null && outD > maxDec) maxDec = outD
    if (beD != null && beD > maxDec) maxDec = beD
  }
  const hourStart = minDec <= maxDec ? Math.max(0, Math.floor(minDec)) : 6
  const hourEnd = minDec <= maxDec ? Math.min(24, Math.ceil(maxDec) + 1) : 24
  const hours = []
  for (let h = hourStart; h < hourEnd; h++) hours.push(h)

  const areaOrder: Record<string, number> = { Service: 0, Kitchen: 1, Office: 2 }
  const personKeys = Object.keys(byPerson).sort((a, b) => {
    const pA = byPerson[a],
      pB = byPerson[b]
    const oA = areaOrder[pA.area] ?? 3
    const oB = areaOrder[pB.area] ?? 3
    if (oA !== oB) return oA - oB
    const inA = parseTimeToDecimal(pA.pIn) ?? 0
    const inB = parseTimeToDecimal(pB.pIn) ?? 0
    return inA - inB
  })

  const multiArea = new Set(filteredSchedule.map((r) => r.area || "Service")).size > 1
  const showArea = areaFilter === "All" && multiArea

  const areaLabel = (ar: string) => {
    if (ar === "Service") return t("scheduleAreaService") || "서비스"
    if (ar === "Kitchen") return t("scheduleAreaKitchen") || "주방"
    if (ar === "Office") return t("scheduleAreaOffice") || "오피스"
    return ar
  }

  if (!auth?.store) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">매장을 선택하고 로그인해 주세요.</p>
      </div>
    )
  }

  const effectiveStore = storeFilter || auth?.store || ""

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 매장 선택 - 상단 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground shrink-0">{t("store")}</span>
        <Select value={effectiveStore} onValueChange={setStoreFilter}>
          <SelectTrigger className="h-9 flex-1 max-w-[200px] text-sm">
            <SelectValue placeholder={t("scheduleStorePlaceholder") || "전체 매장"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t("scheduleStoreAll") || "전체 매장"}</SelectItem>
            {storeList.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 px-4 font-medium" onClick={loadTodayData} disabled={loading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("search")}
        </Button>
      </div>

      {/* 당일 실시간 근무 - 테이블 형식 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Timer className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("scheduleToday") || "당일 실시간 근무"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("dateFrom") || "날짜"}</span>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="h-9 max-w-[140px] text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("scheduleArea") || "구역"}</span>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger className="h-9 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t("noticeFilterAll") || "전체"}</SelectItem>
                  <SelectItem value="Service">{areaLabel("Service")}</SelectItem>
                  <SelectItem value="Kitchen">{areaLabel("Kitchen")}</SelectItem>
                  <SelectItem value="Office">{areaLabel("Office")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 font-medium" onClick={loadTodayData} disabled={loading}>
              <Search className="mr-1 h-3.5 w-3.5" />
              {loading ? t("loading") : t("search")}
            </Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : filteredSchedule.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">{t("scheduleTodayEmpty") || "해당 날짜·매장에 시간표가 없습니다."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full min-w-[320px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {showArea && (
                      <th className="min-w-[52px] px-2 py-2 text-center font-medium">{t("scheduleArea") || "구역"}</th>
                    )}
                    <th className="min-w-[80px] px-2 py-2 text-center font-medium">{t("scheduleName") || "이름"}</th>
                    {hours.map((h) => (
                      <th key={h} className="min-w-[26px] px-1 py-2 text-center text-[11px]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personKeys.map((key) => {
                    const p = byPerson[key]
                    const att = attByKey[key]
                    const inDec = parseTimeToDecimal(p.pIn)
                    const outDec = parseTimeToDecimal(p.pOut)
                    const bsDec = parseTimeToDecimal(p.pBS)
                    const beDec = parseTimeToDecimal(p.pBE)
                    const hasProblem = !att
                      ? true
                      : (att.lateMin && att.lateMin > 0) ||
                        att.onlyIn ||
                        (att.status && /지각|결석|미기록/.test(att.status))
                    const rowBg = hasProblem ? "bg-red-100 dark:bg-red-950/30" : "bg-blue-50 dark:bg-blue-950/20"

                    return (
                      <tr key={key} className="border-b border-border/60 last:border-0">
                        {showArea && (
                          <td className={`px-2 py-1.5 text-center ${rowBg}`}>{areaLabel(p.area)}</td>
                        )}
                        <td className={`px-2 py-1.5 text-center font-semibold whitespace-nowrap ${rowBg}`}>
                          {p.name}
                        </td>
                        {hours.map((h) => {
                          const h0 = h,
                            h05 = h + 0.5,
                            h1 = h + 1
                          const breakFirst =
                            bsDec != null && beDec != null && bsDec < h05 && beDec > h0
                          const breakSecond =
                            bsDec != null && beDec != null && bsDec < h1 && beDec > h05
                          const workFirst =
                            inDec != null &&
                            outDec != null &&
                            inDec < h05 &&
                            outDec > h0 &&
                            !breakFirst
                          const workSecond =
                            inDec != null &&
                            outDec != null &&
                            inDec < h1 &&
                            outDec > h05 &&
                            !breakSecond
                          const fullBreak = breakFirst && breakSecond
                          const fullWork = workFirst && workSecond
                          const inAny = fullBreak || fullWork || breakFirst || breakSecond || workFirst || workSecond

                          return (
                            <td
                              key={h}
                              className={`min-w-[26px] px-1 py-1 text-center ${inAny ? rowBg : ""}`}
                            >
                              {inAny ? (
                                <ScheduleCellMark
                                  fullBreak={fullBreak}
                                  fullWork={fullWork}
                                  breakFirst={breakFirst}
                                  breakSecond={breakSecond}
                                  workFirst={workFirst}
                                  workSecond={workSecond}
                                />
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">● 근무 · ○ 휴게</p>
        </CardContent>
      </Card>

      {/* 주간 시간표 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("scheduleWeek") || "주간 시간표"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t("scheduleWeekHint") || "관리자 페이지와 동일한 직원시간표를 조회합니다. 기준 월요일 선택 후 검색하세요."}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("schedulePeriod") || "기간"}</span>
              <Input
                type="date"
                value={weekMonday}
                onChange={(e) => setWeekMonday(e.target.value)}
                className="h-9 max-w-[130px] text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("scheduleArea") || "구역"}</span>
              <Select value={weekAreaFilter} onValueChange={setWeekAreaFilter}>
                <SelectTrigger className="h-9 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t("noticeFilterAll") || "전체"}</SelectItem>
                  <SelectItem value="Service">{areaLabel("Service")}</SelectItem>
                  <SelectItem value="Kitchen">{areaLabel("Kitchen")}</SelectItem>
                  <SelectItem value="Office">{areaLabel("Office")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9 font-medium" onClick={loadWeekData} disabled={weekLoading}>
              <Search className="mr-1 h-3.5 w-3.5" />
              {weekLoading ? t("loading") : t("search")}
            </Button>
          </div>
          {weekLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : weekSchedule.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">{t("scheduleLoadHint") || "검색 버튼을 눌러 조회하세요"}</p>
            </div>
          ) : (
            <WeekScheduleTable list={weekSchedule} weekMonday={weekMonday} areaLabel={areaLabel} t={t} />
          )}
        </CardContent>
      </Card>

      {/* 내 출퇴근 기록 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("scheduleMyPunch") || "내 출퇴근 기록"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Select value={myMonth} onValueChange={setMyMonth}>
              <SelectTrigger className="h-9 flex-1 max-w-[160px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMonthOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 font-medium" onClick={loadMyAttendance} disabled={myLoading}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              {myLoading ? t("loading") : t("search")}
            </Button>
          </div>
          {myLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : mySummary === null ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">{t("scheduleMyPunchHint") || "월 선택 후 검색"}</p>
            </div>
          ) : (
            <MyAttendanceSummaryTable data={mySummary} t={t} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
