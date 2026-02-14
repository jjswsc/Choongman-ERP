"use client"

import * as React from "react"
import {
  Search,
  UserCheck,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMyAttendanceSummary,
  getAttendanceList,
  getMyLeaveInfo,
  type MyAttendanceSummary,
  type AttendanceLogItem,
  type LeaveHistoryItem,
} from "@/lib/api-client"

const DAY_KEYS = ["scheduleSun", "scheduleMon", "scheduleTue", "scheduleWed", "scheduleThu", "scheduleFri", "scheduleSat"] as const

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

function getMonthRange(yearMonth: string): { start: string; end: string } {
  const m = yearMonth.trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) return { start: "", end: "" }
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const start = `${y}-${String(mo).padStart(2, "0")}-01`
  const lastDay = new Date(y, mo, 0).getDate()
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { start, end }
}

function getAllDaysInMonth(yearMonth: string): { date: string; day: number }[] {
  const m = yearMonth.trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) return []
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10) - 1
  const days: { date: string; day: number }[] = []
  const d = new Date(y, mo, 1)
  while (d.getMonth() === mo) {
    const dateStr = d.toISOString().slice(0, 10)
    const day = d.getDay() // 0=Sun, 6=Sat
    days.push({ date: dateStr, day })
    d.setDate(d.getDate() + 1)
  }
  return days
}

function toTimeStr(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    const h = d.getHours()
    const m = d.getMinutes()
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  } catch {
    return ""
  }
}

function formatWorkHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

type DailyStatus = "normal" | "late" | "absent" | "holiday" | "leave"

interface DailyRecord {
  date: string
  day: string
  dayIndex: number // 0=Sun, 6=Sat
  clockIn: string | null
  clockOut: string | null
  status: DailyStatus
  workHours: string | null
  overtime: string | null
}

function buildDailyRecords(
  yearMonth: string,
  logs: AttendanceLogItem[],
  leaveDates: Set<string>,
  t: (k: string) => string
): DailyRecord[] {
  const days = getAllDaysInMonth(yearMonth)
  const byDate: Record<
    string,
    {
      clockIn: string | null
      clockOut: string | null
      lateMin: number
      otMin: number
    }
  > = {}

  for (const log of logs) {
    const ts = log.timestamp
    const dateStr = ts.slice(0, 10)
    const type = log.type
    if (!byDate[dateStr]) {
      byDate[dateStr] = { clockIn: null, clockOut: null, lateMin: 0, otMin: 0 }
    }
    const rec = byDate[dateStr]
    if (type === "출근") {
      rec.clockIn = rec.clockIn || toTimeStr(ts)
      rec.lateMin = Math.max(rec.lateMin, log.late_min ?? 0)
    } else if (type === "퇴근") {
      rec.clockOut = toTimeStr(ts)
      rec.otMin = Math.max(rec.otMin, log.ot_min ?? 0)
    }
  }

  return days.map(({ date, day }) => {
    const dayName = t(DAY_KEYS[day])
    const isWeekend = day === 0 || day === 6
    const isLeave = leaveDates.has(date)
    const rec = byDate[date]

    if (isWeekend && !rec) {
      return {
        date: `${date.slice(5, 7)}/${date.slice(8, 10)}`,
        day: dayName,
        dayIndex: day,
        clockIn: null,
        clockOut: null,
        status: "holiday" as DailyStatus,
        workHours: null,
        overtime: null,
      }
    }
    if (isLeave && !rec) {
      return {
        date: `${date.slice(5, 7)}/${date.slice(8, 10)}`,
        day: dayName,
        dayIndex: day,
        clockIn: null,
        clockOut: null,
        status: "leave" as DailyStatus,
        workHours: null,
        overtime: null,
      }
    }
    if (!rec || !rec.clockIn) {
      return {
        date: `${date.slice(5, 7)}/${date.slice(8, 10)}`,
        day: dayName,
        dayIndex: day,
        clockIn: null,
        clockOut: null,
        status: (isWeekend ? "holiday" : isLeave ? "leave" : "absent") as DailyStatus,
        workHours: null,
        overtime: null,
      }
    }

    const clockIn = rec.clockIn
    const clockOut = rec.clockOut
    const lateMin = rec.lateMin
    const otMin = rec.otMin

    // Compute work hours from clock in/out (approximate)
    let workMin = 0
    if (clockIn && clockOut) {
      const [inH, inM] = clockIn.split(":").map(Number)
      const [outH, outM] = clockOut.split(":").map(Number)
      workMin = outH * 60 + outM - (inH * 60 + inM)
      if (workMin < 0) workMin += 24 * 60
    }
    const workHours = workMin > 0 ? formatWorkHours(workMin) : null
    const overtime =
      otMin > 0 ? formatWorkHours(otMin) : workMin > 8 * 60 ? formatWorkHours(workMin - 8 * 60) : null

    const status: DailyStatus =
      lateMin > 0 ? "late" : clockOut ? "normal" : "absent"

    return {
      date: `${date.slice(5, 7)}/${date.slice(8, 10)}`,
      day: dayName,
      dayIndex: day,
      clockIn,
      clockOut: clockOut || null,
      status,
      workHours,
      overtime: otMin > 0 ? formatWorkHours(otMin) : overtime,
    }
  })
}

const statusConfig: Record<
  DailyStatus,
  { labelKey: string; bg: string; text: string; dot: string }
> = {
  normal: {
    labelKey: "scheduleStatusNormal",
    bg: "bg-[hsl(152,60%,42%)]/10",
    text: "text-[hsl(152,60%,42%)]",
    dot: "bg-[hsl(152,60%,42%)]",
  },
  late: {
    labelKey: "scheduleStatusLate",
    bg: "bg-[hsl(38,92%,50%)]/10",
    text: "text-[hsl(38,92%,50%)]",
    dot: "bg-[hsl(38,92%,50%)]",
  },
  absent: {
    labelKey: "scheduleStatusAbsent",
    bg: "bg-[hsl(0,72%,51%)]/10",
    text: "text-[hsl(0,72%,51%)]",
    dot: "bg-[hsl(0,72%,51%)]",
  },
  holiday: {
    labelKey: "scheduleStatusHoliday",
    bg: "bg-muted",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  leave: {
    labelKey: "scheduleStatusLeave",
    bg: "bg-[hsl(215,80%,50%)]/10",
    text: "text-[hsl(215,80%,50%)]",
    dot: "bg-[hsl(215,80%,50%)]",
  },
}

export function MyAttendance() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tRef = React.useRef(t)
  tRef.current = t

  const [myMonth, setMyMonth] = React.useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [summary, setSummary] = React.useState<MyAttendanceSummary | null>(null)
  const [dailyRecords, setDailyRecords] = React.useState<DailyRecord[]>([])
  const [loading, setLoading] = React.useState(false)

  const loadData = React.useCallback(() => {
    const store = auth?.store
    const name = auth?.user
    if (!store || !name) return
    setLoading(true)
    const { start, end } = getMonthRange(myMonth)
    if (!start || !end) {
      setLoading(false)
      return
    }
    const leaveSet = new Set<string>()
    const apiPromise = Promise.all([
      getMyAttendanceSummary({ store, name, yearMonth: myMonth }),
      getAttendanceList({
        startDate: start,
        endDate: end,
        storeFilter: store,
        employeeFilter: name,
      }),
      getMyLeaveInfo({ store, name }),
    ])
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 18000)
    )
    Promise.race([apiPromise, timeoutPromise])
      .then(([sum, logs, leaveInfo]) => {
        setSummary(sum)
        const history = (leaveInfo?.history || []) as LeaveHistoryItem[]
        for (const h of history) {
          if (h.date && (h.status === "승인" || h.status === "Approved")) {
            leaveSet.add(h.date)
          }
        }
        const records = buildDailyRecords(myMonth, logs || [], leaveSet, tRef.current)
        setDailyRecords(records)
      })
      .catch(() => {
        setSummary(null)
        setDailyRecords([])
      })
      .finally(() => setLoading(false))
  }, [auth?.store, auth?.user, myMonth])

  React.useEffect(() => {
    if (auth?.store && auth?.user) loadData()
  }, [auth?.store, auth?.user, loadData])

  if (!auth?.store || !auth?.user) return null

  const stats = [
    {
      label: t("scheduleNormalDays"),
      value: String(summary?.normalDays ?? 0),
      sub: "일",
      icon: CheckCircle2,
      color: "text-[hsl(152,60%,42%)]",
      bgColor: "bg-[hsl(152,60%,42%)]/10",
    },
    {
      label: t("scheduleOtHours"),
      value: `${summary?.otHours ?? 0}h`,
      sub: `/ ${summary?.otDays ?? 0}일`,
      icon: TrendingUp,
      color: "text-[hsl(215,80%,50%)]",
      bgColor: "bg-[hsl(215,80%,50%)]/10",
    },
    {
      label: t("scheduleLateMin").replace(/\(.*\)/, "").trim(),
      value: String(summary?.lateMinutes ?? 0),
      sub: `분 / ${summary?.lateDays ?? 0}일`,
      icon: AlertTriangle,
      color: "text-[hsl(38,92%,50%)]",
      bgColor: "bg-[hsl(38,92%,50%)]/10",
    },
  ]

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(152,60%,42%)]/10">
          <UserCheck className="h-[18px] w-[18px] text-[hsl(152,60%,42%)]" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-card-foreground">
            {t("scheduleMyPunch")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {t("scheduleMonthView")}
          </p>
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Select value={myMonth} onValueChange={setMyMonth}>
          <SelectTrigger className="h-9 flex-1 text-xs rounded-lg">
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
        <Button
          size="sm"
          className="h-9 rounded-lg px-3 text-xs font-semibold"
          onClick={loadData}
          disabled={loading}
        >
          <Search className="mr-1 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-px border-t border-b bg-border">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1.5 bg-card py-4 px-2"
          >
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl",
                stat.bgColor
              )}
            >
              <stat.icon className={cn("h-[18px] w-[18px]", stat.color)} />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span
                className={cn(
                  "text-xl font-extrabold tabular-nums",
                  stat.color
                )}
              >
                {stat.value}
              </span>
              {stat.sub && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {stat.sub}
                </span>
              )}
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Daily records */}
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("scheduleDetail")}
        </span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground px-4">
          {t("loading")}
        </div>
      ) : dailyRecords.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 mx-4 mb-4 text-center">
          <p className="text-xs text-muted-foreground">{t("scheduleMyPunchHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 px-4 pb-4 pt-2">
          {dailyRecords.map((record) => {
            const config = statusConfig[record.status]
            return (
              <div
                key={record.date}
                className={cn(
                  "rounded-xl border px-3 py-3 transition-colors",
                  record.status === "holiday"
                    ? "bg-muted/30 border-transparent"
                    : "bg-card"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Date block */}
                  <div className="flex flex-col items-center w-10 shrink-0">
                    <span className="text-[13px] font-extrabold tabular-nums text-card-foreground leading-none">
                      {record.date.split("/")[1]}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-bold mt-0.5",
                        record.dayIndex === 6
                          ? "text-[hsl(215,80%,50%)]"
                          : record.dayIndex === 0
                          ? "text-[hsl(0,72%,51%)]"
                          : "text-muted-foreground"
                      )}
                    >
                      {record.day}
                    </span>
                  </div>

                  {/* Status pill */}
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-[10px] font-bold leading-none",
                      config.bg,
                      config.text
                    )}
                  >
                    {t(config.labelKey)}
                  </span>

                  {/* Clock in/out */}
                  <div className="flex-1 min-w-0">
                    {record.clockIn ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1">
                          <div className="h-[6px] w-[6px] rounded-full bg-[hsl(152,60%,42%)]" />
                          <span className="text-[12px] font-bold tabular-nums text-card-foreground">
                            {record.clockIn}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/50">
                          {">"}
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="h-[6px] w-[6px] rounded-full bg-[hsl(0,72%,51%)]" />
                          <span className="text-[12px] font-bold tabular-nums text-card-foreground">
                            {record.clockOut ?? "-"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* Work hours */}
                  <div className="shrink-0 text-right">
                    {record.workHours ? (
                      <div className="flex flex-col items-end">
                        <span className="text-[12px] font-bold tabular-nums text-card-foreground leading-none">
                          {record.workHours}
                        </span>
                        {record.overtime && (
                          <span className="mt-1 text-[9px] font-bold tabular-nums text-[hsl(215,80%,50%)] leading-none">
                            +{record.overtime}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
