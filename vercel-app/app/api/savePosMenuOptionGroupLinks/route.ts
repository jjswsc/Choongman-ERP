import { NextRequest, NextResponse } from "next/server"
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"
import {
  BBQ_FORBIDDEN_SELECTION_GROUP_KEYS,
  isStrictBonelessBbqChickenCode,
} from '@/lib/pos-bbq-option-guard'

type LinkInput = {
  id?: string
  groupId: string
  sortOrder: number
  sellHall?: boolean
  sellDelivery?: boolean
  priceHallOverride?: number | null
  priceDeliveryOverride?: number | null
  required?: boolean
  minSelect?: number
  maxSelect?: number
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  try {
    const body = await req.json()
    const menuId = Number(body?.menuId)
    const links = (Array.isArray(body?.links) ? body.links : []) as LinkInput[]
    if (!menuId) {
      return NextResponse.json(
        { success: false, message: "menuId and links required" },
        { headers }
      )
    }
    const menuRows = (await supabaseSelectFilter(
      'pos_menus',
      `id=eq.${menuId}`,
      { limit: 1, select: 'code' }
    )) as { code?: string }[] | null
    const menuCode = String(menuRows?.[0]?.code ?? '').trim()
    if (isStrictBonelessBbqChickenCode(menuCode) && links.length > 0) {
      const groupIds = [...new Set(links.map((l) => Number(l.groupId)).filter((id) => id > 0))]
      if (groupIds.length > 0) {
        const groupRows = (await supabaseSelectFilter(
          'pos_option_groups',
          `id=in.(${groupIds.join(',')})`,
          { select: 'id,group_key', limit: 500 }
        )) as { id?: number; group_key?: string }[] | null
        const forbidden = (groupRows || []).filter((g) =>
          BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(String(g.group_key ?? '').trim().toLowerCase())
        )
        if (forbidden.length > 0) {
          return NextResponse.json(
            {
              success: false,
              message:
                'Bar.B.Q 치킨(C020~C023)에는 size/part 공통 그룹을 연결할 수 없습니다. 치킨무·김치 등 sidedish 그룹만 연결해 주세요.',
            },
            { headers }
          )
        }
      }
    }
    const existing = (await supabaseSelectFilter(
      "pos_menu_option_group_links",
      `menu_id=eq.${menuId}`,
      { select: "id", limit: 10000 }
    )) as { id?: number }[] | null
    const existingIds = new Set(
      (existing || []).map((x) => String(x.id ?? "")).filter(Boolean)
    )
    const keepIds = new Set<string>()

    for (const link of links) {
      const id = String(link.id ?? "").trim()
      const gid = Number(link.groupId)
      if (!gid) continue
      const min = Math.max(0, Number(link.minSelect ?? 0))
      const max = Math.max(1, Number(link.maxSelect ?? 1))
      const row = {
        menu_id: menuId,
        group_id: gid,
        sort_order: Number(link.sortOrder ?? 0) || 0,
        sell_hall: link.sellHall !== false,
        sell_delivery: link.sellDelivery !== false,
        price_hall_override:
          link.priceHallOverride != null ? Number(link.priceHallOverride) : null,
        price_delivery_override:
          link.priceDeliveryOverride != null
            ? Number(link.priceDeliveryOverride)
            : null,
        required: link.required !== false,
        min_select: Math.min(min, max),
        max_select: max,
      }
      if (id) {
        await supabaseUpdateByFilter("pos_menu_option_group_links", `id=eq.${id}`, row)
        keepIds.add(id)
      } else {
        const inserted = (await supabaseInsert(
          "pos_menu_option_group_links",
          row
        )) as { id?: number }[] | { id?: number }
        const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
        if (insertedRow?.id != null) keepIds.add(String(insertedRow.id))
      }
    }

    for (const existingId of existingIds) {
      if (keepIds.has(existingId)) continue
      await supabaseDeleteByFilter(
        "pos_menu_option_group_links",
        `id=eq.${existingId}`
      )
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("savePosMenuOptionGroupLinks:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
