import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import {
  getAiConversationMessages,
  listAiConversations,
  saveAiConversationTurn,
} from "@/lib/ai/conversations"
import { isAiRouteError } from "@/lib/ai/errors"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const sp = req.nextUrl.searchParams
  const idRaw = sp.get("id")
  if (idRaw) {
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid id", code: "AI_VALIDATION_ERROR" }, { status: 400, headers })
    }
    const detail = await getAiConversationMessages(access.scoped, id)
    return NextResponse.json(detail, { headers })
  }

  const limit = Math.max(1, Math.min(Number(sp.get("limit") || 20), 50))
  const items = await listAiConversations(access.scoped, limit)
  return NextResponse.json({ items }, { headers })
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "AI_INVALID_JSON" }, { status: 400, headers })
  }

  const query = String(body.query || "").trim()
  const answer = String(body.answer || "").trim()
  const intent = String(body.intent || "qa").trim()
  const conversationId = body.conversationId == null ? undefined : Number(body.conversationId)
  if (!query || !answer) {
    return NextResponse.json({ error: "query and answer required", code: "AI_VALIDATION_ERROR" }, { status: 400, headers })
  }

  try {
    const saved = await saveAiConversationTurn({
      scoped: access.scoped,
      conversationId: Number.isFinite(conversationId) ? conversationId : undefined,
      query,
      answer,
      intent,
      meta: (body.meta as Record<string, unknown>) || {},
    })
    return NextResponse.json({ ok: true, conversationId: saved.conversationId }, { headers })
  } catch (e) {
    const code = isAiRouteError(e) ? e.code : "AI_INTERNAL_ERROR"
    const status = isAiRouteError(e) ? e.status : 500
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code },
      { status, headers }
    )
  }
}
