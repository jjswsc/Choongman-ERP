import { NextRequest, NextResponse } from "next/server"
import { supabaseSelect, supabaseSelectFilter } from "@/lib/supabase-server"

/** 매장 방문 통계용 raw records (VisitRecord 형식) - Supabase store_visits + employees 부서 매핑 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get("start") || searchParams.get("startStr") || "2000-01-01").slice(0, 10)
  const endStr = String(searchParams.get("end") || searchParams.get("endStr") || "2100-12-31").slice(0, 10)
  const store = searchParams.get("store")?.trim()
  const employeeName = searchParams.get("employeeName")?.trim()
  const department = searchParams.get("department")?.trim()
  const purpose = searchParams.get("purpose")?.trim()
  const userStore = searchParams.get("userStore")?.trim()
  const userRole = String(searchParams.get("userRole") || "").toLowerCase()

  const filters = [
    `visit_date=gte.${startStr}`,
    `visit_date=lte.${endStr}`,
    `or=(visit_type.eq.${encodeURIComponent("방문종료")},visit_type.eq.${encodeURIComponent("강제 방문종료")},duration_min.gt.0)`,
  ]
  if (userRole.includes("manager") && userStore) {
    filters.push(`store_name=eq.${encodeURIComponent(userStore)}`)
  }
  if (store && store !== "__ALL__") filters.push(`store_name=eq.${encodeURIComponent(store)}`)
  if (employeeName && employeeName !== "__ALL__") filters.push(`name=eq.${encodeURIComponent(employeeName)}`)
  if (purpose && purpose !== "__ALL__") {
    if (purpose === "기타") {
      filters.push(`or=(purpose.eq.${encodeURIComponent("기타")},purpose.like.${encodeURIComponent("기타:*")})`)
    } else {
      filters.push(`purpose=eq.${encodeURIComponent(purpose)}`)
    }
  }

  try {
    const empList = (await supabaseSelect("employees", { order: "id.asc", select: "store,job,nick,name" })) as
      | { store?: string; job?: string; nick?: string; name?: string }[]
      | []

    let namesInDept: string[] = []
    if (department && department !== "__ALL__") {
      for (const e of empList) {
        const st = String(e.store || "").toLowerCase()
        if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue
        const rowDept = String(e.job || "").trim() || "Staff"
        if (rowDept !== department) continue
        const n = String(e.nick || "").trim() || String(e.name || "").trim()
        if (n && !namesInDept.includes(n)) namesInDept.push(n)
      }
    }
    const rows = (await supabaseSelectFilter("store_visits", filters.join("&"), {
      order: "visit_date.desc,visit_time.desc",
      limit: 5000,
      select: "visit_date,visit_time,name,store_name,purpose,duration_min",
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
      const nameToShow = String(e.nick || "").trim() || String(e.name || "").trim()
      if (nameToShow) nameToDept[nameToShow] = rowDept
    }

    const result = (rows || [])
      .filter((d) => !department || department === "__ALL__" || namesInDept.length === 0 || namesInDept.includes(String(d.name || "").trim()))
      .map((d, idx) => {
        const raw = d as { duration_min?: number | string; [k: string]: unknown }
        const durationVal = raw.duration_min ?? raw.durationMin
        const durationNum = durationVal != null && durationVal !== "" ? Math.max(0, Math.floor(Number(durationVal))) : 0
        return {
          id: idx + 1,
          employee: String(d.name || "").trim(),
          department: nameToDept[String(d.name || "").trim()] || "기타",
          store: String(d.store_name || "").trim(),
          purpose: String(d.purpose || "").trim() || "기타",
          date: String(d.visit_date || "").slice(0, 10),
          durationMin: durationNum,
        }
      })

    return NextResponse.json(result)
  } catch (e) {
    console.error("getStoreVisitRecords:", e)
    return NextResponse.json([], { status: 500 })
  }
}
