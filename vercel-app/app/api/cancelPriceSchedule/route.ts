import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseUpdateByFilter } from "@/lib/supabase-server"

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authRes = await requireAuth(req, "office")
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    const body = (await req.json()) as { id?: number }
    const id = Number(body.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: "유효한 예약 ID가 필요합니다." }, { status: 400, headers })
    }
    await supabaseUpdateByFilter("price_schedules", `id=eq.${id}&status=eq.pending`, {
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    const msg = String(e)
    if (/does not exist|42P01/i.test(msg)) {
      return NextResponse.json({ success: false, message: "price_schedules 테이블이 없습니다." }, { status: 400, headers })
    }
    console.error("cancelPriceSchedule:", e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "취소 실패" },
      { status: 500, headers }
    )
  }
}
