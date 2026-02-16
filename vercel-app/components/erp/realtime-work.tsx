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
import { useStoreList, getTodaySchedule, getTodayAttendanceSummary, type TodayScheduleItem, type TodayAttendanceItem } from "@/lib/api-client"
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

/** 근무=● 파란(정상)/빨간(문제), 휴게=○ 테두리만 */
const WORK_NORMAL = "bg-blue-500"
const WORK_PROBLEM = "bg-red-500"

/** ●/○ 원형 마크 - 시간표 정상=파란, 문제=빨간 */
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
    return <span className="inline-block h-4 w-4 rounded-full border-2 border-muted-foreground/50 flex-shrink-0 bg-transparent" />
  }
  if (fullWork) {
    return <span className={cn("inline-block h-4 w-4 rounded-full flex-shrink-0", workClass)} />
  }
  if (breakFirst && workSecond) {
    return (
      <span className="relative inline-block h-4 w-4 flex-shrink-0">
        <span className="absolute left-0 top-0 h-4 w-[8px] rounded-l-full border-2 border-muted-foreground/50 border-r-0 bg-transparent box-border" />
        <span className={cn("absolute right-0 top-0 h-4 w-[8px] rounded-r-full", workClass)} />
      </span>
    )
  }
  if (workFirst && breakSecond) {
    return (
      <span className="relative inline-block h-4 w-4 flex-shrink-0">
        <span className={cn("absolute left-0 top-0 h-4 w-[8px] rounded-l-full", workClass)} />
        <span className="absolute right-0 top-0 h-4 w-[8px] rounded-r-full border-2 border-muted-foreground/50 border-l-0 bg-transparent box-border" />
      </span>
    )
  }
  if (workFirst && !workSecond) {
    return (
      <span className="relative inline-block h-4 w-4 flex-shrink-0">
        <span className={cn("absolute left-0 top-0 h-4 w-[8px] rounded-l-full", workClass)} />
      </span>
    )
  }
  if (workSecond && !workFirst) {
    return (
      <span className="relative inline-block h-4 w-4 flex-shrink-0">
        <span className={cn("absolute right-0 top-0 h-4 w-[8px] rounded-r-full", workClass)} />
      </span>
    )
  }
  return <span className="inline-block h-4 w-4 flex-shrink-0" />
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
  const [hasSearched, setHasSearched] = React.useState(false)

  const { stores: storeListFromHook } = useStoreList()
  React.useEffect(() => {
    if (auth?.store && storeListProp.length === 0 && storeListFromHook.length > 0) {
      setStoreFilter(auth.store)
      const unique = Array.from(new Set([auth.store, ...storeListFromHook])).filter(Boolean).sort()
      setStoreList(unique)
    }
  }, [auth?.store, storeListProp.length, storeListFromHook])

  const loadTodayData = React.useCallback(() => {
    let store = storeFilterFinal || auth?.store
    if (!store) return
    setHasSearched(true)
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
        <p className="text-center text-sm text-muted-foreground">{t("att_select_store_login")}</p>
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

      {/* Filters - 날짜, 구역, 검색 (사진과 동일) */}
      <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground">{t("dateFrom") || "날짜"}</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-32 rounded-lg text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-muted-foreground">{t("scheduleArea") || "구역"}</label>
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
        </div>
        <Button size="sm" className="h-9 rounded-lg px-4 text-xs font-semibold" onClick={loadTodayData} disabled={loading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {/* 테이블 - 구역 | 이름 | 9시~21시 */}
      <div className="px-4 pb-4">
        {!hasSearched ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">{t("scheduleLoadHint")}</p>
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : filteredSchedule.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">{t("scheduleTodayEmpty")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border">
            <table className="w-full border-collapse text-left">
              {/* 헤더: 구역 | 이름 | 9 | 10 | ... | 21 */}
              <thead>
                <tr className="bg-muted/50">
                  <th className="border-b border-r border-border px-3 py-2.5 text-[11px] font-bold text-muted-foreground w-[72px]">{t("scheduleArea") || "구역"}</th>
                  <th className="border-b border-r border-border px-3 py-2.5 text-[11px] font-bold text-muted-foreground w-[80px]">{t("scheduleName") || "이름"}</th>
                  {hours.map((h) => (
                    <th key={h} className="border-b border-r border-border px-0 py-2 text-center text-[10px] font-bold tabular-nums text-muted-foreground w-[28px] min-w-[28px] last:border-r-0">
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
                  const hasProblem: boolean = !att
                    ? true
                    : Boolean((att.lateMin && att.lateMin > 0) || att.onlyIn || (att.status && /지각|결석|미기록/.test(att.status)))
                  const rowBg = hasProblem ? "bg-red-50/60 dark:bg-red-950/40" : "bg-card"

                  return (
                    <tr key={key} className={cn("border-b border-border last:border-b-0", rowBg)}>
                      <td className="border-r border-border px-2 py-2 align-middle">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold",
                            zoneStyle[p.area] || "bg-muted text-muted-foreground"
                          )}
                        >
                          {areaLabel(p.area)}
                        </span>
                      </td>
                      <td className="border-r border-border px-2 py-2 text-[13px] font-bold text-foreground align-middle">
                        {p.name}
                      </td>
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
                          <td key={h} className="border-r border-border px-0 py-1.5 text-center align-middle last:border-r-0 w-[28px] min-w-[28px]">
                            {inAny ? (
                              <div className="flex justify-center">
                                <ScheduleCellMark
                                  fullBreak={fullBreak}
                                  fullWork={fullWork}
                                  breakFirst={breakFirst}
                                  breakSecond={breakSecond}
                                  workFirst={workFirst}
                                  workSecond={workSecond}
                                  hasProblem={hasProblem}
                                />
                              </div>
                            ) : (
                              <span className="inline-block h-4 w-4" />
                            )}
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
      </div>

      {/* Legend - ● 파란=정상, ● 빨간=문제, ○ 휴게 */}
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-b-2xl border-t bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-blue-500 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleWork")} ● {t("scheduleTodayNormal")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full bg-red-500 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleWork")} ● {t("scheduleTodayProblem")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/50 shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleBreak")} ○</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground">{t("scheduleNotWorking")}</span>
        </div>
      </div>
    </div>
  )
}
