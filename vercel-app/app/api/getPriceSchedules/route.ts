import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import { runDuePriceSchedules } from "@/lib/price-schedule"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const authRes = await requireAuth(req, "manager")
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    try {
      await runDuePriceSchedules(new Date())
    } catch (scheduleErr) {
      console.error("getPriceSchedules runDuePriceSchedules:", scheduleErr)
    }

    const { searchParams } = new URL(req.url)
    const entityType = String(searchParams.get("entityType") || "").trim()
    const status = String(searchParams.get("status") || "").trim()
    const search = String(searchParams.get("search") || "").trim()
    const category = String(searchParams.get("category") || "").trim()
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200))

    const conditions: string[] = []
    if (entityType) conditions.push(`entity_type=eq.${encodeURIComponent(entityType)}`)
    if (status) conditions.push(`status=eq.${encodeURIComponent(status)}`)
    if (category) conditions.push(`category=eq.${encodeURIComponent(category)}`)
    if (search) conditions.push(`entity_display_name=ilike.${encodeURIComponent(`*${search}*`)}`)
    const filter = conditions.length ? conditions.join("&") : "id=gte.0"

    const rows = (await supabaseSelectFilter("price_schedules", filter, {
      limit,
      order: "effective_at.asc,id.desc",
    })) as unknown[]
    return NextResponse.json(Array.isArray(rows) ? rows : [], { headers })
  } catch (e) {
    const msg = String(e)
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json([], { headers })
    }
    console.error("getPriceSchedules:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500, headers })
  }
}
