import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectAllPages,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import {
  type PosOptionGroupRow,
  buildMenuOptionsFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  isMissingTenantIdColumnError,
  isPosCatalogTenantQueryBlocked,
  markPosMenusTenantIdColumnMissing,
  resolvePosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

/** POS 메뉴 옵션 목록 조회 (menu_id별 필터 가능) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()
  const forCodeMap =
    searchParams.get('forCodeMap') === '1' || searchParams.get('forCodeMap') === 'true'

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    if (isPosCatalogTenantQueryBlocked(catalogScope)) {
      return NextResponse.json([], { headers })
    }
    const tenantFilter = appendPosCatalogTenantFilter('', catalogScope)

    const linkedOptions: ReturnType<typeof buildMenuOptionsFromLinks> = []
    const linkedMenuIds = new Set<number>()
    const menuCodeById = new Map<number, string>()
    const groupsById = new Map<number, PosOptionGroupRow>()
    let itemsByGroupId: Awaited<ReturnType<typeof loadPosOptionGroupsWithItems>>['itemsByGroupId'] =
      new Map()
    const linksByMenuId = new Map<number, Awaited<ReturnType<typeof loadMenuGroupLinks>>>()
    try {
      const [{ groups, itemsByGroupId: loadedItemsByGroupId }, links] = await Promise.all([
        loadPosOptionGroupsWithItems(catalogScope),
        loadMenuGroupLinks(
          menuId && Number.isFinite(Number(menuId)) ? Number(menuId) : undefined
        ),
      ])
      itemsByGroupId = loadedItemsByGroupId
      for (const g of groups || []) {
        const id = Number(g.id || 0)
        if (!id) continue
        groupsById.set(id, g)
      }
      for (const link of links || []) {
        const mid = Number(link.menu_id || 0)
        if (!mid) continue
        linkedMenuIds.add(mid)
        if (!linksByMenuId.has(mid)) linksByMenuId.set(mid, [])
        linksByMenuId.get(mid)!.push(link)
      }
    } catch {
      // 신규 구조 미배포 환경 fallback
    }

    try {
      if (menuId && Number.isFinite(Number(menuId))) {
        const singleMenuId = Number(menuId)
        const menuFilter = appendPosCatalogTenantFilter(
          `id=eq.${singleMenuId}`,
          catalogScope
        )
        const menuRows = (await supabaseSelectFilter('pos_menus', menuFilter, {
          limit: 1,
          select: 'id,code',
        })) as { id?: number; code?: string }[] | null
        const first = menuRows?.[0]
        if (first?.id != null) {
          menuCodeById.set(Number(first.id), String(first.code ?? '').trim())
        }
      } else if (tenantFilter) {
        const menuRows = (await supabaseSelectFilter('pos_menus', tenantFilter, {
          order: 'id.asc',
          limit: 10000,
          select: 'id,code',
        })) as { id?: number; code?: string }[] | null
        for (const row of menuRows || []) {
          const id = Number(row.id || 0)
          if (!id) continue
          menuCodeById.set(id, String(row.code ?? '').trim())
        }
      } else {
        const menuRows = (await supabaseSelectAllPages('pos_menus', {
          order: 'id.asc',
          pageSize: 3000,
          maxRows: 200000,
          select: 'id,code',
        })) as { id?: number; code?: string }[] | null
        for (const row of menuRows || []) {
          const id = Number(row.id || 0)
          if (!id) continue
          menuCodeById.set(id, String(row.code ?? '').trim())
        }
      }
    } catch (err) {
      if (isMissingTenantIdColumnError(err)) {
        markPosMenusTenantIdColumnMissing()
        if (catalogScope.enforce) return NextResponse.json([], { headers })
      }
      // fallback: option_code가 없으면 응답에서 빈 문자열 허용
    }

    for (const [mid, menuLinks] of linksByMenuId.entries()) {
      if (catalogScope.enforce && !menuCodeById.has(mid)) continue
      linkedOptions.push(
        ...buildMenuOptionsFromLinks(
          mid,
          menuLinks,
          groupsById,
          itemsByGroupId,
          menuCodeById.get(mid)
        )
      )
    }

    const selectCols =
      'id,menu_id,name,option_code,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,additive_source_menu_id,quantity,option_step_values,sell_hall,sell_delivery,sell_packaging,sell_member,description_default,description_delivery,description_table'
    const colsWithoutSellAndStep =
      'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order,option_type,item_code,additive_source_menu_id,quantity,description_default,description_delivery,description_table'
    const colsBaseWithDelivery = 'id,menu_id,name,price_modifier,price_modifier_delivery,price_modifier_packaging,sort_order'
    const colsBaseWithDeliveryOnly = 'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order'
    const minimalCols = 'id,menu_id,name,price_modifier,sort_order'
    let rows: { id?: number; menu_id?: number; name?: string; option_code?: string | null; price_modifier?: number; price_modifier_delivery?: number | null; price_modifier_packaging?: number | null; sort_order?: number; option_type?: string; item_code?: string | null; additive_source_menu_id?: number | null; quantity?: number; option_step_values?: Record<string, string> | null; sell_hall?: boolean; sell_delivery?: boolean; sell_packaging?: boolean; sell_member?: boolean; description_default?: string; description_delivery?: string | null; description_table?: string | null }[] | null = null

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

    const linkedStepKeysByMenuId = new Map<number, Set<string>>()
    for (const opt of linkedOptions) {
      const mid = Number(opt.menuId || 0)
      if (!mid) continue
      if (!linkedStepKeysByMenuId.has(mid)) linkedStepKeysByMenuId.set(mid, new Set())
      const keys = linkedStepKeysByMenuId.get(mid)!
      for (const k of Object.keys(opt.optionStepValues || {})) {
        const t = String(k).trim()
        if (t) keys.add(t)
      }
    }

    const list = (rows || [])
      .filter((row) => {
        const mid = Number(row.menu_id || 0)
        if (catalogScope.enforce && mid && !menuCodeById.has(mid)) return false
        if (forCodeMap) return true
        if (!linkedMenuIds.has(mid)) return true
        const stepValues = row.option_step_values
        const sv =
          stepValues && typeof stepValues === 'object' && !Array.isArray(stepValues)
            ? (stepValues as Record<string, string>)
            : null
        if (!sv || Object.keys(sv).length === 0) return true
        const linkedKeys = linkedStepKeysByMenuId.get(mid)
        if (!linkedKeys || linkedKeys.size === 0) return true
        return Object.keys(sv).some((k) => !linkedKeys.has(k))
      })
      .map((row) => {
      const stepValues = row.option_step_values
      const sv = stepValues && typeof stepValues === 'object' && !Array.isArray(stepValues) ? stepValues as Record<string, string> : null
      return {
        id: String(row.id ?? ''),
        menuId: String(row.menu_id ?? ''),
        optionCode: row.option_code && String(row.option_code).trim() ? String(row.option_code).trim() : '',
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
        sellMember:
          row.sell_member != null
            ? !!row.sell_member
            : row.sell_packaging != null
              ? !!row.sell_packaging
              : true,
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
