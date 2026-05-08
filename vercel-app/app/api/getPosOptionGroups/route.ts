import { NextRequest, NextResponse } from "next/server"
import { loadMenuGroupLinks, loadPosOptionGroupsWithItems } from "@/lib/pos-option-groups-server"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  try {
    const { searchParams } = new URL(req.url)
    const menuIdRaw = searchParams.get("menuId")?.trim() || ""
    const menuId = menuIdRaw ? Number(menuIdRaw) : NaN
    const { groups, itemsByGroupId } = await loadPosOptionGroupsWithItems()
    const menuLinks =
      Number.isFinite(menuId) && menuId > 0
        ? await loadMenuGroupLinks(menuId)
        : []
    const linksByGroupId = new Map<number, (typeof menuLinks)[number]>()
    for (const row of menuLinks) {
      linksByGroupId.set(Number(row.group_id || 0), row)
    }
    const list = groups.map((group) => {
      const gid = Number(group.id || 0)
      const items = (itemsByGroupId.get(gid) || []).map((item) => ({
        id: String(item.id ?? ""),
        groupId: String(item.group_id ?? ""),
        itemName: String(item.item_name ?? ""),
        sortOrder: Number(item.sort_order ?? 0),
        basePriceHall: Number(item.base_price_hall ?? 0),
        basePriceDelivery:
          item.base_price_delivery != null
            ? Number(item.base_price_delivery)
            : null,
        sellHall: item.sell_hall !== false,
        sellDelivery: item.sell_delivery !== false,
      }))
      const link = linksByGroupId.get(gid)
      return {
        id: String(group.id ?? ""),
        key: String(group.group_key ?? ""),
        name: String(group.name ?? ""),
        isActive: group.is_active !== false,
        sortOrder: Number(group.sort_order ?? 0),
        items,
        link: link
          ? {
              id: String(link.id ?? ""),
              menuId: String(link.menu_id ?? ""),
              groupId: String(link.group_id ?? ""),
              sortOrder: Number(link.sort_order ?? 0),
              sellHall: link.sell_hall !== false,
              sellDelivery: link.sell_delivery !== false,
              priceHallOverride:
                link.price_hall_override != null
                  ? Number(link.price_hall_override)
                  : null,
              priceDeliveryOverride:
                link.price_delivery_override != null
                  ? Number(link.price_delivery_override)
                  : null,
              required: link.required !== false,
              minSelect: Number(link.min_select ?? 0),
              maxSelect: Number(link.max_select ?? 1),
            }
          : null,
      }
    })
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error("getPosOptionGroups:", e)
    return NextResponse.json([], { headers })
  }
}
