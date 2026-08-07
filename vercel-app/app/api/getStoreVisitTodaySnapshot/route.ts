import { NextRequest, NextResponse } from "next/server"
import { supabaseSelect, supabaseSelectFilter } from "@/lib/supabase-server"
import { buildVisitDisplayNameMap, visitDisplayName } from "@/lib/visit-display-name"
import { requireAuth } from "@/lib/verify-auth"
import { isAccountingRole, isOfficeRole } from "@/lib/permissions"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import {
  attendanceBusinessDateStrBangkok,
  attendanceBusinessDayBoundsMs,
  segmentOverlapsAttendanceBusinessDay,
  addDayBangkok,
} from "@/lib/attendance-utils"
import {
  STORE_VISIT_END_TYPES,
  STORE_VISIT_START_TYPES,
  pairVisitEventsForPerson,
  type StoreVisitEventRow,
} from "@/lib/store-visit-pairing"

const TZ = "Asia/Bangkok"

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
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userStore = String(auth.store || "").trim()
  const userRole = String(auth.role || "").toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .concat(userStore)
  const isScopedRole =
    !isOfficeRole(userRole) && !isAccountingRole(userRole) &&
    (userRole.includes("manager") || userRole.includes("franchisee"))
  if (isScopedRole && allowedStores.length === 0) {
    return NextResponse.json(
      { today: attendanceBusinessDateStrBangkok(Date.now()), active: [], segments: [], byStore: [] },
      { status: 403 }
    )
  }

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
    if (isScopedRole && allowedStores.length === 1) {
      filters.push(`store_name=eq.${encodeURIComponent(allowedStores[0])}`)
    }

    const rows = (await supabaseSelectFilter(`store_visits`, filters.join("&"), {
      order: "visit_date.asc,visit_time.asc,created_at.asc",
      limit: 8000,
      select: "visit_date,visit_time,name,store_name,visit_type,purpose,created_at,duration_min",
    })) as (StoreVisitEventRow & { duration_min?: number | string })[]

    const typed = (rows || []).filter((r) => {
      const vt = String(r.visit_type || "")
      if (!(STORE_VISIT_START_TYPES.has(vt) || STORE_VISIT_END_TYPES.has(vt))) return false
      if (!isScopedRole) return true
      const rowStore = String(r.store_name || "").trim()
      return allowedStores.some((s) => storesMatchForGradeLookup(s, rowStore))
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

    for (const name of Array.from(byName.keys()).sort()) {
      const showName = visitDisplayName(name, displayMap)
      const dept = nameToDept[name] || "기타"
      // 사람당 동시 open 1개 + 짧은 간격 동일매장 재시작 무시 → Grace 중복 표시 방지
      const { completed, open } = pairVisitEventsForPerson(byName.get(name)!, {
        personExclusive: true,
      })

      for (const c of completed) {
        if (
          attendanceBusinessDateStrBangkok(c.startMs) === businessToday &&
          segmentOverlapsAttendanceBusinessDay(c.startMs, c.endMs, false, winStart, winEndEx, nowMs)
        ) {
          segmentsOut.push({
            name: showName,
            department: dept,
            store: c.store,
            purpose: c.purpose,
            startAt: toIsoBangkok(c.startMs),
            endAt: toIsoBangkok(c.endMs),
            ongoing: false,
          })
        }
      }

      for (const p of open) {
        if (
          attendanceBusinessDateStrBangkok(p.startMs) === businessToday &&
          segmentOverlapsAttendanceBusinessDay(p.startMs, null, true, winStart, winEndEx, nowMs)
        ) {
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
