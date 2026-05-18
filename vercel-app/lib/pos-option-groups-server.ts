import {
  supabaseSelectAllPages,
  supabaseSelectFilterAllPages,
} from "@/lib/supabase-server"

export type {
  PosMenuOptionGroupLinkRow,
  PosOptionGroupItemRow,
  PosOptionGroupRow,
} from "@/lib/pos-option-groups-build"

export {
  buildMenuOptionsFromLinks,
  buildMenuOptionsFromLinksPerGroup,
  buildSelectionConfigFromLinks,
} from "@/lib/pos-option-groups-build"

import type { PosMenuOptionGroupLinkRow, PosOptionGroupItemRow, PosOptionGroupRow } from "@/lib/pos-option-groups-build"

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
