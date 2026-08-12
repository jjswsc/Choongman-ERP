"use client"

import * as React from "react"
import {
  AdminDesktopOnly,
  AdminMobileOnly,
  AdminTableScroll,
} from "@/components/erp/admin-responsive-list"
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
import { attendanceBusinessDateStrBangkok, todayStrBangkok } from "@/lib/attendance-utils"
import {
  collectRealtimeLinearHourIndices,
  formatRealtimeLinearHourLabel,
  nowDecimalHoursSinceBangkokDateMidnight,
  realtimeSlotPartsForLinearHour,
  type RealtimeScheduleRowInput,
} from "@/lib/realtime-work-grid"
import {
  buildAttendanceSummaryLookupMap,
  canonicalStoreSegmentForJoinKey,
  findAttendanceForRealtimeScheduleRow,
} from "@/lib/today-realtime-join"
import { useErpPolling, useErpTabActive } from "@/lib/erp-page-visibility"
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameForGradeMatch } from "@/lib/employee-display-name"
import { cn } from "@/lib/utils"

/** 기본 조회일 = 근태 근무일(방콕 00~07시는 전날) */
function todayStr() {
  return attendanceBusinessDateStrBangkok(Date.now())
}

function parseTimeToDecimal(s: string | null | undefined): number | null {
  if (!s || typeof s !== "string") return null
  const match = s.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60
}

/**
 * getTodayAttendanceSummary 행: 당일 실시간 격자의 행·칸 톤용.
 * 퇴근 전·퇴근미기록·outTimeStr 미기록 은 **파랑** — onlyIn 누락·캐시 깨짐 시에도 late_min 만으로 빨강 안 나게 한다.
 */
function attendanceSummaryIndicatesProblem(att: TodayAttendanceItem): boolean {
  if (att.onlyIn === true) return false
  const outRaw = String(att.outTimeStr ?? "")
    .trim()
    .toLowerCase()
  if (!outRaw || outRaw === "미기록" || outRaw === "-" || outRaw === "n/a") return false

  const s = String(att.status ?? "")
    .trim()
    .replace(/\s+/g, " ")
  if (s.includes("퇴근") && s.includes("미기록")) return false
  if (s.includes("퇴근미기록")) return false
  if (/^정상/.test(s)) return false

  const lm = Number(att.lateMin)
  if (Number.isFinite(lm) && lm > 0) return true
  if (!s) return false
  if (/지각|결석|조퇴|휴게초과/.test(s)) return true
  if (s.includes("미기록") && !s.includes("퇴근")) return true
  return false
}

/** 근무=● 파란(정상)/빨간(문제)/미출근·중립(흰+테두리), 휴게=○ 테두리만 */
const WORK_NORMAL = "bg-blue-500"
const WORK_PROBLEM = "bg-red-500"
const WORK_PENDING = "bg-white border border-muted-foreground/40 dark:bg-card dark:border-muted-foreground/50"

type WorkMarkTone = "pending" | "normal" | "problem"

function workClassForTone(tone: WorkMarkTone): string {
  if (tone === "problem") return WORK_PROBLEM
  if (tone === "pending") return WORK_PENDING
  return WORK_NORMAL
}

/** 출근 기록 없을 때: 예정 출근 시각 이전·당일 미래 칸은 중립, 지난 칸은 문제(빨강). 과거 날은 근무 칸 전부 문제. */
function workToneWithoutAttendance(params: {
  viewingDate: string
  planInDec: number | null
  planOutDec: number | null
  /** 자정 넘김 격자 열(0~47) — viewingDate 자정부터 선형 */
  linearK: number
  /** 방콕 기준 viewingDate 자정부터 경과(h). 당일(달력)일 때만 */
  nowHoursSinceViewingMidnight: number | null
}): WorkMarkTone {
  const { viewingDate, planInDec, planOutDec, linearK, nowHoursSinceViewingMidnight } = params
  if (planInDec == null || planOutDec == null) return "pending"
  const today = todayStrBangkok()
  if (viewingDate > today) return "pending"
  if (viewingDate < today) return "problem"
  if (nowHoursSinceViewingMidnight == null) return "pending"
  if (nowHoursSinceViewingMidnight < planInDec) return "pending"
  if (linearK < nowHoursSinceViewingMidnight) return "problem"
  return "pending"
}

/** ●/○ 원형 마크 — 출근 전은 중립(흰), 출근 후 정상=파랑, 문제=빨강 */
function ScheduleCellMark({
  fullBreak,
  fullWork,
  breakFirst,
  breakSecond,
  workFirst,
  workSecond,
  workTone,
}: {
  fullBreak: boolean
  fullWork: boolean
  breakFirst: boolean
  breakSecond: boolean
  workFirst: boolean
  workSecond: boolean
  workTone: WorkMarkTone
}) {
  const workClass = workClassForTone(workTone)
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

function personMergeKeyForRealtimeRow(s: TodayScheduleItem): string {
  const storeSeg = canonicalStoreSegmentForJoinKey(String(s.store || "").trim())
  const code = normalizeEmployeeCodeForMatch(String(s.employeeCode ?? ""))
  if (code) return `${storeSeg}|c:${code}`
  const idNum = s.employeeId != null && Number.isFinite(Number(s.employeeId)) ? Math.floor(Number(s.employeeId)) : 0
  if (idNum > 0) return `${storeSeg}|id:${idNum}`
  const raw = String(s.name || s.nick || "").trim()
  const normalized = normalizeEmployeeNameForGradeMatch(raw)
  return `${storeSeg}|n:${normalized || raw}`
}

export function RealtimeWork({ storeFilter: storeFilterProp = "", storeList: storeListProp = [] }: RealtimeWorkProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tabActive = useErpTabActive()
  const [, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const storeFilterFinal = storeFilterProp || storeFilter
  const [date, setDate] = React.useState(todayStr)
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [schedule, setSchedule] = React.useState<TodayScheduleItem[]>([])
  const [attendance, setAttendance] = React.useState<TodayAttendanceItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [queriedStore, setQueriedStore] = React.useState("")

  const { posStores: storeListFromHook, resolveStoreKey, formatStoreLabel } = useStoreList()
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
    setLoadError(null)
    // "All" / 전체 / i18n 라벨 — t를 deps에 넣지 않아 언어 함수 참조 변경으로 재조회가 반복되지 않게 함
    const allLabel = String(t("scheduleStoreAll") || "").trim()
    store =
      store === "All" || store === "전체" || (allLabel && store === allLabel) ? "All" : store
    if (store !== "All") {
      store = resolveStoreKey(store) || store
    }
    setQueriedStore(store)
    setLoading(true)
    // 한쪽만 실패해도 스케줄은 유지 (이전엔 Promise.all로 전부 빈 화면)
    Promise.allSettled([
      getTodaySchedule({ store, date }),
      getTodayAttendanceSummary({ store, date }),
    ])
      .then(([schRes, attRes]) => {
        const errors: string[] = []
        if (schRes.status === "fulfilled") {
          setSchedule(schRes.value || [])
        } else {
          setSchedule([])
          errors.push(schRes.reason instanceof Error ? schRes.reason.message : String(schRes.reason || "schedule"))
        }
        if (attRes.status === "fulfilled") {
          setAttendance(attRes.value || [])
        } else {
          setAttendance([])
          errors.push(attRes.reason instanceof Error ? attRes.reason.message : String(attRes.reason || "attendance"))
        }
        setLoadError(errors.length > 0 ? errors.join(" · ") : null)
      })
      .finally(() => setLoading(false))
  }, [storeFilterFinal, auth?.store, date, t, resolveStoreKey])

  // 매장·날짜 준비되면 자동 조회 (모바일에서 검색 버튼 없이 바로 보이게)
  React.useEffect(() => {
    if (!(storeFilterFinal || auth?.store)) return
    loadTodayData()
  }, [loadTodayData, storeFilterFinal, auth?.store])

  // 관리자 숨은 탭 → 당일 탭으로 돌아올 때 강제 재조회(폰 keep-alive)
  const wasTabActiveRef = React.useRef(tabActive)
  React.useEffect(() => {
    if (tabActive && !wasTabActiveRef.current && (storeFilterFinal || auth?.store)) {
      loadTodayData()
    }
    wasTabActiveRef.current = tabActive
  }, [tabActive, loadTodayData, storeFilterFinal, auth?.store])

  // 당일 조회 중일 때 실시간 반영: 60초마다 출퇴근 데이터 재조회(관리자 트래픽 절감)
  const isViewingToday = date === todayStr() || date === todayStrBangkok()
  useErpPolling(loadTodayData, 60 * 1000, {
    enabled: hasSearched && isViewingToday,
    refetchOnActivate: true,
  })

  const filteredSchedule =
    areaFilter === "all"
      ? schedule
      : schedule.filter((r) => (r.area || "Service") === (areaFilter === "service" ? "Service" : areaFilter === "kitchen" ? "Kitchen" : "Office"))
  const attLookup = buildAttendanceSummaryLookupMap(attendance)

  const byPerson: Record<
    string,
    {
      joinKey: string
      name: string
      scheduleName: string
      nick: string
      store: string
      employeeCode?: string
      employeeId?: number
      area: string
      pIn: string
      pOut: string
      pBS: string
      pBE: string
      leaveType?: string
      plan_in_prev_day?: boolean
    }
  > = {}
  for (const s of filteredSchedule) {
    const sn = String(s.name || "").trim()
    const nk = String(s.nick || "").trim()
    const mergeKey = personMergeKeyForRealtimeRow(s)
    const key = s.joinKey || `${s.store}|${sn}`
    const rowValue = {
      joinKey: key,
      name: s.nick || s.name,
      scheduleName: sn,
      nick: nk,
      store: s.store,
      employeeCode: s.employeeCode,
      employeeId: s.employeeId,
      area: s.area || "Service",
      pIn: s.pIn,
      pOut: s.pOut,
      pBS: s.pBS,
      pBE: s.pBE,
      leaveType: s.leaveType,
      plan_in_prev_day: s.plan_in_prev_day,
    }
    const existing = byPerson[mergeKey]
    if (!existing) {
      byPerson[mergeKey] = rowValue
      continue
    }
    const incomingIsLeave = !!s.leaveType
    const existingIsLeave = !!existing.leaveType
    if (incomingIsLeave && !existingIsLeave) {
      byPerson[mergeKey] = rowValue
      continue
    }
    if (!incomingIsLeave && existingIsLeave) {
      continue
    }
    byPerson[mergeKey] = {
      ...existing,
      ...rowValue,
      joinKey: rowValue.joinKey || existing.joinKey,
      employeeCode: rowValue.employeeCode || existing.employeeCode,
      employeeId: rowValue.employeeId || existing.employeeId,
      leaveType: rowValue.leaveType || existing.leaveType,
    }
  }

  const rowInputsForHours: RealtimeScheduleRowInput[] = filteredSchedule.map((s) => ({
    leaveType: s.leaveType,
    pIn: s.pIn,
    pOut: s.pOut,
    pBS: s.pBS,
    pBE: s.pBE,
    plan_in_prev_day: s.plan_in_prev_day,
  }))
  let hours = collectRealtimeLinearHourIndices(rowInputsForHours)
  if (hours.length === 0 && filteredSchedule.length > 0) {
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
    hours = []
    for (let h = hourStart; h < hourEnd; h++) hours.push(h)
  }

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

      {/* 테이블 / 모바일 카드 */}
      <div className="px-4 pb-4">
        {queriedStore ? (
          <p className="mb-2 text-[10px] text-muted-foreground">
            {t("store")}:{" "}
            <span className="font-medium text-foreground">
              {queriedStore === "All"
                ? t("store_all_stores") || t("scheduleStoreAll") || "All"
                : formatStoreLabel(queriedStore) || queriedStore}
            </span>
            {" · "}
            {date}
          </p>
        ) : null}
        {loadError ? (
          <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        ) : null}
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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3 h-8 text-xs"
              onClick={loadTodayData}
            >
              {t("search")}
            </Button>
          </div>
        ) : (
          <>
            <AdminMobileOnly className="divide-y divide-border/60 rounded-xl border border-border/60">
              {personKeys.map((key) => {
                const p = byPerson[key]
                const isLeave = !!p.leaveType
                const att = findAttendanceForRealtimeScheduleRow(attendance, attLookup, {
                  joinKey: p.joinKey,
                  store: p.store,
                  employeeCode: p.employeeCode,
                  employeeId: p.employeeId,
                  scheduleName: p.scheduleName,
                  nick: p.nick,
                  displayLabel: p.name,
                })
                const inDec = parseTimeToDecimal(p.pIn)
                const dateKey = String(date ?? "").trim().slice(0, 10)
                const todayKey = todayStrBangkok().trim().slice(0, 10)
                const nowH =
                  dateKey === todayKey ? nowDecimalHoursSinceBangkokDateMidnight(dateKey) : null
                const hasProblem = !isLeave && !!att && attendanceSummaryIndicatesProblem(att)
                const noShow =
                  !isLeave && !att && inDec != null && nowH != null && nowH >= inDec
                const statusTone = isLeave
                  ? "leave"
                  : hasProblem || noShow
                    ? "problem"
                    : att
                      ? "normal"
                      : "pending"
                return (
                  <div key={key} className="space-y-1.5 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.store}
                          {" · "}
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold",
                              zoneStyle[p.area] || "bg-muted text-muted-foreground"
                            )}
                          >
                            {areaLabel(p.area)}
                          </span>
                        </p>
                      </div>
                      {isLeave ? (
                        <span className="shrink-0 rounded bg-violet-200 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-800 dark:text-violet-200">
                          {t("scheduleLeave")}
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            statusTone === "problem" && "bg-red-500/15 text-red-700 dark:text-red-300",
                            statusTone === "normal" && "bg-blue-500/15 text-blue-700 dark:text-blue-300",
                            statusTone === "pending" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {statusTone === "problem"
                            ? t("scheduleTodayProblem")
                            : statusTone === "normal"
                              ? t("scheduleTodayNormal")
                              : t("scheduleTodayPending")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {p.pIn || "-"} – {p.pOut || "-"}
                      {p.pBS && p.pBE ? ` · ${t("scheduleBreak")} ${p.pBS}–${p.pBE}` : ""}
                    </p>
                    {att ? (
                      <p className="text-[11px] tabular-nums text-foreground/90">
                        {att.inTimeStr || "-"}
                        {att.outTimeStr ? ` → ${att.outTimeStr}` : ""}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </AdminMobileOnly>
            <AdminDesktopOnly>
          <AdminTableScroll
            className="overscroll-x-contain rounded-xl border"
            hint={false}
            lockViewport={false}
          >
            <table className="w-full border-collapse text-left">
              {/* 헤더: 구역 | 이름 | 9 | 10 | ... | 21 */}
              <thead>
                <tr className="bg-muted/50">
                  <th className="border-b border-r border-border px-3 py-2.5 text-[11px] font-bold text-muted-foreground w-[72px]">{t("scheduleArea") || "구역"}</th>
                  <th className="border-b border-r border-border px-3 py-2.5 text-[11px] font-bold text-muted-foreground w-[80px]">{t("scheduleName") || "이름"}</th>
                  {hours.map((h) => (
                    <th key={h} className="border-b border-r border-border px-0 py-2 text-center text-[10px] font-bold tabular-nums text-muted-foreground w-[28px] min-w-[28px] last:border-r-0">
                      {formatRealtimeLinearHourLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  /** input[type=date] 값과 방콕 오늘을 동일 규칙(YYYY-MM-DD)으로만 비교 — 엄격 === 오판 방지 */
                  const dateKey = String(date ?? "")
                    .trim()
                    .slice(0, 10)
                  const todayKey = todayStrBangkok().trim().slice(0, 10)
                  const nowHoursSinceViewingMidnight =
                    dateKey === todayKey ? nowDecimalHoursSinceBangkokDateMidnight(dateKey) : null
                  return personKeys.map((key) => {
                  const p = byPerson[key]
                  const isLeave = !!p.leaveType
                  /** 스케줄 표시(nick)·출근 요약(풀네임)·joinKey 불일치 보강 — @/lib/today-realtime-join */
                  const att = findAttendanceForRealtimeScheduleRow(attendance, attLookup, {
                    joinKey: p.joinKey,
                    store: p.store,
                    employeeCode: p.employeeCode,
                    employeeId: p.employeeId,
                    scheduleName: p.scheduleName,
                    nick: p.nick,
                    displayLabel: p.name,
                  })
                  const inDec = parseTimeToDecimal(p.pIn)
                  const outDec = parseTimeToDecimal(p.pOut)
                  const slotRow: RealtimeScheduleRowInput = {
                    leaveType: p.leaveType,
                    pIn: p.pIn,
                    pOut: p.pOut,
                    pBS: p.pBS,
                    pBE: p.pBE,
                    plan_in_prev_day: p.plan_in_prev_day,
                  }
                  // 휴가일: 보라 배경. 미출근: 예정 출근 전·당일 미래 칸 중립, 지난 칸 빨강. 출근 후 정상=파랑(퇴근미기록 포함), 지각 등만 빨강
                  const hasProblem: boolean =
                    !isLeave && !!att && attendanceSummaryIndicatesProblem(att)
                  /** 출근 있을 때만 행 단위 톤(미출근은 칸별 workToneWithoutAttendance) */
                  const attWorkTone: WorkMarkTone = !att ? "normal" : hasProblem ? "problem" : "normal"
                  const rowBg = isLeave
                    ? "bg-violet-50/80 dark:bg-violet-950/40"
                    : hasProblem
                      ? "bg-red-50/60 dark:bg-red-950/40"
                      : "bg-white dark:bg-card"

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
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {p.name}
                          {isLeave && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200">
                              {t("scheduleLeave")}
                            </span>
                          )}
                        </span>
                      </td>
                      {isLeave ? (
                        hours.map((h) => (
                          <td key={h} className="border-r border-border px-0 py-1.5 text-center align-middle last:border-r-0 w-[28px] min-w-[28px]">
                            <span className="inline-block h-4 w-4" />
                          </td>
                        ))
                      ) : hours.map((h) => {
                        const {
                          fullBreak,
                          fullWork,
                          breakFirst,
                          breakSecond,
                          workFirst,
                          workSecond,
                          inAny,
                        } = realtimeSlotPartsForLinearHour(h, slotRow)
                        const cellWorkTone: WorkMarkTone = att
                          ? attWorkTone
                          : workToneWithoutAttendance({
                                viewingDate: date,
                                planInDec: inDec,
                                planOutDec: outDec,
                                linearK: h,
                                nowHoursSinceViewingMidnight,
                              })

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
                                  workTone={cellWorkTone}
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
                })
                })()}
              </tbody>
            </table>
          </AdminTableScroll>
            </AdminDesktopOnly>
          </>
        )}
      </div>

      {/* Legend - ● 흰=출근 전 예정, 파란=정상, 빨간=문제, ○ 휴게 */}
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-b-2xl border-t bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/45 bg-white dark:bg-card shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground">
            {t("scheduleWork")} ● {t("scheduleTodayPending")}
          </span>
        </div>
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
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200">{t("scheduleLeave")}</span>
        </div>
      </div>
    </div>
  )
}
