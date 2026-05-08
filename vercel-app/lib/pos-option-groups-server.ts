import {
  supabaseSelectAllPages,
  supabaseSelectFilterAllPages,
} from "@/lib/supabase-server"

export type PosOptionGroupRow = {
  id: number
  group_key: string
  name: string
  is_active: boolean
  sort_order: number
}

export type PosOptionGroupItemRow = {
  id: number
  group_id: number
  item_name: string
  sort_order: number
  base_price_hall: number
  base_price_delivery: number | null
  sell_hall: boolean
  sell_delivery: boolean
}

export type PosMenuOptionGroupLinkRow = {
  id: number
  menu_id: number
  group_id: number
  sort_order: number
  sell_hall: boolean
  sell_delivery: boolean
  price_hall_override: number | null
  price_delivery_override: number | null
  required: boolean
  min_select: number
  max_select: number
}

export async function loadPosOptionGroupsWithItems() {
  const groups = (await supabaseSelectAllPages("pos_option_groups", {
    order: "sort_order.asc,id.asc",
    select: "id,group_key,name,is_active,sort_order",
    pageSize: 3000,
    maxRows: 100000,
  })) as PosOptionGroupRow[]
  const items = (await supabaseSelectAllPages("pos_option_group_items", {
    order: "group_id.asc,sort_order.asc,id.asc",
    select:
      "id,group_id,item_name,sort_order,base_price_hall,base_price_delivery,sell_hall,sell_delivery",
    pageSize: 3000,
    maxRows: 100000,
  })) as PosOptionGroupItemRow[]
  const byGroupId = new Map<number, PosOptionGroupItemRow[]>()
  for (const item of items || []) {
    const gid = Number(item.group_id || 0)
    if (!gid) continue
    if (!byGroupId.has(gid)) byGroupId.set(gid, [])
    byGroupId.get(gid)!.push(item)
  }
  return { groups: groups || [], itemsByGroupId: byGroupId }
}

export async function loadMenuGroupLinks(menuId?: number) {
  if (menuId && Number.isFinite(menuId) && menuId > 0) {
    const rows = (await supabaseSelectFilterAllPages(
      "pos_menu_option_group_links",
      `menu_id=eq.${menuId}`,
      {
        order: "sort_order.asc,id.asc",
        select:
          "id,menu_id,group_id,sort_order,sell_hall,sell_delivery,price_hall_override,price_delivery_override,required,min_select,max_select",
        pageSize: 3000,
      }
    )) as PosMenuOptionGroupLinkRow[]
    return rows || []
  }
  const rows = (await supabaseSelectAllPages("pos_menu_option_group_links", {
    order: "menu_id.asc,sort_order.asc,id.asc",
    select:
      "id,menu_id,group_id,sort_order,sell_hall,sell_delivery,price_hall_override,price_delivery_override,required,min_select,max_select",
    pageSize: 3000,
    maxRows: 200000,
  })) as PosMenuOptionGroupLinkRow[]
  return rows || []
}

export function buildSelectionConfigFromLinks(
  links: PosMenuOptionGroupLinkRow[],
  groupsById: Map<number, PosOptionGroupRow>
) {
  const sorted = [...links].sort((a, b) => {
    const ao = Number(a.sort_order || 0)
    const bo = Number(b.sort_order || 0)
    if (ao !== bo) return ao - bo
    return Number(a.id || 0) - Number(b.id || 0)
  })
  const optionSelectionGroups: string[] = []
  const optionSelectionConfig: {
    key: string
    label: string
    audience: "all" | "hall" | "delivery"
    required: boolean
    minSelect: number
    maxSelect: number
  }[] = []
  for (const link of sorted) {
    const group = groupsById.get(Number(link.group_id || 0))
    if (!group) continue
    const key = String(group.group_key || "").trim()
    if (!key) continue
    if (!optionSelectionGroups.includes(key)) optionSelectionGroups.push(key)
    const hall = link.sell_hall !== false
    const delivery = link.sell_delivery !== false
    const audience: "all" | "hall" | "delivery" =
      hall && delivery ? "all" : hall ? "hall" : "delivery"
    optionSelectionConfig.push({
      key,
      label: String(group.name || key),
      audience,
      required: link.required !== false,
      minSelect: Math.max(0, Number(link.min_select ?? 0)),
      maxSelect: Math.max(1, Number(link.max_select ?? 1)),
    })
  }
  return { optionSelectionGroups, optionSelectionConfig }
}

export function buildMenuOptionsFromLinks(
  menuId: number,
  links: PosMenuOptionGroupLinkRow[],
  groupsById: Map<number, PosOptionGroupRow>,
  itemsByGroupId: Map<number, PosOptionGroupItemRow[]>
) {
  const out: Array<{
    id: string
    menuId: string
    name: string
    priceModifier: number
    priceModifierDelivery: number | null
    priceModifierPackaging: number | null
    sortOrder: number
    optionType: "substitution"
    optionStepValues: Record<string, string>
    sellHall: boolean
    sellDelivery: boolean
    sellPackaging: boolean
  }> = []
  const sortedLinks = [...links].sort((a, b) => {
    const ao = Number(a.sort_order || 0)
    const bo = Number(b.sort_order || 0)
    if (ao !== bo) return ao - bo
    return Number(a.id || 0) - Number(b.id || 0)
  })
  let sortCursor = 0
  for (const link of sortedLinks) {
    const gid = Number(link.group_id || 0)
    const group = groupsById.get(gid)
    if (!group) continue
    const groupKey = String(group.group_key || "").trim()
    if (!groupKey) continue
    const items = itemsByGroupId.get(gid) || []
    const sortedItems = [...items].sort((a, b) => {
      const ao = Number(a.sort_order || 0)
      const bo = Number(b.sort_order || 0)
      if (ao !== bo) return ao - bo
      return Number(a.id || 0) - Number(b.id || 0)
    })
    for (const item of sortedItems) {
      const hallBase = Number(item.base_price_hall ?? 0) || 0
      const deliveryBase =
        item.base_price_delivery != null
          ? Number(item.base_price_delivery)
          : hallBase
      const hallPrice =
        link.price_hall_override != null
          ? Number(link.price_hall_override)
          : hallBase
      const deliveryPrice =
        link.price_delivery_override != null
          ? Number(link.price_delivery_override)
          : deliveryBase
      out.push({
        id: `g${gid}-i${item.id}`,
        menuId: String(menuId),
        name: String(item.item_name || ""),
        priceModifier: hallPrice,
        priceModifierDelivery: deliveryPrice,
        priceModifierPackaging: null,
        sortOrder: sortCursor++,
        optionType: "substitution",
        optionStepValues: { [groupKey]: String(item.item_name || "") },
        sellHall: link.sell_hall !== false && item.sell_hall !== false,
        sellDelivery: link.sell_delivery !== false && item.sell_delivery !== false,
        sellPackaging: link.sell_hall !== false && item.sell_hall !== false,
      })
    }
  }
  return out
}
