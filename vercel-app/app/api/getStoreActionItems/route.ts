import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { getBangkokDateRangeUtc, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import { mapStoreActionItemRow, type StoreActionItemRow } from "@/lib/store-action-item-map"
import { STORE_ACTION_OPEN_STATUSES } from "@/lib/store-action-items"

function subtractDaysBangkok(endYmd: string, days: number): string {
  const { dayStartUtcIso } = getBangkokDateRangeUtc(endYmd, endYmd)
  const t = new Date(dayStartUtcIso).getTime() - days * 86400000
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

/** 매장 개선 과제 목록 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse

  const { searchParams } = new URL(request.url)
  let startStr = String(searchParams.get("startStr") || searchParams.get("start") || "")
    .trim()
    .slice(0, 10)
  let endStr = String(searchParams.get("endStr") || searchParams.get("end") || "")
    .trim()
    .slice(0, 10)
  const storeFilter = searchParams.get("store")?.trim() || ""
  const statusFilter = searchParams.get("status")?.trim() || ""
  const categoryFilter = searchParams.get("category")?.trim() || ""
  const priorityFilter = searchParams.get("priority")?.trim() || ""
  const ownerFilter = searchParams.get("owner")?.trim() || ""
  const openOnly = searchParams.get("openOnly") === "1" || searchParams.get("openOnly") === "true"
  const overdueOnly =
    searchParams.get("overdueOnly") === "1" || searchParams.get("overdueOnly") === "true"
  const q = searchParams.get("q")?.trim() || ""
  const idFilter = searchParams.get("id")?.trim() || ""

  const today = getBangkokTodayDateString()
  if (!endStr) endStr = today
  if (!startStr) startStr = subtractDaysBangkok(endStr, 90)

  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  const filters: string[] = [
    `created_at=gte.${encodeURIComponent(dayStartUtcIso)}`,
    `created_at=lt.${encodeURIComponent(nextDayStartUtcIso)}`,
  ]

  if (idFilter && /^\d+$/.test(idFilter)) {
    filters.length = 0
    filters.push(`id=eq.${idFilter}`)
  } else {
    if (storeFilter && storeFilter !== "All") {
      filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
    }
    if (statusFilter) filters.push(`status=eq.${encodeURIComponent(statusFilter)}`)
    if (categoryFilter) filters.push(`category=eq.${encodeURIComponent(categoryFilter)}`)
    if (priorityFilter) filters.push(`priority=eq.${encodeURIComponent(priorityFilter)}`)
    if (ownerFilter) filters.push(`owner_name=eq.${encodeURIComponent(ownerFilter)}`)
    if (openOnly) {
      filters.push(`status=in.(${STORE_ACTION_OPEN_STATUSES.join(",")})`)
    }
  }

  const filterStr = filters.join("&")
  const qLow = q.replace(/[*(),]/g, " ").trim().slice(0, 80).toLowerCase()

  try {
    const list = (await supabaseSelectFilter("store_action_items", filterStr, {
      order: "due_date.asc.nullslast,created_at.desc,id.desc",
      limit: 3000,
    })) as StoreActionItemRow[]

    let mapped = (list || []).map((d) => mapStoreActionItemRow(d, today))

    if (qLow) {
      mapped = mapped.filter((d) => {
        const hay = `${d.title} ${d.description} ${d.ownerName} ${d.actionPlan}`.toLowerCase()
        return hay.includes(qLow)
      })
    }
    if (overdueOnly) {
      mapped = mapped.filter((d) => d.overdue)
    }

    return NextResponse.json(mapped)
  } catch (e) {
    console.error("getStoreActionItems:", e)
    return NextResponse.json([], { status: 500 })
  }
}
