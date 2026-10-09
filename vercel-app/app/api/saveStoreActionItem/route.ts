import { NextRequest, NextResponse } from "next/server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { requireAuth } from "@/lib/verify-auth"
import { pushStoreActionNotice, resolveStoreActionScope } from "@/lib/store-action-server"
import { createStoreActionItem } from "@/lib/store-action-create"

/** 매장 개선 과제 신규 등록 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const scope = resolveStoreActionScope(auth)

  try {
    const body = await request.json()
    const data = body.dataStr ? JSON.parse(body.dataStr) : body.data || body

    const res = await createStoreActionItem(data, scope, String(auth.name || ""))
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status })
    }

    const repeatHint =
      res.repeatCount > 0 ? ` (재발 ${res.repeatCount}회 · เกิดซ้ำ ${res.repeatCount} ครั้ง)` : ""
    await pushStoreActionNotice({
      title: "[개선 과제] 새 과제 배정 · มีงานปรับปรุงใหม่ครับ",
      body: `${res.store} · ${res.title}${repeatHint}\n기한 · กำหนดเสร็จ: ${res.dueDate}\n재확인 · ผู้ตรวจยืนยัน: ${res.verifierName}`,
      recipients:
        res.owner && res.owner.name.toLowerCase() !== scope.actorName.toLowerCase() ? [res.owner] : [],
    })

    return NextResponse.json({
      success: true,
      message: "저장되었습니다.",
      id: res.id,
      repeatCount: res.repeatCount,
      parentId: res.parentId,
      today: getBangkokTodayDateString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("saveStoreActionItem:", msg)
    return NextResponse.json({ success: false, message: "저장 실패: " + msg }, { status: 500 })
  }
}
