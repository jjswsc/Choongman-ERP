import { NextRequest, NextResponse } from "next/server"
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"

type MenuRow = {
  id?: number
  option_selection_groups?: string[] | null
  option_selection_config?: unknown
}

type OptionRow = {
  id?: number
  menu_id?: number
  name?: string
  sort_order?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
  sell_hall?: boolean
  sell_delivery?: boolean
  option_step_values?: Record<string, string> | null
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body?.dryRun !== false
    const menuIdInput = Number(body?.menuId || 0)
    const menus = (menuIdInput
      ? await supabaseSelectFilter("pos_menus", `id=eq.${menuIdInput}`, {
          select: "id,option_selection_groups,option_selection_config",
          limit: 1,
        })
      : await supabaseSelect("pos_menus", {
          select: "id,option_selection_groups,option_selection_config",
          limit: 10000,
        })) as MenuRow[]
    const allOptions = (menuIdInput
      ? await supabaseSelectFilter("pos_menu_options", `menu_id=eq.${menuIdInput}`, {
          select:
            "id,menu_id,name,sort_order,price_modifier,price_modifier_delivery,sell_hall,sell_delivery,option_step_values",
          limit: 10000,
        })
      : await supabaseSelect("pos_menu_options", {
          select:
            "id,menu_id,name,sort_order,price_modifier,price_modifier_delivery,sell_hall,sell_delivery,option_step_values",
          limit: 50000,
        })) as OptionRow[]

    const existingGroups = (await supabaseSelect("pos_option_groups", {
      select: "id,group_key,name",
      limit: 10000,
    }).catch(() => [])) as { id?: number; group_key?: string; name?: string }[]
    const groupIdByKey = new Map<string, number>()
    for (const g of existingGroups || []) {
      const key = String(g.group_key || "").trim()
      const id = Number(g.id || 0)
      if (key && id) groupIdByKey.set(key, id)
    }

    let groupsCreated = 0
    let itemsCreated = 0
    let linksSaved = 0
    const menuCount = (menus || []).length

    for (const menu of menus || []) {
      const menuId = Number(menu.id || 0)
      if (!menuId) continue
      const options = (allOptions || []).filter((x) => Number(x.menu_id || 0) === menuId)
      if (!dryRun) {
        await supabaseDeleteByFilter("pos_menu_option_group_links", `menu_id=eq.${menuId}`)
      }
      const byGroup = new Map<string, OptionRow[]>()
      for (const opt of options) {
        const step = opt.option_step_values
        let groupKey = "default"
        if (step && typeof step === "object" && !Array.isArray(step)) {
          const key = Object.keys(step).find((k) => String(k).trim())
          if (key) groupKey = String(key).trim().toLowerCase()
        }
        const list = byGroup.get(groupKey) || []
        list.push(opt)
        byGroup.set(groupKey, list)
      }
      const configMap = new Map<
        string,
        { required: boolean; minSelect: number; maxSelect: number }
      >()
      const rawCfg = menu.option_selection_config
      if (Array.isArray(rawCfg)) {
        for (const c of rawCfg) {
          if (!c || typeof c !== "object") continue
          const o = c as Record<string, unknown>
          const key = String(o.key ?? "").trim().toLowerCase()
          if (!key) continue
          const required = o.required === true
          const min = Number.isFinite(Number(o.minSelect))
            ? Math.max(0, Number(o.minSelect))
            : required
            ? 1
            : 0
          const max = Number.isFinite(Number(o.maxSelect))
            ? Math.max(1, Number(o.maxSelect))
            : 1
          configMap.set(key, { required, minSelect: min, maxSelect: max })
        }
      }
      let linkSort = 0
      for (const [groupKeyRaw, groupOptions] of byGroup.entries()) {
        const groupKey = groupKeyRaw || "default"
        let groupId = groupIdByKey.get(groupKey) || 0
        if (!groupId && !dryRun) {
          const inserted = (await supabaseInsert("pos_option_groups", {
            group_key: groupKey,
            name: groupKey,
            is_active: true,
            sort_order: 0,
          })) as { id?: number }[] | { id?: number }
          const row = Array.isArray(inserted) ? inserted[0] : inserted
          groupId = Number(row?.id || 0)
          if (groupId) {
            groupIdByKey.set(groupKey, groupId)
            groupsCreated += 1
          }
        }
        if (!groupId) continue
        const seenItem = new Set<string>()
        for (const opt of groupOptions) {
          const name = String(opt.name || "").trim()
          if (!name || seenItem.has(name.toLowerCase())) continue
          seenItem.add(name.toLowerCase())
          if (!dryRun) {
            const existingItems = (await supabaseSelectFilter(
              "pos_option_group_items",
              `group_id=eq.${groupId}&item_name=eq.${encodeURIComponent(name)}`,
              { select: "id", limit: 1 }
            )) as { id?: number }[]
            if (!existingItems?.[0]?.id) {
              await supabaseInsert("pos_option_group_items", {
                group_id: groupId,
                item_name: name,
                sort_order: Number(opt.sort_order || 0),
                base_price_hall: Number(opt.price_modifier || 0),
                base_price_delivery:
                  opt.price_modifier_delivery != null
                    ? Number(opt.price_modifier_delivery)
                    : null,
                sell_hall: opt.sell_hall !== false,
                sell_delivery: opt.sell_delivery !== false,
              })
              itemsCreated += 1
            }
          }
        }
        const cfg = configMap.get(groupKey) || {
          required: true,
          minSelect: 1,
          maxSelect: 1,
        }
        if (!dryRun) {
          await supabaseInsert("pos_menu_option_group_links", {
            menu_id: menuId,
            group_id: groupId,
            sort_order: linkSort,
            sell_hall: true,
            sell_delivery: true,
            price_hall_override: null,
            price_delivery_override: null,
            required: cfg.required,
            min_select: cfg.minSelect,
            max_select: cfg.maxSelect,
          }).catch(async () => {
            await supabaseUpdateByFilter(
              "pos_menu_option_group_links",
              `menu_id=eq.${menuId}&group_id=eq.${groupId}`,
              {
                sort_order: linkSort,
                required: cfg.required,
                min_select: cfg.minSelect,
                max_select: cfg.maxSelect,
              }
            )
          })
        }
        linksSaved += 1
        linkSort += 1
      }
    }

    return NextResponse.json(
      {
        success: true,
        dryRun,
        menuCount,
        groupsCreated,
        itemsCreated,
        linksSaved,
      },
      { headers }
    )
  } catch (e) {
    console.error("migratePosMenuOptionsToGroupLinks:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
