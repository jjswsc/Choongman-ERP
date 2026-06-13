import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { fetchStoreOpsSnapshot } from "@/lib/ai/store-ops-advisor"
import { isAiRouteError } from "@/lib/ai/errors"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const sp = req.nextUrl.searchParams
  const store = String(sp.get("store") || access.scoped.store || "All").trim()
  const start = String(sp.get("start") || "").trim().slice(0, 10)
  const end = String(sp.get("end") || "").trim().slice(0, 10)

  try {
    const insight = await fetchStoreOpsSnapshot({
      scoped: access.scoped,
      store,
      start: start || undefined,
      end: end || undefined,
    })
    return NextResponse.json(insight, { headers })
  } catch (e) {
    const code = isAiRouteError(e) ? e.code : "AI_INTERNAL_ERROR"
    const status = isAiRouteError(e) ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code },
      { status, headers }
    )
  }
}
