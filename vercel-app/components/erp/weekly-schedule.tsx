"use client"

import * as React from "react"
import { Search, CalendarRange, ChevronLeft, ChevronRight, CalendarDays, Printer, FileSpreadsheet, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList, getWeeklySchedule, type WeeklyScheduleItem } from "@/lib/api-client"
import { getMondayOfWeekBangkok, addDaysSchedule } from "@/lib/attendance-utils"
import { normalizeEmployeeNameFields } from "@/lib/employee-display-name"
import { cn, displayLabelShort } from "@/lib/utils"
import { hasOfficeStaffScope } from "@/lib/permissions"
import { useAppBrandConfig } from "@/components/app-brand-provider"

/** 인쇄/PDF 상단에 표시 — 방콕(Asia/Bangkok) 기준 */
function formatBangkokDateTimeForPrint(locale: string): string {
  const loc =
    locale === "th" ? "th-TH" : locale === "en" ? "en-US" : locale === "zh" ? "zh-CN" : "ko-KR"
  try {
    return new Intl.DateTimeFormat(loc, {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date())
  }
}

/** 이보다 적게 움직이면 스크롤 드래그로 보지 않음 — 행 접기/펼치기 클릭과 공존 */
const SCHEDULE_SCROLL_DRAG_ARM_PX = 10

function scheduleRowIsLeave(r: WeeklyScheduleItem): boolean {
  const lt = r.leaveType
  return lt != null && String(lt).trim() !== ""
}

/** 스케줄 박스 기준 위로 — 세로로 스크롤 가능한 첫 부모(없으면 문서) */
function findVerticalScrollParent(from: HTMLElement): HTMLElement {
  let el: HTMLElement | null = from
  for (let i = 0; i < 24 && el; i++) {
    const { overflowY } = getComputedStyle(el)
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      el.scrollHeight > el.clientHeight + 2
    ) {
      return el
    }
    el = el.parentElement
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement
}

/** 뷰포트(문서) 스크롤은 일부 환경에서 element.scrollTop 만으로 반영되지 않음 → window.scrollTo 사용 */
function verticalScrollReadWrite(from: HTMLElement): { getTop: () => number; setTop: (top: number) => void } {
  const el = findVerticalScrollParent(from)
  const se = document.scrollingElement as HTMLElement | null
  const isViewport =
    el === se || el === document.documentElement || (document.body && el === document.body)
  if (isViewport) {
    return {
      getTop: () => window.scrollY || document.documentElement.scrollTop || document.body?.scrollTop || 0,
      setTop: (top: number) => {
        window.scrollTo({ top, left: window.scrollX, behavior: "instant" })
      },
    }
  }
  return {
    getTop: () => el.scrollTop,
    setTop: (top: number) => {
      el.scrollTop = top
    },
  }
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

interface WeeklyScheduleProps {
  storeFilter?: string
  storeList?: string[]
  onStoreChange?: (store: string) => void
}

export function WeeklySchedule({ storeFilter: storeFilterProp = "", storeList: storeListProp = [], onStoreChange }: WeeklyScheduleProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const brand = useAppBrandConfig()
  const t = useT(lang)
  const [storeList, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const storeFilterFinal = storeFilterProp || storeFilter
  const [date, setDate] = React.useState(() => getMondayOfWeekBangkok())
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [schedule, setSchedule] = React.useState<WeeklyScheduleItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [collapsedRows, setCollapsedRows] = React.useState<Set<string>>(new Set())

  /**
   * 드래그 스크롤: 가로 → scrollEl.scrollLeft / 세로 → 상위 overflow-y 부모/문서 scrollTop
   * SCHEDULE_SCROLL_DRAG_ARM_PX 이전에는 캡처하지 않아 행 접기/펼치기 클릭과 겹친다.
   * 그 이후에만 setPointerCapture 로 셀 위에서도 move 가 온다.
   */
  const scheduleHScrollRef = React.useRef<HTMLDivElement>(null)
  const suppressScheduleRowClickRef = React.useRef(false)
  const [scheduleHScrollDragging, setScheduleHScrollDragging] = React.useState(false)

  React.useLayoutEffect(() => {
    const node = scheduleHScrollRef.current
    if (!node) return
    /** ref.current 는 클로저에서 null 로 좁혀지지 않아 명시 타입으로 고정 */
    const scrollEl: HTMLDivElement = node

    let activeId: number | null = null
    let startX = 0
    let startY = 0
    let startScroll = 0
    let vScroll: ReturnType<typeof verticalScrollReadWrite> | null = null
    let startScrollTop = 0
    let dragAxisLocked: "h" | "v" | null = null
    let dragArmed = false
    let dragMoved = false
    let uiDragging = false

    let docMove: ((e: PointerEvent) => void) | null = null
    let docUp: ((e: PointerEvent) => void) | null = null
    let onLostCap: ((e: Event) => void) | null = null

    function removeDocPointerTracking() {
      if (docMove) {
        document.removeEventListener("pointermove", docMove)
        docMove = null
      }
      if (docUp) {
        document.removeEventListener("pointerup", docUp)
        document.removeEventListener("pointercancel", docUp)
        docUp = null
      }
      if (onLostCap) {
        scrollEl.removeEventListener("lostpointercapture", onLostCap)
        onLostCap = null
      }
    }

    function endPointerSession(e: PointerEvent) {
      if (activeId == null || e.pointerId !== activeId) return
      activeId = null
      removeDocPointerTracking()
      if (dragArmed) {
        try {
          scrollEl.releasePointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
      }
      if (uiDragging) {
        uiDragging = false
        setScheduleHScrollDragging(false)
      }
      if (dragArmed && dragMoved) suppressScheduleRowClickRef.current = true
      dragMoved = false
      dragArmed = false
      dragAxisLocked = null
    }

    function onLostCapture(e: Event) {
      if (activeId == null) return
      const pe = e as PointerEvent
      if (pe.pointerId !== activeId) return
      endPointerSession(pe)
    }

    function onPointerMoveDoc(e: PointerEvent) {
      if (activeId == null || e.pointerId !== activeId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const canScrollH = scrollEl.scrollWidth > scrollEl.clientWidth + 2

      if (!dragArmed) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SCHEDULE_SCROLL_DRAG_ARM_PX) return
        dragArmed = true
        try {
          scrollEl.setPointerCapture(e.pointerId)
        } catch {
          /* noop */
        }
        onLostCap = onLostCapture
        scrollEl.addEventListener("lostpointercapture", onLostCap)
        if (!canScrollH) dragAxisLocked = "v"
        else {
          const bias = 4
          if (Math.abs(dy) >= Math.abs(dx) + bias) dragAxisLocked = "v"
          else if (Math.abs(dx) >= Math.abs(dy) + bias) dragAxisLocked = "h"
          else dragAxisLocked = Math.abs(dy) >= Math.abs(dx) ? "v" : "h"
        }
      }

      if (dragAxisLocked === null) return
      if (dragAxisLocked === "h") {
        if (!canScrollH) return
        if (Math.abs(dx) <= 2) return
        dragMoved = true
        scrollEl.scrollLeft = startScroll - dx
      } else {
        if (Math.abs(dy) <= 2) return
        dragMoved = true
        if (vScroll) vScroll.setTop(startScrollTop + dy)
      }
      e.preventDefault()
      if (!uiDragging) {
        uiDragging = true
        setScheduleHScrollDragging(true)
      }
    }

    function onPointerDownBubble(e: PointerEvent) {
      if (e.target instanceof Node && !scrollEl.contains(e.target)) return
      if (e.pointerType === "mouse" && e.button !== 0) return
      const t = e.target
      if (t instanceof Element) {
        const tag = t.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return
      }
      activeId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      startScroll = scrollEl.scrollLeft
      vScroll = verticalScrollReadWrite(scrollEl)
      startScrollTop = vScroll.getTop()
      dragAxisLocked = null
      dragArmed = false
      dragMoved = false

      docMove = onPointerMoveDoc
      docUp = endPointerSession
      document.addEventListener("pointermove", docMove, { passive: false })
      document.addEventListener("pointerup", docUp)
      document.addEventListener("pointercancel", docUp)
    }

    function onWheel(e: WheelEvent) {
      if (scrollEl.scrollWidth <= scrollEl.clientWidth + 2) return
      if (e.shiftKey && e.deltaY !== 0) {
        scrollEl.scrollLeft += e.deltaY
        e.preventDefault()
        return
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0) {
        scrollEl.scrollLeft += e.deltaX
        e.preventDefault()
      }
    }

    scrollEl.addEventListener("pointerdown", onPointerDownBubble, { capture: true })
    scrollEl.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      removeDocPointerTracking()
      activeId = null
      scrollEl.removeEventListener("pointerdown", onPointerDownBubble, { capture: true })
      scrollEl.removeEventListener("wheel", onWheel)
    }
  }, [hasSearched, schedule.length, loading])

  const displayStoreList = storeListProp.length > 0 ? storeListProp : storeList
  const isOffice =
    displayStoreList.length > 1 && hasOfficeStaffScope(auth?.role || "", auth?.store)
  const storeOptions = isOffice ? [t("scheduleStoreAll"), ...displayStoreList.filter((s) => s !== t("scheduleStoreAll") && s !== "All")] : displayStoreList

  const { posStores: storeListRaw } = useStoreList()
  React.useEffect(() => {
    if (auth?.store && storeListProp.length === 0 && storeListRaw.length > 0) {
      const isOffice = hasOfficeStaffScope(auth?.role || "", auth?.store)
      if (isOffice) {
        setStoreList([t("scheduleStoreAll"), ...storeListRaw].filter(Boolean))
        setStoreFilter(t("scheduleStoreAll"))
      } else {
        setStoreList([auth.store!])
        setStoreFilter(auth.store)
      }
    }
  }, [auth?.store, auth?.role, t, storeListProp.length, storeListRaw])

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

  const dayStrs = Array.from({ length: 7 }, (_, i) => addDaysSchedule(date, i))
  const dayLabels = [
    t("scheduleMon") || "월",
    t("scheduleTue") || "화",
    t("scheduleWed") || "수",
    t("scheduleThu") || "목",
    t("scheduleFri") || "금",
    t("scheduleSat") || "토",
    t("scheduleSun") || "일",
  ]
  const daysFull = dayStrs.map((s) => {
    const [, m, d] = s.split("-")
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`
  })
  const weekRangeStr = dayStrs.length >= 2
    ? `${dayStrs[0].replace(/-/g, ".")} ~ ${dayStrs[6].slice(5).replace(/-/g, ".")}`
    : ""

  const byPerson: Record<string, { name: string; store: string; area: string; byDate: Record<string, WeeklyScheduleItem> }> = {}
  for (const r of schedule) {
    const st = String(r.store || "").trim()
    const rawName = String(r.name || "").trim()
    const { name: normName } = normalizeEmployeeNameFields(rawName, "")
    const canonical = (normName || rawName).trim() || rawName
    const mergeKey = `${st}|${canonical}`
    if (!byPerson[mergeKey]) {
      byPerson[mergeKey] = {
        name: String(r.nick || canonical || rawName).trim() || rawName,
        store: st,
        area: String(r.area || "Service"),
        byDate: {},
      }
    } else {
      const nk = String(r.nick || "").trim()
      if (nk) byPerson[mergeKey].name = nk
      if (!scheduleRowIsLeave(r)) {
        byPerson[mergeKey].area = String(r.area || byPerson[mergeKey].area || "Service")
      }
    }
    // schedule_date는 근무 시작일. plan_in_prev_day 시 퇴근만 다음날이므로 당일(r.date)에만 표시
    const d = r.date
    const prev = byPerson[mergeKey].byDate[d]
    const incLeave = scheduleRowIsLeave(r)
    const prevLeave = prev ? scheduleRowIsLeave(prev) : false
    if (!prev) {
      byPerson[mergeKey].byDate[d] = r
    } else if (incLeave && !prevLeave) {
      byPerson[mergeKey].byDate[d] = r
    } else if (!incLeave && prevLeave) {
      // 같은 날 휴가가 있으면 근무 행으로 덮어쓰지 않음
    } else {
      byPerson[mergeKey].byDate[d] = r
    }
  }
  const personKeys = Object.keys(byPerson).sort()
  const dailyCount = [0, 0, 0, 0, 0, 0, 0]
  const multiArea = new Set(schedule.map((r) => r.area || "Service")).size > 1
  const showArea = multiArea

  type PersonData = {
    /** 집계 키(store|API name) — 닉네임이 같아도 직원별로 유일 */
    personKey: string
    name: string
    store: string
    area: string
    workDays: string[]
    breakDays: string[]
    leaveDays: (string | undefined)[]
  }
  const persons: PersonData[] = []
  for (const key of personKeys) {
    const p = byPerson[key]
    const workDays: string[] = []
    const breakDays: string[] = []
    const leaveDays: (string | undefined)[] = []
    for (let i = 0; i < 7; i++) {
      const row = p.byDate[dayStrs[i]] as (WeeklyScheduleItem & { leaveType?: string }) | undefined
      const leaveType = row?.leaveType
      leaveDays.push(leaveType)
      if (leaveType) {
        workDays.push("")
        breakDays.push("")
        dailyCount[i]++
        continue
      }
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
    persons.push({ personKey: key, name: p.name, store: p.store, area: p.area, workDays, breakDays, leaveDays })
  }

  // 전체 매장 선택 시 매장별로 그룹화
  const storeFilterIsAll = storeFilterFinal === t("scheduleStoreAll") || storeFilterFinal === "All" || storeFilterFinal === "전체" || !storeFilterFinal
  const personsByStore: { store: string; persons: PersonData[] }[] = []
  if (storeFilterIsAll && persons.length > 0) {
    const byStore: Record<string, PersonData[]> = {}
    for (const p of persons) {
      const st = p.store || ""
      if (!byStore[st]) byStore[st] = []
      byStore[st].push(p)
    }
    const storesSorted = Object.keys(byStore).filter(Boolean).sort()
    for (const st of storesSorted) {
      personsByStore.push({ store: st, persons: byStore[st] })
    }
  } else {
    personsByStore.push({ store: storeFilterFinal, persons })
  }

  const goPrevWeek = () => setDate(addDaysSchedule(date, -7))
  const goNextWeek = () => setDate(addDaysSchedule(date, 7))

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
    const tsEl = document.getElementById("schedule-print-timestamp")
    if (tsEl) tsEl.textContent = formatBangkokDateTimeForPrint(lang)
    const style = document.createElement("style")
    style.id = "schedule-print-style"
    style.textContent = `@media print {
      @page { margin: 0.45in; }
      body * { visibility: hidden; }
      #weekly-schedule-print-area, #weekly-schedule-print-area * { visibility: visible; }
      #weekly-schedule-print-area { position: absolute; left: 0; top: 0; width: 100%; }
      .print\\:hidden { display: none !important; }
      #weekly-schedule-print-area .print-only-report-header {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: linear-gradient(180deg, #f1f5f9 0%, #ffffff 55%);
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 10px 12px 14px;
        margin-bottom: 14px !important;
      }
      #weekly-schedule-print-area .print-report-timestamp {
        font-size: 11px !important;
        font-weight: 700 !important;
        color: #334155 !important;
        letter-spacing: 0.02em;
      }
      #weekly-schedule-print-area .print-brand-title {
        font-size: 15px !important;
        font-weight: 900 !important;
        letter-spacing: 0.14em !important;
        color: #0f172a !important;
        margin: 0 !important;
        font-family: Inter, Pretendard, "Noto Sans KR", "Sukhumvit Set", "Noto Sans Thai", sans-serif !important;
      }
      #weekly-schedule-print-area .print-report-store,
      #weekly-schedule-print-area .print-report-period {
        font-size: 13px !important;
        font-weight: 800 !important;
        color: #1e293b !important;
        line-height: 1.35 !important;
        margin: 0.35em 0 0 !important;
        font-family: Inter, Pretendard, "Noto Sans KR", "Sukhumvit Set", "Noto Sans Thai", sans-serif !important;
      }
      #weekly-schedule-print-area .print-report-period { font-size: 12.5px !important; font-weight: 700 !important; }
      #weekly-schedule-print-area .print-schedule-wrap { width: 100% !important; min-width: 100% !important; }
      #weekly-schedule-print-area .print-schedule-grid {
        grid-template-columns: 96px repeat(7, minmax(0, 1fr)) !important;
        width: 100% !important;
      }
      #weekly-schedule-print-area .print-schedule-col-head-day {
        font-size: 12px !important;
        font-weight: 900 !important;
      }
      #weekly-schedule-print-area .print-schedule-col-head-date {
        font-size: 11px !important;
        font-weight: 700 !important;
        opacity: 1 !important;
        color: #475569 !important;
      }
      #weekly-schedule-print-area .print-schedule-person {
        padding: 6px 8px !important;
        min-height: 34px !important;
        gap: 4px !important;
      }
      #weekly-schedule-print-area .print-schedule-slot {
        min-height: 28px !important;
        padding: 4px 5px !important;
        font-size: 11.5px !important;
      }
      #weekly-schedule-print-area .print-schedule-slot-empty { min-height: 28px !important; font-size: 11px !important; }
      #weekly-schedule-print-area .print-schedule-person-name { font-size: 13px !important; font-weight: 800 !important; color: #0f172a !important; }
      #weekly-schedule-print-area .print-schedule-person-area { font-size: 10.5px !important; font-weight: 600 !important; color: #64748b !important; }
      #weekly-schedule-print-area .print-schedule-gap { gap: 10px !important; }
      #weekly-schedule-print-area .print-schedule-card {
        border-radius: 6px !important;
        border-color: #cbd5e1 !important;
        break-inside: avoid;
      }
      #weekly-schedule-print-area .print-schedule-store-banner {
        font-size: 12.5px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
        padding: 6px 8px !important;
        background: #f1f5f9 !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 6px !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
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
        workRow.push(p.leaveDays?.[i] ? t("scheduleLeave") : (p.workDays[i] || "-"))
        breakRow.push(p.leaveDays?.[i] ? "" : (p.breakDays[i] ? `R ${p.breakDays[i]}` : ""))
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
    <div className="rounded-2xl border bg-card shadow-sm w-full min-w-0 max-w-full">
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

      {/* Filters - 매장, 날짜, 구역, 검색 (한 줄) */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {storeOptions.length > 0 ? (
          <Select
            value={storeFilterFinal || storeOptions[0] || ""}
            onValueChange={handleStoreChange}
          >
            <SelectTrigger className="h-9 w-28 rounded-lg text-xs shrink-0">
              <SelectValue placeholder={t("scheduleStorePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {storeOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Input type="date" value={date} onChange={(e) => setDate(getMondayOfWeekBangkok(e.target.value))} className="date-input-compact h-9 w-36 rounded-lg text-xs shrink-0" />
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
            {/* 인쇄/PDF 전용 — 브랜드·매장·기간·인쇄 시각(방콕) */}
            <div className="hidden print:block print-only-report-header">
              <div className="flex justify-end">
                <span id="schedule-print-timestamp" className="print-report-timestamp tabular-nums text-muted-foreground" />
              </div>
              <div className="text-center px-1">
                <p className="print-brand-title font-black tracking-[0.12em] text-foreground">{brand.appName}</p>
                <p className="print-report-store mt-2 font-bold text-foreground">
                  {t("scheduleStorePlaceholder")}:{" "}
                  {storeFilterFinal === t("scheduleStoreAll") || storeFilterFinal === "All" || !storeFilterFinal
                    ? t("scheduleStoreAll")
                    : storeFilterFinal}
                </p>
                <p className="print-report-period mt-1 font-bold text-foreground tabular-nums">
                  {t("schedulePeriod")}: {weekRangeStr}
                </p>
              </div>
            </div>
            {/* 가로 스크롤 영역 - 마우스로 끌어 스크롤 (행이 button이라 기본 제스처만으로는 불편함) */}
            <div
              ref={scheduleHScrollRef}
              className={cn(
                "min-w-0 w-full max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain px-4 pb-4 [-webkit-overflow-scrolling:touch] print:overflow-visible print:px-0 touch-none select-none",
                scheduleHScrollDragging ? "cursor-grabbing" : "cursor-grab"
              )}
            >
            <div
              className="w-max print:!min-w-0 print:w-full print:max-w-none print-schedule-wrap select-none"
              style={{ minWidth: "max(720px, max-content, calc(100% + 1px))" }}
            >
              {/* 요일 헤더 */}
              <div className="grid gap-1 mb-2 print-schedule-grid" style={{ gridTemplateColumns: "72px repeat(7, minmax(72px, 80px))" }}>
                <div className="shrink-0" />
                {dayLabels.map((day, i) => (
                  <div key={day} className="flex flex-col items-center gap-0.5 shrink-0 min-w-[72px]">
                    <span
                      className={cn(
                        "print-schedule-col-head-day text-[11px] font-extrabold",
                        i === 5 ? "text-[hsl(215,80%,50%)]" : i === 6 ? "text-[hsl(0,72%,51%)]" : "text-muted-foreground"
                      )}
                    >
                      {day}
                    </span>
                    <span className="print-schedule-col-head-date text-[10px] font-semibold text-muted-foreground tabular-nums">
                      {daysFull[i]}
                    </span>
                  </div>
                ))}
              </div>

              {/* 이름+부서 | 시간표 - 근무시간/쉬는시간 각각 한 줄 (매장별 그룹) */}
              <div className="flex flex-col gap-4 print-schedule-gap">
                {personsByStore.map(({ store: storeName, persons: storePersons }) => (
                  <div key={storeName} className="space-y-2">
                    {storeFilterIsAll && storeName && (
                      <div className="print-schedule-store-banner text-sm font-bold text-card-foreground px-2 py-1.5 rounded-lg bg-muted/50 border print:bg-muted/30 print:border-border">
                        {storeName}
                      </div>
                    )}
                    {storePersons.map((p) => {
                  const key = p.personKey
                  const isCollapsed = collapsedRows.has(key)
                  return (
                    <div key={key} className="rounded-xl border bg-card overflow-hidden print-schedule-card">
                      {/* button 대신 div: 버튼은 포인터/드래그가 가로 스크롤과 충돌하는 경우가 많음 */}
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key !== "Enter" && ev.key !== " ") return
                          ev.preventDefault()
                          if (suppressScheduleRowClickRef.current) {
                            suppressScheduleRowClickRef.current = false
                            return
                          }
                          toggleRow(key)
                        }}
                        onClick={() => {
                          if (suppressScheduleRowClickRef.current) {
                            suppressScheduleRowClickRef.current = false
                            return
                          }
                          toggleRow(key)
                        }}
                        className={cn(
                          "grid gap-1 w-full items-stretch px-2 py-2.5 text-left active:bg-muted/30 transition-colors print-schedule-grid print-schedule-person outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          scheduleHScrollDragging ? "cursor-grabbing" : "cursor-grab"
                        )}
                        style={{ gridTemplateColumns: "72px repeat(7, minmax(72px, 80px))" }}
                      >
                        {/* 이름 + 부서 + 접기 버튼 */}
                        <div className="flex flex-col items-start justify-center shrink-0 min-w-[72px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[13px] font-bold text-card-foreground leading-tight print-schedule-person-name">{displayLabelShort(p.name)}</span>
                            {!isCollapsed && (
                              <span className="inline-flex shrink-0" title={t("scheduleCollapseAll") || "접기"}>
                                <ChevronUp
                                  className="h-4 w-4 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (suppressScheduleRowClickRef.current) {
                                      suppressScheduleRowClickRef.current = false
                                      return
                                    }
                                    toggleRow(key)
                                  }}
                                />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5 print-schedule-person-area">
                            {areaLabel(p.area)}
                          </span>
                        </div>
                        {/* 시간표 7열 - 근무 1줄, 쉬는 1줄, 휴가 시 로 표시 */}
                        {p.workDays.map((workStr, dayIdx) => {
                          const leaveType = p.leaveDays?.[dayIdx]
                          return (
                          <div key={dayIdx} className="flex flex-col items-center justify-center shrink-0 min-w-[72px]">
                            {leaveType ? (
                              <div className="h-[44px] w-full rounded-md flex items-center justify-center bg-violet-100 dark:bg-violet-950/50 print-schedule-slot px-1">
                                <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 whitespace-nowrap" title={leaveType}>
                                  {t("scheduleLeave")}
                                </span>
                              </div>
                            ) : workStr ? (
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
                          )
                        })}
                      </div>
                    </div>
                  )
                    })}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
