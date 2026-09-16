import { NextRequest, NextResponse } from "next/server"
import { supabaseDeleteByFilter, supabaseSelectFilter } from "@/lib/supabase-server"
import { getVerifiedAuth } from "@/lib/verify-auth"
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  resolvePosCatalogTenantScope,
} from "@/lib/pos-catalog-tenant-scope"

/** 공통 옵션그룹 항목 1개 삭제 — 메뉴 옵션 구성에서 개별 행 삭제용 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  try {
    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    const writeBlock = assertPosCatalogTenantWritable(catalogScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { headers })
    }

    const body = await req.json()
    const id = String(body?.id ?? "").trim()
    if (!id || !/^\d+$/.test(id)) {
      return NextResponse.json({ success: false, message: "id required" }, { headers })
    }

    const existing = (await supabaseSelectFilter("pos_option_group_items", `id=eq.${id}`, {
      limit: 1,
      select: "id,group_id",
    })) as { id?: number; group_id?: number }[] | null
    const groupId = Number(existing?.[0]?.group_id || 0)
    if (!groupId) {
      return NextResponse.json({ success: false, message: "옵션 그룹 항목을 찾을 수 없습니다." }, { headers })
    }
    const groupFilter = appendPosCatalogTenantFilter(`id=eq.${groupId}`, catalogScope)
    const groupRows = (await supabaseSelectFilter("pos_option_groups", groupFilter, {
      limit: 1,
      select: "id",
    })) as { id?: number }[] | null
    if (!groupRows?.[0]?.id) {
      return NextResponse.json(
        {
          success: false,
          message: catalogScope.enforce
            ? "옵션 그룹을 찾을 수 없거나 다른 회사 데이터입니다."
            : "옵션 그룹을 찾을 수 없습니다.",
        },
        { headers }
      )
    }

    await supabaseDeleteByFilter("pos_option_group_items", `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("deletePosOptionGroupItem:", e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
