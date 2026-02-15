"use client"

import * as React from "react"
import { Search, CalendarRange, ChevronLeft, ChevronRight, CalendarDays, Printer, FileSpreadsheet, ChevronUp } from "lucide-react"
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
  onStoreChange?: (store: string) => void
}

export function WeeklySchedule({ storeFilter: storeFilterProp = "", storeList: storeListProp = [], onStoreChange }: WeeklyScheduleProps) {
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
  const [hasSearched, setHasSearched] = React.useState(false)
  const [collapsedRows, setCollapsedRows] = React.useState<Set<string>>(new Set())

  const displayStoreList = storeListProp.length > 0 ? storeListProp : storeList
  const isOffice = displayStoreList.length > 1 && ["director", "officer", "ceo", "hr"].includes(auth?.role || "")
  const storeOptions = isOffice ? [t("scheduleStoreAll"), ...displayStoreList.filter((s) => s !== t("scheduleStoreAll") && s !== "All")] : displayStoreList

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
    setHasSearched(true)
    setLoading(true)
    const area = areaFilter === "all" ? undefined : areaFilter === "service" ? "Service" : areaFilter === "kitchen" ? "Kitchen" : "Office"
    store = (store === t("scheduleStoreAll") || store === "All" || store === "전체") ? "All" : store
    const storeParam = store
    getWeeklySchedule({ store: storeParam, monday: date, area })
      .then((list) => setSchedule(list || []))
      .catch(() => setSchedule([]))
      .finally(() => setLoading(false))
  }, [auth?.store, storeFilterFinal, date, areaFilter])

  const handleStoreChange = (v: string) => {
    if (onStoreChange) onStoreChange(v)
    else setStoreFilter(v)
  }

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
    if (r.plan_in_prev_day && r.date) {
      const prevDate = (() => {
        const d = new Date(r.date + "T12:00:00")
        d.setDate(d.getDate() - 1)
        return d.toISOString().slice(0, 10)
      })()
      if (dayStrs.includes(prevDate)) byPerson[key].byDate[prevDate] = r
    }
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

  const handlePrint = () => {
    if (!hasSearched || schedule.length === 0) return
    setCollapsedRows(new Set())
    setTimeout(() => {
    const area = document.getElementById("weekly-schedule-print-area")
    if (!area) return
    const style = document.createElement("style")
    style.id = "schedule-print-style"
    style.textContent = `@media print {
      @page { margin: 0.5in; }
      body * { visibility: hidden; }
      #weekly-schedule-print-area, #weekly-schedule-print-area * { visibility: visible; }
      #weekly-schedule-print-area { position: absolute; left: 0; top: 0; width: 100%; }
      .print\\:hidden { display: none !important; }
      #weekly-schedule-print-area .print-schedule-header {
        text-align: center;
        font-size: 1.2rem;
        font-weight: 800;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
        letter-spacing: 0.03em;
      }
      #weekly-schedule-print-area .print-schedule-header p { margin: 0.4em 0; }
      #weekly-schedule-print-area .print-schedule-wrap { width: 100% !important; min-width: 100% !important; }
      #weekly-schedule-print-area .print-schedule-grid {
        grid-template-columns: 72px repeat(7, 1fr) !important;
        width: 100% !important;
      }
      #weekly-schedule-print-area .print-schedule-person { padding: 4px 6px !important; min-height: 28px !important; gap: 2px !important; }
      #weekly-schedule-print-area .print-schedule-slot { min-height: 24px !important; padding: 2px 4px !important; font-size: 10px !important; }
      #weekly-schedule-print-area .print-schedule-slot-empty { min-height: 24px !important; font-size: 9px !important; }
      #weekly-schedule-print-area .print-schedule-person-name { font-size: 10px !important; }
      #weekly-schedule-print-area .print-schedule-person-area { font-size: 9px !important; }
      #weekly-schedule-print-area .print-schedule-gap { gap: 4px !important; }
      #weekly-schedule-print-area .print-schedule-card { border-radius: 4px !important; }
    }`
    document.head.appendChild(style)
    window.print()
    document.getElementById("schedule-print-style")?.remove()
    }, 50)
  }

  const escapeXml = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const handleExcel = () => {
    if (!hasSearched || schedule.length === 0) return
    const storeLabel = storeFilterFinal === t("scheduleStoreAll") || storeFilterFinal === "All" || !storeFilterFinal ? t("scheduleStoreAll") : storeFilterFinal
    const headers = ["", ...dayLabels.map((d, i) => `${d} ${daysFull[i]}`)]
    const dataRows: string[][] = []
    for (const p of persons) {
      const workRow = [p.name + (showArea ? ` (${areaLabel(p.area)})` : "")]
      const breakRow = [""]
      for (let i = 0; i < 7; i++) {
        workRow.push(p.workDays[i] || "-")
        breakRow.push(p.breakDays[i] ? `R ${p.breakDays[i]}` : "")
      }
      dataRows.push(workRow)
      dataRows.push(breakRow)
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{width:100%;border-collapse:collapse}</style></head>
<body>
<table>
<tr><td class="head">${escapeXml(t("scheduleWeek") || "주간 시간표")}</td><td colspan="7">${escapeXml(weekRangeStr)}</td></tr>
<tr><td class="head">${escapeXml(t("scheduleStorePlaceholder") || "매장")}</td><td colspan="7">${escapeXml(storeLabel)}</td></tr>
<tr></tr>
<tr class="head">${headers.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>
${dataRows.map((row) => `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `schedule_${storeLabel}_${date}.xls`
    a.click()
    URL.revokeObjectURL(url)
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

      {/* Filters - 매장, 날짜, 구역, 검색 */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {storeOptions.length > 0 ? (
          <Select
            value={storeFilterFinal || storeOptions[0] || ""}
            onValueChange={handleStoreChange}
          >
            <SelectTrigger className="h-9 min-w-[120px] rounded-lg text-xs">
              <SelectValue placeholder={t("scheduleStorePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {storeOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
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
        {hasSearched && schedule.length > 0 && (
          <>
            <Button size="sm" variant="outline" className="h-9 rounded-lg px-3 text-xs print:hidden" onClick={handlePrint} title={t("schedulePrintHint") || t("pettyPrintHint")}>
              <Printer className="mr-1 h-3.5 w-3.5" />
              {t("printBtn")}
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg px-3 text-xs print:hidden" onClick={handleExcel} title={t("scheduleExcelHint") || t("pettyExcelHint")}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
              {t("excelBtn")}
            </Button>
          </>
        )}
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

      {!hasSearched ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">{t("scheduleLoadHint")}</p>
        </div>
      ) : loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : schedule.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">{t("scheduleTodayEmpty")}</p>
        </div>
      ) : (
        <>
          <div id="weekly-schedule-print-area">
            {/* 인쇄용 상단 - 매장, 기간 (가운데 정렬, 제목 스타일) */}
            <div className="hidden print:block print-schedule-header border-b border-border pb-3 mb-3 pt-1">
              <p>{t("scheduleStorePlaceholder")}: {storeFilterFinal === t("scheduleStoreAll") || storeFilterFinal === "All" || !storeFilterFinal ? t("scheduleStoreAll") : storeFilterFinal}</p>
              <p>{t("schedulePeriod")}: {weekRangeStr}</p>
            </div>
            {/* 가로 스크롤 영역 - 드래그해서 옆으로 이동 */}
            <div className="overflow-x-auto overscroll-x-contain px-4 pb-4 print:overflow-visible print:px-0">
            <div className="min-w-max print-schedule-wrap">
              {/* 요일 헤더 */}
              <div className="grid gap-1 mb-2 print-schedule-grid" style={{ gridTemplateColumns: "72px repeat(7, minmax(72px, 80px))" }}>
                <div className="shrink-0" />
                {dayLabels.map((day, i) => (
                  <div key={day} className="flex flex-col items-center gap-0.5 shrink-0 min-w-[72px]">
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

              {/* 이름+부서 | 시간표 - 근무시간/쉬는시간 각각 한 줄 */}
              <div className="flex flex-col gap-2 print-schedule-gap">
                {persons.map((p) => {
                  const key = `${p.store}|${p.name}`
                  const isCollapsed = collapsedRows.has(key)
                  return (
                    <div key={key} className="rounded-xl border bg-card overflow-hidden print-schedule-card">
                      <button
                        type="button"
                        onClick={() => toggleRow(key)}
                        className="grid gap-1 w-full items-stretch px-2 py-2.5 text-left active:bg-muted/30 transition-colors print-schedule-grid print-schedule-person"
                        style={{ gridTemplateColumns: "72px repeat(7, minmax(72px, 80px))" }}
                      >
                        {/* 이름 + 부서 + 접기 버튼 */}
                        <div className="flex flex-col items-start justify-center shrink-0 min-w-[72px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-bold text-card-foreground leading-tight print-schedule-person-name">{p.name}</span>
                            {!isCollapsed && (
                              <span className="inline-flex shrink-0" title={t("scheduleCollapseAll") || "접기"}>
                                <ChevronUp
                                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => { e.stopPropagation(); toggleRow(key); }}
                                />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5 print-schedule-person-area">
                            {areaLabel(p.area)}
                          </span>
                        </div>
                        {/* 시간표 7열 - 근무 1줄, 쉬는 1줄 */}
                        {p.workDays.map((workStr, dayIdx) => (
                          <div key={dayIdx} className="flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                            {workStr ? (
                              isCollapsed ? (
                                <div className="h-[44px] w-full rounded-md flex items-center justify-center bg-[hsl(215,80%,50%)]/10 print-schedule-slot">
                                  <div className="h-2 w-2 rounded-full bg-[hsl(215,80%,50%)]" />
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-1 rounded-lg bg-[hsl(215,80%,50%)]/10 px-2 py-2 w-full min-h-[44px] print-schedule-slot">
                                  <span className="text-[12px] font-bold tabular-nums text-[hsl(215,80%,50%)] leading-tight whitespace-nowrap">
                                    {workStr}
                                  </span>
                                  {p.breakDays[dayIdx] ? (
                                    <span className="text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                                      R {p.breakDays[dayIdx]}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground/50 leading-tight">-</span>
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="h-[44px] w-full rounded-md flex items-center justify-center bg-muted/50 print-schedule-slot print-schedule-slot-empty">
                                <span className="text-[11px] font-medium text-muted-foreground">{t("scheduleOff")}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
