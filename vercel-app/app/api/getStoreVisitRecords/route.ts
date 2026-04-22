import { NextRequest, NextResponse } from "next/server"
import { supabaseSelect, supabaseSelectFilter } from "@/lib/supabase-server"
import {
  buildVisitDisplayNameMap,
  visitDisplayName,
  visitNameSupabaseFilter,
  visitNameVariantsForFilter,
} from "@/lib/visit-display-name"
import { addDayBangkok, visitRowBusinessDateStrBangkok } from "@/lib/attendance-utils"
import { requireAuth } from "@/lib/verify-auth"
import { isAccountingRole, isOfficeRole } from "@/lib/permissions"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"

/** 매장 방문 통계용 raw records (VisitRecord 형식) - Supabase store_visits + employees 부서 매핑 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get("start") || searchParams.get("startStr") || "2000-01-01").slice(0, 10)
  const endStr = String(searchParams.get("end") || searchParams.get("endStr") || "2100-12-31").slice(0, 10)
  const store = searchParams.get("store")?.trim()
  const employeeName = searchParams.get("employeeName")?.trim()
  const department = searchParams.get("department")?.trim()
  const purpose = searchParams.get("purpose")?.trim()
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
    return NextResponse.json([], { status: 403 })
  }

  try {
    const empList = (await supabaseSelect("employees", { order: "id.asc", select: "store,job,nick,name", limit: 2000 })) as
      | { store?: string; job?: string; nick?: string; name?: string }[]
      | []

    const displayMap = buildVisitDisplayNameMap(empList)

    const visitDateMin = addDayBangkok(startStr, -1)
    const visitDateMax = addDayBangkok(endStr, 1)
    const filters = [
      `visit_date=gte.${visitDateMin}`,
      `visit_date=lte.${visitDateMax}`,
      `or=(visit_type.eq.${encodeURIComponent("방문종료")},visit_type.eq.${encodeURIComponent("강제 방문종료")},duration_min.gt.0)`,
    ]
    if (store && store !== "__ALL__") {
      if (isScopedRole) {
        const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, store))
        if (!allowed) return NextResponse.json([], { status: 403 })
      }
      filters.push(`store_name=eq.${encodeURIComponent(store)}`)
    } else if (isScopedRole && allowedStores.length === 1) {
      filters.push(`store_name=eq.${encodeURIComponent(allowedStores[0])}`)
    }
    if (employeeName && employeeName !== "__ALL__") {
      const nameF = visitNameSupabaseFilter(visitNameVariantsForFilter(employeeName, empList))
      if (nameF) filters.push(nameF)
    }
    if (purpose && purpose !== "__ALL__") {
      if (purpose === "기타") {
        filters.push(`or=(purpose.eq.${encodeURIComponent("기타")},purpose.like.${encodeURIComponent("기타:*")})`)
      } else {
        filters.push(`purpose=eq.${encodeURIComponent(purpose)}`)
      }
    }

    const namesInDept: string[] = []
    if (department && department !== "__ALL__") {
      for (const e of empList) {
        const st = String(e.store || "").toLowerCase()
        if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue
        const rowDept = String(e.job || "").trim() || "Staff"
        if (rowDept !== department) continue
        const nick = String(e.nick || "").trim()
        const legal = String(e.name || "").trim()
        if (nick && !namesInDept.includes(nick)) namesInDept.push(nick)
        if (legal && !namesInDept.includes(legal)) namesInDept.push(legal)
      }
    }
    const rows = (await supabaseSelectFilter("store_visits", filters.join("&"), {
      order: "visit_date.desc,visit_time.desc",
      limit: 5000,
      select: "visit_date,visit_time,name,store_name,purpose,duration_min,created_at",
    })) as {
      id?: string
      visit_date?: string
      name?: string
      store_name?: string
      purpose?: string
      duration_min?: number
    }[]

    const nameToDept: Record<string, string> = {}
    for (const e of empList) {
      const rowDept = String(e.job || "").trim() || "Staff"
      const nick = String(e.nick || "").trim()
      const legal = String(e.name || "").trim()
      if (nick) nameToDept[nick] = rowDept
      if (legal) nameToDept[legal] = rowDept
    }

    const result = (rows || [])
      .filter((d) => {
        if (!isScopedRole) return true
        const rowStore = String(d.store_name || "").trim()
        return allowedStores.some((s) => storesMatchForGradeLookup(s, rowStore))
      })
      .filter((d) => !department || department === "__ALL__" || namesInDept.length === 0 || namesInDept.includes(String(d.name || "").trim()))
      .filter((d) => {
        const bd = visitRowBusinessDateStrBangkok(d as { visit_date?: string; visit_time?: string; created_at?: string })
        return bd >= startStr && bd <= endStr
      })
      .map((d, idx) => {
        const raw = d as { duration_min?: number | string; [k: string]: unknown }
        const durationVal = raw.duration_min ?? raw.durationMin
        const durationNum = durationVal != null && durationVal !== "" ? Math.max(0, Math.floor(Number(durationVal))) : 0
        const rawName = String(d.name || "").trim()
        return {
          id: idx + 1,
          employee: visitDisplayName(rawName, displayMap),
          department: nameToDept[rawName] || "기타",
          store: String(d.store_name || "").trim(),
          purpose: String(d.purpose || "").trim() || "기타",
          date: visitRowBusinessDateStrBangkok(d as { visit_date?: string; visit_time?: string; created_at?: string }),
          durationMin: durationNum,
        }
      })

    return NextResponse.json(result)
  } catch (e) {
    console.error("getStoreVisitRecords:", e)
    return NextResponse.json([], { status: 500 })
  }
}
