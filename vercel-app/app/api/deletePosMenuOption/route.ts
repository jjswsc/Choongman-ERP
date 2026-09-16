import { NextRequest, NextResponse } from "next/server"
import { supabaseDeleteByFilter, supabaseSelectFilter } from "@/lib/supabase-server"
import { fingerprintDeletedOption, optionMatchesDeleteFingerprint } from "@/lib/pos-option-delete-match"

/** POS 메뉴 옵션 삭제. 같은 메뉴의 이름/단계 값이 같은 숨은 행도 함께 지운다. */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  try {
    const body = await req.json()
    const id = String(body?.id ?? "").trim()
    const menuId = String(body?.menuId ?? "").trim()
    const name = String(body?.name ?? "").trim()
    const optionStepValues =
      body?.optionStepValues && typeof body.optionStepValues === "object" && !Array.isArray(body.optionStepValues)
        ? (body.optionStepValues as Record<string, string>)
        : {}

    if (!id && !menuId) {
      return NextResponse.json({ success: false, message: "id required" }, { headers })
    }

    if (id && /^\d+$/.test(id)) {
      await supabaseDeleteByFilter("pos_menu_options", `id=eq.${id}`)
    }

    if (menuId && /^\d+$/.test(menuId)) {
      const fp = fingerprintDeletedOption({ id, name, optionStepValues })
      const rows = (await supabaseSelectFilter("pos_menu_options", `menu_id=eq.${menuId}`, {
        limit: 500,
        select: "id,name,option_step_values",
      })) as { id?: number; name?: string; option_step_values?: Record<string, string> | null }[] | null
      for (const row of rows || []) {
        const rowId = String(row.id ?? "").trim()
        if (!rowId || !/^\d+$/.test(rowId)) continue
        if (
          optionMatchesDeleteFingerprint(
            { id: rowId, name: row.name, optionStepValues: row.option_step_values },
            fp
          )
        ) {
          await supabaseDeleteByFilter("pos_menu_options", `id=eq.${rowId}`)
        }
      }
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("deletePosMenuOption:", e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
