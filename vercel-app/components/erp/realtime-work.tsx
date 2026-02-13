"use client"

import * as React from "react"
import { Search, Radio, CalendarDays } from "lucide-react"
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
import { getLoginData, getTodaySchedule, getTodayAttendanceSummary, type TodayScheduleItem, type TodayAttendanceItem } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function parseTimeToDecimal(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null
  const match = s.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60
}

/** 휴계·근무 반원 (30분 단위) */
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
    return <span className="inline-block h-[14px] w-[14px] rounded-full border-[2px] border-muted-foreground/30 flex-shrink-0" />
  }
  if (fullWork) {
    return <span className="inline-block h-[14px] w-[14px] rounded-full bg-foreground flex-shrink-0" />
  }
  if (breakFirst && workSecond) {
    return (
      <span className="relative inline-block h-[14px] w-[14px] flex-shrink-0">
        <span className="absolute left-0 top-0 h-[14px] w-[7px] rounded-l-full border-[2px] border-muted-foreground/30 border-r-0 bg-transparent box-border" />
        <span className="absolute right-0 top-0 h-[14px] w-[7px] rounded-r-full bg-foreground" />
      </span>
    )
  }
  if (workFirst && breakSecond) {
    return (
      <span className="relative inline-block h-[14px] w-[14px] flex-shrink-0">
        <span className="absolute left-0 top-0 h-[14px] w-[7px] rounded-l-full bg-foreground" />
        <span className="absolute right-0 top-0 h-[14px] w-[7px] rounded-r-full border-[2px] border-muted-foreground/30 border-l-0 bg-transparent box-border" />
      </span>
    )
  }
  if (workFirst && !workSecond) {
    return (
      <span className="relative inline-block h-[14px] w-[14px] flex-shrink-0">
        <span className="absolute left-0 top-0 h-[14px] w-[7px] rounded-l-full bg-foreground" />
      </span>
    )
  }
  if (workSecond && !workFirst) {
    return (
      <span className="relative inline-block h-[14px] w-[14px] flex-shrink-0">
        <span className="absolute right-0 top-0 h-[14px] w-[7px] rounded-r-full bg-foreground" />
      </span>
    )
  }
  return <span className="inline-block h-[14px] w-[14px] flex-shrink-0" />
}

const zoneStyle: Record<string, string> = {
  Service: "bg-[hsl(215,80%,50%)] text-[hsl(0,0%,100%)]",
  Kitchen: "bg-[hsl(152,60%,42%)] text-[hsl(0,0%,100%)]",
  Office: "bg-muted text-muted-foreground",
}

export function RealtimeWork() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [storeList, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const [date, setDate] = React.useState(todayStr)
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [schedule, setSchedule] = React.useState<TodayScheduleItem[]>([])
  const [attendance, setAttendance] = React.useState<TodayAttendanceItem[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (auth?.store) {
      setStoreFilter(auth.store)
      getLoginData().then((r) => {
        const stores = Object.keys(r.users || {}).filter(Boolean)
        const unique = Array.from(new Set([auth.store, ...stores])).filter(Boolean).sort()
        setStoreList(unique)
      })
    }
  }, [auth?.store])

  const loadTodayData = React.useCallback(() => {
    const store = storeFilter || auth?.store
    if (!store) return
    setLoading(true)
    Promise.all([getTodaySchedule({ store, date }), getTodayAttendanceSummary({ store, date })])
      .then(([sch, att]) => {
        setSchedule(sch || [])
        setAttendance(att || [])
      })
      .catch(() => {
        setSchedule([])
        setAttendance([])
      })
      .finally(() => setLoading(false))
  }, [storeFilter, auth?.store, date])

  React.useEffect(() => {
    if (storeFilter || auth?.store) loadTodayData()
  }, [storeFilter, auth?.store, loadTodayData])

  const filteredSchedule =
    areaFilter === "all"
      ? schedule
      : schedule.filter((r) => (r.area || "Service") === (areaFilter === "service" ? "Service" : areaFilter === "kitchen" ? "Kitchen" : "Office"))
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
  const hours: number[] = []
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
  const showArea = areaFilter === "all" && multiArea

  const areaLabel = (ar: string) => {
    if (ar === "Service") return t("scheduleAreaService") || "서비스"
    if (ar === "Kitchen") return t("scheduleAreaKitchen") || "주방"
    if (ar === "Office") return t("scheduleAreaOffice") || "오피스"
    return ar
  }

  if (!auth?.store) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed py-12">
        <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">매장을 선택하고 로그인해 주세요.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(215,80%,50%)]/10">
          <Radio className="h-[18px] w-[18px] text-[hsl(215,80%,50%)]" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-card-foreground">{t("scheduleToday")}</h3>
          <p className="text-[11px] text-muted-foreground">{t("scheduleCurrentStaff")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 flex-1 rounded-lg text-xs" />
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="h-9 w-24 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("noticeFilterAll")}</SelectItem>
            <SelectItem value="service">{areaLabel("Service")}</SelectItem>
            <SelectItem value="kitchen">{areaLabel("Kitchen")}</SelectItem>
            <SelectItem value="office">{areaLabel("Office")}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 rounded-lg px-3 text-xs font-semibold" onClick={loadTodayData} disabled={loading}>
          <Search className="mr-1 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {/* 서비스 | 이름 | 시간대 일렬 */}
      <div className="flex flex-col gap-2 px-4 pb-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : filteredSchedule.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">{t("scheduleTodayEmpty")}</p>
          </div>
        ) : (
          personKeys.map((key) => {
            const p = byPerson[key]
            const att = attByKey[key]
            const inDec = parseTimeToDecimal(p.pIn)
            const outDec = parseTimeToDecimal(p.pOut)
            const bsDec = parseTimeToDecimal(p.pBS)
            const beDec = parseTimeToDecimal(p.pBE)
            const hasProblem = !att
              ? true
              : (att.lateMin && att.lateMin > 0) || att.onlyIn || (att.status && /지각|결석|미기록/.test(att.status))
            const rowBg = hasProblem ? "bg-red-50 dark:bg-red-950/20" : "bg-card"

            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5 min-w-0",
                  rowBg
                )}
              >
                {/* 서비스 */}
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold leading-none",
                    zoneStyle[p.area] || "bg-muted text-muted-foreground"
                  )}
                >
                  {areaLabel(p.area)}
                </span>
                {/* 이름 */}
                <span className="shrink-0 min-w-[48px] text-[13px] font-bold text-card-foreground truncate">
                  {p.name}
                </span>
                {/* 시간대 - 반원(30분) 슬롯 */}
                <div className="flex flex-1 min-w-0 overflow-x-auto gap-0.5 items-center">
                  {hours.map((h) => {
                    const h0 = h,
                      h05 = h + 0.5,
                      h1 = h + 1
                    const breakFirst = bsDec != null && beDec != null && bsDec < h05 && beDec > h0
                    const breakSecond = bsDec != null && beDec != null && bsDec < h1 && beDec > h05
                    const workFirst = inDec != null && outDec != null && inDec < h05 && outDec > h0 && !breakFirst
                    const workSecond = inDec != null && outDec != null && inDec < h1 && outDec > h05 && !breakSecond
                    const fullBreak = breakFirst && breakSecond
                    const fullWork = workFirst && workSecond
                    const inAny = fullBreak || fullWork || breakFirst || breakSecond || workFirst || workSecond

                    return (
                      <div key={h} className="flex flex-col items-center gap-0.5 shrink-0">
                        {inAny ? (
                          <ScheduleCellMark
                            fullBreak={fullBreak}
                            fullWork={fullWork}
                            breakFirst={breakFirst}
                            breakSecond={breakSecond}
                            workFirst={workFirst}
                            workSecond={workSecond}
                          />
                        ) : (
                          <div className="h-[14px] w-[14px] flex items-center justify-center shrink-0">
                            <div className="h-[3px] w-[8px] rounded-full bg-border" />
                          </div>
                        )}
                        <span className="text-[9px] font-medium tabular-nums text-muted-foreground">{h}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 rounded-b-2xl border-t bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-foreground" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleWork")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/30" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleBreak")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-[3px] w-2.5 rounded-full bg-border" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleNotWorking")}</span>
        </div>
      </div>
    </div>
  )
}
