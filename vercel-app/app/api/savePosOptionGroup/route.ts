import { NextRequest, NextResponse } from "next/server"
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"

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
      await supabaseUpdateByFilter("pos_option_groups", `id=eq.${idRaw}`, {
        group_key: groupKey,
        name,
        is_active: isActive,
        sort_order: sortOrder,
      })
      groupId = Number(idRaw)
    } else {
      const inserted = (await supabaseInsert("pos_option_groups", {
        group_key: groupKey,
        name,
        is_active: isActive,
        sort_order: sortOrder,
      })) as { id?: number }[] | { id?: number }
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

    return NextResponse.json({ success: true, id: String(groupId) }, { headers })
  } catch (e) {
    console.error("savePosOptionGroup:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
