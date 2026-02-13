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

/** 근무=파란(정상)/빨간(문제), 휴게=테두리만 */
const WORK_NORMAL = "bg-blue-500"
const WORK_PROBLEM = "bg-red-500"

/** 휴계·근무 반원 (30분 단위) - 시간표 정상이면 파란, 문제면 빨간 */
function ScheduleCellMark({
  fullBreak,
  fullWork,
  breakFirst,
  breakSecond,
  workFirst,
  workSecond,
  hasProblem,
}: {
  fullBreak: boolean
  fullWork: boolean
  breakFirst: boolean
  breakSecond: boolean
  workFirst: boolean
  workSecond: boolean
  hasProblem: boolean
}) {
  const workClass = hasProblem ? WORK_PROBLEM : WORK_NORMAL
  if (fullBreak) {
    return <span className="inline-block h-[18px] w-[18px] rounded-sm border border-muted-foreground/40 flex-shrink-0 bg-transparent" />
  }
  if (fullWork) {
    return <span className={cn("inline-block h-[18px] w-[18px] rounded-sm flex-shrink-0", workClass)} />
  }
  if (breakFirst && workSecond) {
    return (
      <span className="relative inline-block h-[18px] w-[18px] flex-shrink-0">
        <span className="absolute left-0 top-0 h-[18px] w-[9px] rounded-l-sm border border-muted-foreground/40 border-r-0 bg-transparent box-border" />
        <span className={cn("absolute right-0 top-0 h-[18px] w-[9px] rounded-r-sm", workClass)} />
      </span>
    )
  }
  if (workFirst && breakSecond) {
    return (
      <span className="relative inline-block h-[18px] w-[18px] flex-shrink-0">
        <span className={cn("absolute left-0 top-0 h-[18px] w-[9px] rounded-l-sm", workClass)} />
        <span className="absolute right-0 top-0 h-[18px] w-[9px] rounded-r-sm border border-muted-foreground/40 border-l-0 bg-transparent box-border" />
      </span>
    )
  }
  if (workFirst && !workSecond) {
    return (
      <span className="relative inline-block h-[18px] w-[18px] flex-shrink-0">
        <span className={cn("absolute left-0 top-0 h-[18px] w-[9px] rounded-l-sm", workClass)} />
      </span>
    )
  }
  if (workSecond && !workFirst) {
    return (
      <span className="relative inline-block h-[18px] w-[18px] flex-shrink-0">
        <span className={cn("absolute right-0 top-0 h-[18px] w-[9px] rounded-r-sm", workClass)} />
      </span>
    )
  }
  return <span className="inline-block h-[18px] w-[18px] flex-shrink-0 rounded-sm bg-muted/30" />
}

const zoneStyle: Record<string, string> = {
  Service: "bg-[hsl(215,80%,50%)] text-[hsl(0,0%,100%)]",
  Kitchen: "bg-[hsl(152,60%,42%)] text-[hsl(0,0%,100%)]",
  Office: "bg-muted text-muted-foreground",
}

interface RealtimeWorkProps {
  storeFilter?: string
  storeList?: string[]
}

export function RealtimeWork({ storeFilter: storeFilterProp = "", storeList: storeListProp = [] }: RealtimeWorkProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [storeList, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const storeFilterFinal = storeFilterProp || storeFilter
  const [date, setDate] = React.useState(todayStr)
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [schedule, setSchedule] = React.useState<TodayScheduleItem[]>([])
  const [attendance, setAttendance] = React.useState<TodayAttendanceItem[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (auth?.store && storeListProp.length === 0) {
      setStoreFilter(auth.store)
      getLoginData().then((r) => {
        const stores = Object.keys(r.users || {}).filter(Boolean)
        const unique = Array.from(new Set([auth.store, ...stores])).filter(Boolean).sort()
        setStoreList(unique)
      })
    }
  }, [auth?.store, storeListProp.length])

  const loadTodayData = React.useCallback(() => {
    let store = storeFilterFinal || auth?.store
    if (!store) return
    store = (store === t("scheduleStoreAll") || store === "All" || store === "전체") ? "All" : store
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
  }, [storeFilterFinal, auth?.store, date])

  React.useEffect(() => {
    if (storeFilterFinal || auth?.store) loadTodayData()
  }, [storeFilterFinal, auth?.store, loadTodayData])

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
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="date-input-compact h-9 flex-1 rounded-lg text-xs" />
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

      {/* 시간 상단 + 가로 스크롤 */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : filteredSchedule.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">{t("scheduleTodayEmpty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="min-w-max">
              {/* 시간 기준 - 상단 고정 (시간별 칸) */}
              <div className="flex items-center gap-2 rounded-t-xl border border-b-0 bg-muted/40 px-2 py-2.5">
                <div className="w-[68px] shrink-0" />
                <div className="flex shrink-0">
                  {hours.map((h) => (
                    <div key={h} className="flex flex-col items-center justify-center w-[18px] min-w-[18px] shrink-0 border-r border-border last:border-r-0">
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{h}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 직원별 행 */}
              {personKeys.map((key) => {
                const p = byPerson[key]
                const att = attByKey[key]
                const inDec = parseTimeToDecimal(p.pIn)
                const outDec = parseTimeToDecimal(p.pOut)
                const bsDec = parseTimeToDecimal(p.pBS)
                const beDec = parseTimeToDecimal(p.pBE)
                const hasProblem = !att
                  ? true
                  : (att.lateMin && att.lateMin > 0) || att.onlyIn || (att.status && /지각|결석|미기록/.test(att.status))
                const rowBg = hasProblem ? "bg-red-50/50 dark:bg-red-950/30" : "bg-card"

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center gap-2 rounded-none border border-b last:rounded-b-xl p-2 min-w-0",
                      rowBg
                    )}
                  >
                    {/* 서비스 + 이름 */}
                    <div className="flex items-center gap-1.5 shrink-0 min-w-[68px]">
                      {showArea && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none shrink-0",
                            zoneStyle[p.area] || "bg-muted text-muted-foreground"
                          )}
                        >
                          {areaLabel(p.area)}
                        </span>
                      )}
                      <span className="text-[13px] font-bold text-card-foreground truncate">
                        {p.name}
                      </span>
                    </div>
                    {/* 시간대 슬롯 - 시간별 칸, 파란(정상) 빨간(문제) */}
                    <div className="flex shrink-0">
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
                          <div key={h} className="flex flex-col items-center justify-center shrink-0 w-[18px] min-w-[18px] border-r border-border last:border-r-0 py-1">
                            {inAny ? (
                              <ScheduleCellMark
                                fullBreak={fullBreak}
                                fullWork={fullWork}
                                breakFirst={breakFirst}
                                breakSecond={breakSecond}
                                workFirst={workFirst}
                                workSecond={workSecond}
                                hasProblem={hasProblem}
                              />
                            ) : (
                              <div className="h-[18px] w-[18px] flex items-center justify-center shrink-0 rounded-sm bg-muted/20">
                                <div className="h-[2px] w-[6px] rounded-full bg-border" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend - 파란=정상, 빨간=문제 */}
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-b-2xl border-t bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-blue-500 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleWork")} · {t("scheduleTodayNormal")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-500 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleWork")} · {t("scheduleTodayProblem")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm border border-muted-foreground/40 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleBreak")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-[2px] w-2 rounded-full bg-border shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleNotWorking")}</span>
        </div>
      </div>
    </div>
  )
}
