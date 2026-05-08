import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { createPriceSchedule } from "@/lib/price-schedule"

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authRes = await requireAuth(req, "office")
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    const body = (await req.json()) as {
      entityType?: "item" | "pos_menu"
      entityId?: string
      fieldName?: string
      scheduledValue?: number
      effectiveAt?: string
    }
    const result = await createPriceSchedule({
      entityType: body.entityType === "item" ? "item" : "pos_menu",
      entityId: String(body.entityId || "").trim(),
      fieldName: String(body.fieldName || "").trim(),
      scheduledValue: Number(body.scheduledValue),
      effectiveAt: String(body.effectiveAt || "").trim(),
      createdBy: String(authRes.auth?.name || "office"),
    })
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message || "저장 실패" }, { status: 400, headers })
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("savePriceSchedule:", e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "저장 실패" },
      { status: 500, headers }
    )
  }
}
