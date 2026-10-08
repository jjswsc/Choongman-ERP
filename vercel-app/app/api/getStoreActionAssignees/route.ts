import { NextRequest, NextResponse } from "next/server"
import { supabaseSelect } from "@/lib/supabase-server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import { isOfficeRole, isOfficeStore, isSupervisorRole } from "@/lib/permissions"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import { resolveStoreActionScope, storeActionStoreAllowed } from "@/lib/store-action-server"

type EmpRow = {
  id?: number
  name?: string
  nick?: string
  store?: string
  job?: string
  role?: string
  resign_date?: string | null
  employment_status?: string | null
}

/**
 * 개선 과제 담당자·재확인자 선택 목록.
 * 해당 매장 재직자 + 본사·슈퍼바이저(재확인 후보). 매장 미지정 시 본사·슈퍼바이저만.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveStoreActionScope(authResult.auth)

  const store = String(new URL(request.url).searchParams.get("store") || "").trim()
  if (store && !storeActionStoreAllowed(scope, store)) {
    return NextResponse.json({ success: false, message: "권한이 없는 매장입니다.", list: [] }, { status: 403 })
  }

  try {
    const today = getBangkokTodayDateString()
    const rows = ((await supabaseSelect("employees", {
      order: "name.asc",
      select: "id,name,nick,store,job,role,resign_date,employment_status",
      limit: 5000,
    })) || []) as EmpRow[]

    const list = rows
      .filter((e) => {
        if (!String(e.name || "").trim()) return false
        const resign = String(e.resign_date || "").trim().slice(0, 10)
        if (resign && resign < today) return false
        if (/퇴사|resign|terminated/i.test(String(e.employment_status || ""))) return false
        return true
      })
      .map((e) => {
        const empStore = String(e.store || "").trim()
        const role = String(e.role || "")
        const hq = isOfficeStore(empStore) || isOfficeRole(role) || isSupervisorRole(role) || isSupervisorRole(String(e.job || ""))
        const inStore = !!store && storesMatchForGradeLookup(empStore, store)
        return {
          id: Number(e.id || 0),
          name: String(e.name || "").trim(),
          nick: String(e.nick || "").trim(),
          store: empStore,
          job: String(e.job || "").trim(),
          role: role.trim(),
          group: inStore ? ("store" as const) : hq ? ("hq" as const) : null,
        }
      })
      .filter((e) => e.group != null)
      .sort((a, b) => {
        if (a.group !== b.group) return a.group === "store" ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return NextResponse.json({ success: true, list })
  } catch (e) {
    console.error("getStoreActionAssignees:", e)
    return NextResponse.json({ success: false, message: "조회 실패", list: [] }, { status: 500 })
  }
}
