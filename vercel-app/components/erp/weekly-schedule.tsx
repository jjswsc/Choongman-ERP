"use client"

import * as React from "react"
import { Search, CalendarRange, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getLoginData, getWeeklySchedule, type WeeklyScheduleItem } from "@/lib/api-client"
import { cn } from "@/lib/utils"

function getMondayOfWeek(d?: Date): string {
  const date = d ? new Date(d) : new Date()
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  const mon = new Date(date)
  mon.setDate(diff)
  return mon.toISOString().slice(0, 10)
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

const zoneStyle: Record<string, string> = {
  Service: "bg-[hsl(215,80%,50%)] text-[hsl(0,0%,100%)]",
  Kitchen: "bg-[hsl(152,60%,42%)] text-[hsl(0,0%,100%)]",
  Office: "bg-muted text-muted-foreground",
}

interface WeeklyScheduleProps {
  storeFilter?: string
  storeList?: string[]
}

export function WeeklySchedule({ storeFilter: storeFilterProp = "", storeList: storeListProp = [] }: WeeklyScheduleProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [storeList, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const storeFilterFinal = storeFilterProp || storeFilter
  const [date, setDate] = React.useState(getMondayOfWeek)
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [schedule, setSchedule] = React.useState<WeeklyScheduleItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [collapsedRows, setCollapsedRows] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (auth?.store && storeListProp.length === 0) {
      getLoginData().then((r) => {
        const stores = Object.keys(r.users || {}).filter(Boolean)
        const isOffice = ["director", "officer", "ceo", "hr"].includes(auth?.role || "")
        if (isOffice) {
          setStoreList([t("scheduleStoreAll"), ...stores].filter(Boolean))
          setStoreFilter(t("scheduleStoreAll"))
        } else {
          setStoreList([auth.store!])
          setStoreFilter(auth.store)
        }
      })
    }
  }, [auth?.store, auth?.role, t, storeListProp.length])

  const loadWeekData = React.useCallback(() => {
    let store = storeFilterFinal || auth?.store
    if (!store) return
    setLoading(true)
    const area = areaFilter === "all" ? undefined : areaFilter === "service" ? "Service" : areaFilter === "kitchen" ? "Kitchen" : "Office"
    store = (store === t("scheduleStoreAll") || store === "All" || store === "전체") ? "All" : store
    const storeParam = store
    getWeeklySchedule({ store: storeParam, monday: date, area })
      .then((list) => setSchedule(list || []))
      .catch(() => setSchedule([]))
      .finally(() => setLoading(false))
  }, [auth?.store, storeFilterFinal, date, areaFilter])

  React.useEffect(() => {
    if (auth?.store) loadWeekData()
  }, [auth?.store, loadWeekData])

  const areaLabel = (ar: string) => {
    if (ar === "Service") return t("scheduleAreaService") || "서비스"
    if (ar === "Kitchen") return t("scheduleAreaKitchen") || "주방"
    if (ar === "Office") return t("scheduleAreaOffice") || "오피스"
    return ar
  }

  const monDate = new Date(date + "T12:00:00")
  const dayStrs: string[] = []
  const dayLabels = [
    t("scheduleMon") || "월",
    t("scheduleTue") || "화",
    t("scheduleWed") || "수",
    t("scheduleThu") || "목",
    t("scheduleFri") || "금",
    t("scheduleSat") || "토",
    t("scheduleSun") || "일",
  ]
  for (let i = 0; i < 7; i++) {
    const d = new Date(monDate.getTime())
    d.setDate(monDate.getDate() + i)
    dayStrs.push(d.toISOString().slice(0, 10))
  }
  const daysFull = dayStrs.map((s) => {
    const [y, m, d] = s.split("-")
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`
  })
  const weekRangeStr = dayStrs.length >= 2
    ? `${dayStrs[0].replace(/-/g, ".")} ~ ${dayStrs[6].slice(5).replace(/-/g, ".")}`
    : ""

  const byPerson: Record<string, { name: string; store: string; area: string; byDate: Record<string, WeeklyScheduleItem> }> = {}
  for (const r of schedule) {
    const key = `${r.store || ""}|${r.name || ""}`
    if (!byPerson[key]) {
      byPerson[key] = { name: r.nick || r.name || "", store: r.store || "", area: r.area || "Service", byDate: {} }
    }
    byPerson[key].byDate[r.date] = r
  }
  const personKeys = Object.keys(byPerson).sort()
  const dailyCount = [0, 0, 0, 0, 0, 0, 0]
  const multiArea = new Set(schedule.map((r) => r.area || "Service")).size > 1
  const showArea = multiArea

  type PersonData = { name: string; store: string; area: string; workDays: string[]; breakDays: string[] }
  const persons: PersonData[] = []
  for (const key of personKeys) {
    const p = byPerson[key]
    const workDays: string[] = []
    const breakDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const row = p.byDate[dayStrs[i]]
      const pIn = row?.pIn ? scheduleTimeOnly(row.pIn) : ""
      const pOut = row?.pOut ? scheduleTimeOnly(row.pOut) : ""
      const workStr = row && (pIn || pOut) ? `${pIn || "-"}-${pOut || "-"}` : ""
      const pBS = row?.pBS ? scheduleTimeOnly(row.pBS) : ""
      const pBE = row?.pBE ? scheduleTimeOnly(row.pBE) : ""
      const breakStr = row && pBS && pBE ? `${pBS}-${pBE}` : ""
      workDays.push(workStr)
      breakDays.push(breakStr)
      if (workStr) dailyCount[i]++
    }
    persons.push({ name: p.name, store: p.store, area: p.area, workDays, breakDays })
  }

  const goPrevWeek = () => {
    const d = new Date(date + "T12:00:00")
    d.setDate(d.getDate() - 7)
    setDate(d.toISOString().slice(0, 10))
  }
  const goNextWeek = () => {
    const d = new Date(date + "T12:00:00")
    d.setDate(d.getDate() + 7)
    setDate(d.toISOString().slice(0, 10))
  }

  const toggleRow = (key: string) => {
    setCollapsedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!auth?.store) return null

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(215,80%,50%)]/10">
          <CalendarRange className="h-[18px] w-[18px] text-[hsl(215,80%,50%)]" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-card-foreground">{t("scheduleWeek")}</h3>
          <p className="text-[11px] text-muted-foreground leading-tight">{t("scheduleWeekHint")}</p>
        </div>
      </div>

      {/* Filters - 매장은 상단에서 선택 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="date-input-compact h-9 flex-1 min-w-[120px] rounded-lg text-xs" />
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
        <Button size="sm" className="h-9 rounded-lg px-3 text-xs font-semibold" onClick={loadWeekData} disabled={loading}>
          <Search className="mr-1 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between border-y bg-muted/20 px-4 py-2.5">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={goPrevWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-bold text-card-foreground">{weekRangeStr}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={goNextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : schedule.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">{t("scheduleLoadHint")}</p>
        </div>
      ) : (
        <>
          {/* 요일 헤더 - 시간표와 같은 8열 그리드로 정렬 */}
          <div className="px-4 pt-3 pb-2">
            <div className="grid grid-cols-8 gap-1">
              <div className="min-w-0" />
              {dayLabels.map((day, i) => (
                <div key={day} className="flex flex-col items-center gap-0.5 min-w-0">
                  <span
                    className={cn(
                      "text-[10px] font-bold",
                      i === 5 ? "text-[hsl(215,80%,50%)]" : i === 6 ? "text-[hsl(0,72%,51%)]" : "text-muted-foreground"
                    )}
                  >
                    {day}
                  </span>
                  <span className="text-[9px] text-muted-foreground/70 tabular-nums">{daysFull[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 이름+부서 | 시간표 2줄 - 8열 그리드 */}
          <div className="flex flex-col gap-2 px-4 pt-0 pb-4">
            {persons.map((p) => {
              const key = `${p.store}|${p.name}`
              const isCollapsed = collapsedRows.has(key)
              return (
                <div key={key} className="overflow-hidden rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => toggleRow(key)}
                    className="grid grid-cols-8 gap-1 w-full items-stretch px-3 py-2 text-left active:bg-muted/30 transition-colors"
                  >
                    {/* 이름 + 부서 */}
                    <div className="flex flex-col items-start justify-center min-w-0">
                      <span className="text-[13px] font-bold text-card-foreground leading-tight">{p.name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">
                        {areaLabel(p.area)}
                      </span>
                    </div>
                    {/* 시간표 7열 - 2줄 */}
                    {p.workDays.map((workStr, dayIdx) => (
                      <div key={dayIdx} className="flex items-center justify-center min-w-0">
                        {workStr ? (
                          isCollapsed ? (
                            <div className="h-[36px] w-full rounded-md flex items-center justify-center bg-[hsl(215,80%,50%)]/10">
                              <div className="h-2 w-2 rounded-full bg-[hsl(215,80%,50%)]" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-[hsl(215,80%,50%)]/10 px-1 py-1.5 w-full min-h-[36px] min-w-0">
                              <span className="text-[10px] font-bold tabular-nums text-[hsl(215,80%,50%)] leading-tight text-center break-all">
                                {workStr}
                              </span>
                              {p.breakDays[dayIdx] && (
                                <span className="text-[9px] text-muted-foreground leading-tight text-center break-all">
                                  R {p.breakDays[dayIdx].split("-")[0]}
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <div className="h-[36px] w-full rounded-md flex items-center justify-center bg-muted/50">
                            <span className="text-[10px] font-medium text-muted-foreground">{t("scheduleOff")}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
