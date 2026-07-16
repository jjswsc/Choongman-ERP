import { NextRequest, NextResponse } from "next/server"
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"
import { resolvePosOptionGroupCode } from "@/lib/pos-option-group-code"
import { getVerifiedAuth } from "@/lib/verify-auth"
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  resolvePosCatalogTenantScope,
  stampPosCatalogTenantId,
} from "@/lib/pos-catalog-tenant-scope"

type SaveItemInput = {
  id?: string
  itemName: string
  sortOrder: number
  basePriceHall?: number
  basePriceDelivery?: number | null
  sellHall?: boolean
  sellDelivery?: boolean
}

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
    const idRaw = String(body?.id ?? "").trim()
    const groupKey = String(body?.key ?? "").trim()
    const name = String(body?.name ?? "").trim()
    const isActive = body?.isActive !== false
    const sortOrder = Number(body?.sortOrder ?? 0) || 0
    const items = (Array.isArray(body?.items) ? body.items : []) as SaveItemInput[]
    if (!groupKey || !name) {
      return NextResponse.json(
        { success: false, message: "key and name required" },
        { headers }
      )
    }

    let groupId = 0
    if (idRaw) {
      const groupFilter = appendPosCatalogTenantFilter(`id=eq.${idRaw}`, catalogScope)
      const existingGroup = (await supabaseSelectFilter("pos_option_groups", groupFilter, {
        limit: 1,
        select: "id",
      })) as { id?: number }[] | null
      if (!existingGroup?.[0]?.id) {
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
      await supabaseUpdateByFilter("pos_option_groups", groupFilter, {
        group_key: groupKey,
        name,
        is_active: isActive,
        sort_order: sortOrder,
      })
      groupId = Number(idRaw)
    } else {
      const inserted = (await supabaseInsert(
        "pos_option_groups",
        stampPosCatalogTenantId(
          {
            group_key: groupKey,
            name,
            is_active: isActive,
            sort_order: sortOrder,
          },
          catalogScope
        )
      )) as { id?: number }[] | { id?: number }
      const row = Array.isArray(inserted) ? inserted[0] : inserted
      groupId = Number(row?.id ?? 0)
      if (!groupId) throw new Error("group insert failed")
    }

    const existing = (await supabaseSelectFilter(
      "pos_option_group_items",
      `group_id=eq.${groupId}`,
      { select: "id", limit: 10000 }
    )) as { id?: number }[] | null
    const existingIds = new Set(
      (existing || []).map((x) => String(x.id ?? "")).filter(Boolean)
    )
    const keepIds = new Set<string>()

    for (const item of items) {
      const itemId = String(item.id ?? "").trim()
      const row = {
        group_id: groupId,
        item_name: String(item.itemName ?? "").trim(),
        sort_order: Number(item.sortOrder ?? 0) || 0,
        base_price_hall: Number(item.basePriceHall ?? 0) || 0,
        base_price_delivery:
          item.basePriceDelivery != null ? Number(item.basePriceDelivery) : null,
        sell_hall: item.sellHall !== false,
        sell_delivery: item.sellDelivery !== false,
      }
      if (!row.item_name) continue
      if (itemId) {
        await supabaseUpdateByFilter("pos_option_group_items", `id=eq.${itemId}`, row)
        keepIds.add(itemId)
      } else {
        const inserted = (await supabaseInsert(
          "pos_option_group_items",
          row
        )) as { id?: number }[] | { id?: number }
        const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
        if (insertedRow?.id != null) keepIds.add(String(insertedRow.id))
      }
    }

    for (const existingId of existingIds) {
      if (keepIds.has(existingId)) continue
      await supabaseDeleteByFilter("pos_option_group_items", `id=eq.${existingId}`)
    }

    return NextResponse.json(
      {
        success: true,
        id: String(groupId),
        code: resolvePosOptionGroupCode({ key: groupKey }),
      },
      { headers }
    )
  } catch (e) {
    console.error("savePosOptionGroup:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
