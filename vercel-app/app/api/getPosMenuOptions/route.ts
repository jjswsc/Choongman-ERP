import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectAllPages } from '@/lib/supabase-server'
import {
  type PosOptionGroupRow,
  buildMenuOptionsFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'

/** POS 메뉴 옵션 목록 조회 (menu_id별 필터 가능) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()

  try {
    const linkedOptions: ReturnType<typeof buildMenuOptionsFromLinks> = []
    const linkedMenuIds = new Set<number>()
    try {
      const [{ groups, itemsByGroupId }, links] = await Promise.all([
        loadPosOptionGroupsWithItems(),
        loadMenuGroupLinks(
          menuId && Number.isFinite(Number(menuId)) ? Number(menuId) : undefined
        ),
      ])
      const groupsById = new Map<number, PosOptionGroupRow>()
      for (const g of groups || []) {
        const id = Number(g.id || 0)
        if (!id) continue
        groupsById.set(id, g)
      }
      const linksByMenuId = new Map<number, typeof links>()
      for (const link of links || []) {
        const mid = Number(link.menu_id || 0)
        if (!mid) continue
        linkedMenuIds.add(mid)
        if (!linksByMenuId.has(mid)) linksByMenuId.set(mid, [])
        linksByMenuId.get(mid)!.push(link)
      }
      for (const [mid, menuLinks] of linksByMenuId.entries()) {
        linkedOptions.push(
          ...buildMenuOptionsFromLinks(mid, menuLinks, groupsById, itemsByGroupId)
        )
      }
    } catch {
      // 신규 구조 미배포 환경 fallback
    }

    const selectCols =
      'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,additive_source_menu_id,quantity,option_step_values,sell_hall,sell_delivery,sell_packaging,description_default,description_delivery,description_table'
    const colsWithoutSellAndStep =
      'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,additive_source_menu_id,quantity,description_default,description_delivery,description_table'
    const colsBaseWithDelivery = 'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order'
    const colsBaseWithDeliveryOnly = 'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order'
    const minimalCols = 'id,menu_id,name,price_modifier,sort_order'
    let rows: { id?: number; menu_id?: number; name?: string; price_modifier?: number; price_modifier_delivery?: number | null; price_modifier_packaging?: number | null; sort_order?: number; option_type?: string; item_code?: string | null; additive_source_menu_id?: number | null; quantity?: number; option_step_values?: Record<string, string> | null; sell_hall?: boolean; sell_delivery?: boolean; sell_packaging?: boolean; description_default?: string; description_delivery?: string | null; description_table?: string | null }[] | null = null

    const doSelect = async (cols: string) => {
      if (menuId) {
        return (await supabaseSelectFilter('pos_menu_options', `menu_id=eq.${encodeURIComponent(menuId)}`, { order: 'sort_order.asc,name.asc', limit: 200, select: cols })) as typeof rows
      }
      return (await supabaseSelectAllPages('pos_menu_options', {
        order: 'menu_id.asc,sort_order.asc,name.asc',
        pageSize: 3000,
        select: cols,
      })) as typeof rows
    }

    const selectColsLegacy =
      'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,quantity,option_step_values,sell_hall,sell_delivery,sell_packaging'
    const colsWithoutSellAndStepLegacy =
      'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,quantity'

    try {
      rows = await doSelect(selectCols)
    } catch {
      try {
        rows = await doSelect(selectColsLegacy)
      } catch {
        try {
          rows = await doSelect(colsWithoutSellAndStep)
        } catch {
          try {
            rows = await doSelect(colsWithoutSellAndStepLegacy)
          } catch {
            try {
              rows = await doSelect(colsBaseWithDelivery)
            } catch {
              try {
                rows = await doSelect(colsBaseWithDeliveryOnly)
              } catch {
                rows = await doSelect(minimalCols)
              }
            }
          }
        }
      }
    }

    const list = (rows || [])
      .filter((row) => {
        const mid = Number(row.menu_id || 0)
        return !linkedMenuIds.has(mid)
      })
      .map((row) => {
      const stepValues = row.option_step_values
      const sv = stepValues && typeof stepValues === 'object' && !Array.isArray(stepValues) ? stepValues as Record<string, string> : null
      return {
        id: String(row.id ?? ''),
        menuId: String(row.menu_id ?? ''),
        name: String(row.name ?? ''),
        priceModifier: Number(row.price_modifier) ?? 0,
        priceModifierDelivery: row.price_modifier_delivery != null ? Number(row.price_modifier_delivery) : null,
        priceModifierPackaging: row.price_modifier_packaging != null ? Number(row.price_modifier_packaging) : null,
        sortOrder: Number(row.sort_order) ?? 0,
        optionType: (row.option_type || 'substitution') as 'substitution' | 'additive',
        itemCode: row.item_code ? String(row.item_code).trim() : null,
        additiveSourceMenuId:
          row.additive_source_menu_id != null && Number.isFinite(Number(row.additive_source_menu_id))
            ? Number(row.additive_source_menu_id)
            : null,
        quantity: Number(row.quantity) ?? 1,
        optionStepValues: sv || null,
        sellHall: row.sell_hall != null ? !!row.sell_hall : true,
        sellDelivery: row.sell_delivery != null ? !!row.sell_delivery : true,
        sellPackaging: row.sell_packaging != null ? !!row.sell_packaging : true,
        descriptionDefault: String(row.description_default ?? ''),
        descriptionDelivery:
          row.description_delivery == null ? null : String(row.description_delivery),
        descriptionTable:
          row.description_table == null ? null : String(row.description_table),
      }
    })

    return NextResponse.json([...linkedOptions, ...list], { headers })
  } catch (e) {
    console.error('getPosMenuOptions:', e)
    return NextResponse.json([], { headers })
  }
}
