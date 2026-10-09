import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import {
  pushStoreActionNotice,
  resolveStoreActionScope,
  type StoreActionRecipient,
} from "@/lib/store-action-server"
import { createStoreActionItem, validateStoreActionInput } from "@/lib/store-action-create"

const MAX_ITEMS = 30

/** 매장 개선 과제 여러 건 한 번에 등록 (점검 항목별 다중 문제). 모두 검증 후 저장, 담당자별 푸시 1회 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const scope = resolveStoreActionScope(auth)

  try {
    const body = await request.json()
    const items = (Array.isArray(body.items) ? body.items : []) as Record<string, unknown>[]
    if (items.length === 0 || items.length > MAX_ITEMS) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 })
    }
    for (const data of items) {
      const invalid = validateStoreActionInput(data, scope)
      if (invalid) return NextResponse.json({ success: false, message: invalid.message }, { status: invalid.status })
    }

    const created: { id: number | null; title: string; repeatCount: number }[] = []
    const byOwner = new Map<string, { owner: StoreActionRecipient; store: string; lines: string[] }>()
    for (const data of items) {
      const res = await createStoreActionItem(data, scope, String(auth.name || ""))
      if (!res.ok) continue
      created.push({ id: res.id, title: res.title, repeatCount: res.repeatCount })
      const o = res.owner
      if (!o || o.name.toLowerCase() === scope.actorName.toLowerCase()) continue
      const key = `${o.store}|${o.name}`
      const entry = byOwner.get(key) || { owner: o, store: res.store, lines: [] }
      const repeat = res.repeatCount > 0 ? ` (재발 ${res.repeatCount}회 · เกิดซ้ำ ${res.repeatCount} ครั้ง)` : ""
      entry.lines.push(`- ${res.title}${repeat} · ${res.dueDate}`)
      byOwner.set(key, entry)
    }

    for (const { owner, store, lines } of byOwner.values()) {
      const n = lines.length
      await pushStoreActionNotice({
        title: `[개선 과제] 새 과제 ${n}건 배정 · มีงานปรับปรุงใหม่ ${n} รายการครับ`,
        body: `${store}\n${lines.slice(0, 8).join("\n")}`.slice(0, 500),
        recipients: [owner],
      })
    }

    return NextResponse.json({ success: true, message: "저장되었습니다.", created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("saveStoreActionItems:", msg)
    return NextResponse.json({ success: false, message: "저장 실패: " + msg }, { status: 500 })
  }
}
