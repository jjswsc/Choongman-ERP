import { NextRequest, NextResponse } from "next/server"
import { supabaseSelect, supabaseSelectFilter } from "@/lib/supabase-server"
import { buildVisitDisplayNameMap, visitDisplayName } from "@/lib/visit-display-name"
import {
  attendanceBusinessDateStrBangkok,
  attendanceBusinessDayBoundsMs,
  segmentOverlapsAttendanceBusinessDay,
  visitInstantMsBangkok,
  addDayBangkok,
} from "@/lib/attendance-utils"

const TZ = "Asia/Bangkok"
const START_TYPES = new Set(["방문시작", "강제 방문시작"])
const END_TYPES = new Set(["방문종료", "강제 방문종료"])

function toIsoBangkok(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00"
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+07:00`
}

type SnapshotSegment = {
  name: string
  department: string
  store: string
  purpose: string
  startAt: string
  endAt: string | null
  ongoing: boolean
}

type SnapshotActive = {
  name: string
  department: string
  store: string
  purpose: string
  startedAt: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userStore = searchParams.get("userStore")?.trim()
  const userRole = String(searchParams.get("userRole") || "").toLowerCase()

  /** 근태와 동일: 자정~07:59는 전날 근무일. "오늘" 스냅샷 기준일 */
  const businessToday = attendanceBusinessDateStrBangkok(Date.now())
  /** 짝 맞춤용 넉넉한 visit_date 범위 */
  const minD = addDayBangkok(businessToday, -2)
  const maxD = addDayBangkok(businessToday, 2)
  const { startMs: winStart, endMsExclusive: winEndEx } = attendanceBusinessDayBoundsMs(businessToday)
  const nowMs = Date.now()

  try {
    const empList = (await supabaseSelect("employees", { order: "id.asc", select: "store,job,nick,name", limit: 2000 })) as
      | { store?: string; job?: string; nick?: string; name?: string }[]
      | []

    const nameToDept: Record<string, string> = {}
    for (const e of empList || []) {
      const rowDept = String(e.job || "").trim() || "Staff"
      const nick = String(e.nick || "").trim()
      const legal = String(e.name || "").trim()
      if (nick) nameToDept[nick] = rowDept
      if (legal) nameToDept[legal] = rowDept
    }

    const displayMap = buildVisitDisplayNameMap(empList || [])

    const filters = [`visit_date=gte.${minD}`, `visit_date=lte.${maxD}`]
    if (userRole.includes("manager") && userStore) {
      filters.push(`store_name=eq.${encodeURIComponent(userStore)}`)
    }

    const rows = (await supabaseSelectFilter(`store_visits`, filters.join("&"), {
      order: "visit_date.asc,visit_time.asc,created_at.asc",
      limit: 8000,
      select: "visit_date,visit_time,name,store_name,visit_type,purpose,created_at,duration_min",
    })) as {
      visit_date?: string
      visit_time?: string
      name?: string
      store_name?: string
      visit_type?: string
      purpose?: string
      created_at?: string
      duration_min?: number | string
    }[]

    const typed = (rows || []).filter((r) => {
      const vt = String(r.visit_type || "")
      return START_TYPES.has(vt) || END_TYPES.has(vt)
    })

    const byName = new Map<string, typeof typed>()
    for (const r of typed) {
      const n = String(r.name || "").trim()
      if (!n) continue
      if (!byName.has(n)) byName.set(n, [])
      byName.get(n)!.push(r)
    }

    const segmentsOut: SnapshotSegment[] = []
    const activeOut: SnapshotActive[] = []

    type Pending = {
      store: string
      purpose: string
      startMs: number
    }

    for (const name of Array.from(byName.keys()).sort()) {
      const showName = visitDisplayName(name, displayMap)
      const arr = byName.get(name)!
      arr.sort((a, b) => {
        const ma = visitInstantMsBangkok(String(a.visit_date), a.visit_time, a.created_at)
        const mb = visitInstantMsBangkok(String(b.visit_date), b.visit_time, b.created_at)
        if (ma !== mb) return ma - mb
        return String(a.created_at || "").localeCompare(String(b.created_at || ""))
      })

      const pending: Pending[] = []

      for (const row of arr) {
        const vt = String(row.visit_type || "")
        const store = String(row.store_name || "").trim()
        const purpose = String(row.purpose || "").trim() || "기타"

        if (START_TYPES.has(vt)) {
          const startMs = visitInstantMsBangkok(String(row.visit_date), row.visit_time, row.created_at)
          pending.push({ store, purpose, startMs })
          continue
        }

        if (END_TYPES.has(vt)) {
          const endMs = visitInstantMsBangkok(String(row.visit_date), row.visit_time, row.created_at)
          let idx = -1
          for (let i = pending.length - 1; i >= 0; i--) {
            if (pending[i].store === store) {
              idx = i
              break
            }
          }
          if (idx < 0) continue
          const [start] = pending.splice(idx, 1)
          const ongoing = false
          // 방문 시작의 근무일만 스냅샷 일자에 묶음 (예: 22일 02:00 기록 → 근무일 21일 → 22일 당일 탭 제외, 21일 검색에만 표시)
          if (
            attendanceBusinessDateStrBangkok(start.startMs) === businessToday &&
            segmentOverlapsAttendanceBusinessDay(start.startMs, endMs, ongoing, winStart, winEndEx, nowMs)
          ) {
            const dept = nameToDept[name] || "기타"
            segmentsOut.push({
              name: showName,
              department: dept,
              store: start.store,
              purpose: start.purpose,
              startAt: toIsoBangkok(start.startMs),
              endAt: toIsoBangkok(endMs),
              ongoing: false,
            })
          }
        }
      }

      for (const p of pending) {
        if (
          attendanceBusinessDateStrBangkok(p.startMs) === businessToday &&
          segmentOverlapsAttendanceBusinessDay(p.startMs, null, true, winStart, winEndEx, nowMs)
        ) {
          const dept = nameToDept[name] || "기타"
          segmentsOut.push({
            name: showName,
            department: dept,
            store: p.store,
            purpose: p.purpose,
            startAt: toIsoBangkok(p.startMs),
            endAt: null,
            ongoing: true,
          })
          activeOut.push({
            name: showName,
            department: dept,
            store: p.store,
            purpose: p.purpose,
            startedAt: toIsoBangkok(p.startMs),
          })
        }
      }
    }

    activeOut.sort((a, b) => a.name.localeCompare(b.name))
    segmentsOut.sort((a, b) => {
      const ca = a.startAt.localeCompare(b.startAt)
      if (ca !== 0) return ca
      return a.name.localeCompare(b.name)
    })

    const storeKeys = new Set<string>()
    for (const s of segmentsOut) storeKeys.add(s.store)
    for (const a of activeOut) storeKeys.add(a.store)

    const byStore: { store: string; activeCount: number; segmentsTodayCount: number }[] = Array.from(storeKeys)
      .sort()
      .map((store) => ({
        store,
        activeCount: activeOut.filter((a) => a.store === store).length,
        segmentsTodayCount: segmentsOut.filter((s) => s.store === store).length,
      }))

    return NextResponse.json({
      today: businessToday,
      active: activeOut,
      segments: segmentsOut,
      byStore,
    })
  } catch (e) {
    console.error("getStoreVisitTodaySnapshot:", e)
    return NextResponse.json(
      { today: attendanceBusinessDateStrBangkok(Date.now()), active: [], segments: [], byStore: [], error: String(e) },
      { status: 500 }
    )
  }
}
