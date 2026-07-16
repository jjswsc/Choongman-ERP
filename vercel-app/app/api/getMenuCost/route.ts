import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bomStoredToDisplay, normalizeQuantityUnitKey } from '@/lib/pos-menu-ingredient-quantity-unit'
import { resolveInventoryTenantScope } from '@/lib/inventory-tenant-scope'
import { loadPosMenuForBom, resolvePosMenuBomTenantScope } from '@/lib/pos-menu-bom-tenant'
import {
  loadPosCostItemLookup,
  posCostLineCostPerUnit,
  resolvePosCostItemInfo,
} from '@/lib/pos-menu-cost-item-lookup-server'
import { requireAuth } from '@/lib/verify-auth'

/** POS 메뉴 원가 계산 (로스율 적용, 소수점 첫째자리) - 대체형/추가형 옵션 지원 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const catalogScope = await resolvePosMenuBomTenantScope(authRes.auth)
  const inventoryScope = await resolveInventoryTenantScope({ auth: authRes.auth })

  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()
  const optionId = searchParams.get('optionId')?.trim()

  if (!menuId) {
    return NextResponse.json({ cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }, { headers })
  }

  const midNum = Number(menuId)
  if (catalogScope.enforce && Number.isFinite(midNum) && midNum > 0) {
    const menu = await loadPosMenuForBom(midNum, catalogScope)
    if (!menu?.id) {
      return NextResponse.json({ cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }, { headers })
    }
  }

  try {
    const itemLookup = await loadPosCostItemLookup(inventoryScope)

    type BreakdownRow = {
      itemCode: string
      itemName: string
      unit: string
      costPerUnit: number
      quantity: number
      lossRate: number
      costTotal: number
      source: 'hq' | 'store'
      ingredientType: 'food' | 'packaging'
      quantityUnitKey?: string
    }

    const breakdown: BreakdownRow[] = []
    let optionType = 'substitution'
    let optionItemCode: string | null = null
    let additiveSourceMenuId: number | null = null
    let optionQty = 1

    if (optionId && optionId !== 'null') {
      try {
        const optRows = (await supabaseSelectFilter('pos_menu_options', `id=eq.${encodeURIComponent(optionId)}`, {
          limit: 1,
          select: 'option_type,item_code,additive_source_menu_id,quantity,menu_id',
        })) as {
          option_type?: string
          item_code?: string | null
          additive_source_menu_id?: number | null
          quantity?: number
          menu_id?: number
        }[] | null
        const opt = optRows?.[0]
        if (opt) {
          if (catalogScope.enforce && Number(opt.menu_id || 0) !== Math.floor(midNum)) {
            return NextResponse.json({ cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }, { headers })
          }
          optionType = (opt.option_type || 'substitution') as string
          optionItemCode = opt.item_code ? String(opt.item_code).trim() : null
          const aid = opt.additive_source_menu_id
          additiveSourceMenuId =
            aid != null && Number.isFinite(Number(aid)) && Number(aid) > 0 ? Number(aid) : null
          optionQty = Number(opt.quantity) ?? 1
        }
      } catch {
        try {
          const optRows = (await supabaseSelectFilter('pos_menu_options', `id=eq.${encodeURIComponent(optionId)}`, {
            limit: 1,
            select: 'option_type,item_code,quantity,menu_id',
          })) as { option_type?: string; item_code?: string | null; quantity?: number; menu_id?: number }[] | null
          const opt = optRows?.[0]
          if (opt) {
            if (catalogScope.enforce && Number(opt.menu_id || 0) !== Math.floor(midNum)) {
              return NextResponse.json({ cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }, { headers })
            }
            optionType = (opt.option_type || 'substitution') as string
            optionItemCode = opt.item_code ? String(opt.item_code).trim() : null
            optionQty = Number(opt.quantity) ?? 1
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (additiveSourceMenuId && catalogScope.enforce) {
      const srcMenu = await loadPosMenuForBom(additiveSourceMenuId, catalogScope)
      if (!srcMenu?.id) {
        additiveSourceMenuId = null
      }
    }

    const fetchIng = (filter: string) =>
      supabaseSelectFilter('pos_menu_ingredients', filter, { order: 'id.asc', limit: 200 }) as Promise<
        {
          item_code?: string
          quantity?: number
          loss_rate?: number
          ingredient_type?: string
          option_id?: unknown
          quantity_unit_key?: string | null
        }[] | null
      >

    let ingRows: {
      item_code?: string
      quantity?: number
      loss_rate?: number
      ingredient_type?: string
      quantity_unit_key?: string | null
    }[] | null = null
    const midEnc = encodeURIComponent(menuId)
    try {
      if (optionId && optionId !== 'null' && optionType === 'substitution') {
        ingRows = await fetchIng(`menu_id=eq.${midEnc}&option_id=eq.${encodeURIComponent(optionId)}`)
        if (!ingRows?.length) {
          ingRows = await fetchIng(`menu_id=eq.${midEnc}&option_id=is.null`)
        }
        if (!ingRows?.length) {
          ingRows = await fetchIng(`menu_id=eq.${midEnc}&option_id=eq.0`)
        }
      } else {
        ingRows = await fetchIng(`menu_id=eq.${midEnc}&option_id=is.null`)
        if (!ingRows?.length) {
          ingRows = await fetchIng(`menu_id=eq.${midEnc}&option_id=eq.0`)
        }
      }
    } catch {
      try {
        const all = await fetchIng(`menu_id=eq.${midEnc}`)
        const isBaseOpt = (raw: unknown) => {
          if (raw == null) return true
          if (typeof raw === 'number' && raw === 0) return true
          const s = String(raw).trim()
          return s === '' || s === '0'
        }
        if (optionId && optionId !== 'null' && optionType === 'substitution') {
          const spec = (all || []).filter((r) => String((r as { option_id?: unknown }).option_id ?? '') === String(optionId))
          ingRows = spec.length > 0 ? spec : (all || []).filter((r) => isBaseOpt((r as { option_id?: unknown }).option_id))
        } else {
          ingRows = (all || []).filter((r) => isBaseOpt((r as { option_id?: unknown }).option_id))
        }
      } catch {
        ingRows = null
      }
    }

    const addIngredientRow = (
      ing: {
        item_code?: string
        quantity?: number
        loss_rate?: number
        ingredient_type?: string
        quantity_unit_key?: string | null
      },
      qtyMultiplier = 1,
      additive = false
    ): { food: number; packaging: number } => {
      const code = String(ing.item_code ?? '').trim()
      if (!code) return { food: 0, packaging: 0 }
      const lossRate = Number(ing.loss_rate) ?? 0
      const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? ('packaging' as const) : ('food' as const)
      const info = resolvePosCostItemInfo(code, itemLookup)
      const costPerUnit = posCostLineCostPerUnit(info, itype === 'packaging')
      const baseStored = (Number(ing.quantity) ?? 1) * qtyMultiplier
      const key = String(ing.quantity_unit_key ?? '').trim() || null
      const itemMeta = info?.raw
        ? { unit: info.raw.unit, totalQuantity: info.raw.total_quantity, category: info.raw.category }
        : undefined
      const { quantity, unit } = bomStoredToDisplay(baseStored, key, itype, itemMeta)
      const storedQty = baseStored
      const costTotal = additive
        ? costPerUnit * storedQty
        : costPerUnit * storedQty * (1 + lossRate / 100)
      breakdown.push({
        itemCode: code,
        itemName: info?.name ?? code,
        unit,
        costPerUnit,
        quantity,
        lossRate: additive ? 0 : lossRate,
        costTotal: Math.round(costTotal * 10) / 10,
        source: info ? info.purchaseSource : 'store',
        ingredientType: itype,
        quantityUnitKey: normalizeQuantityUnitKey(key, itype),
      })
      if (itype === 'packaging') return { food: 0, packaging: costTotal }
      return { food: costTotal, packaging: 0 }
    }

    let foodCost = 0
    let packageCost = 0
    for (const ing of ingRows || []) {
      const line = addIngredientRow(ing)
      foodCost += line.food
      packageCost += line.packaging
    }

    if (optionType === 'additive' && optionId && optionId !== 'null') {
      if (additiveSourceMenuId) {
        let addIng: {
          item_code?: string
          quantity?: number
          loss_rate?: number
          ingredient_type?: string
          quantity_unit_key?: string | null
        }[] | null
        try {
          addIng = (await supabaseSelectFilter(
            'pos_menu_ingredients',
            `menu_id=eq.${encodeURIComponent(String(additiveSourceMenuId))}&option_id=is.null`,
            { order: 'id.asc', limit: 200 }
          )) as typeof addIng
        } catch {
          addIng = null
        }
        for (const ing of addIng || []) {
          const line = addIngredientRow(ing, optionQty)
          foodCost += line.food
          packageCost += line.packaging
        }
      } else if (optionItemCode) {
        const info = resolvePosCostItemInfo(optionItemCode, itemLookup)
        const costPerUnit = posCostLineCostPerUnit(info, false)
        const costTotal = costPerUnit * optionQty
        foodCost += costTotal
        breakdown.push({
          itemCode: optionItemCode,
          itemName: info?.name ?? optionItemCode,
          unit: info?.unit ?? '',
          costPerUnit,
          quantity: optionQty,
          lossRate: 0,
          costTotal: Math.round(costTotal * 10) / 10,
          source: info ? info.purchaseSource : 'store',
          ingredientType: 'food',
        })
      }
      try {
        const optIng = await fetchIng(`menu_id=eq.${midEnc}&option_id=eq.${encodeURIComponent(optionId)}`)
        for (const ing of optIng || []) {
          const line = addIngredientRow(ing)
          foodCost += line.food
          packageCost += line.packaging
        }
      } catch {
        /* ignore */
      }
    }

    const costHall = Math.round(foodCost * 10) / 10
    const costDelivery = Math.round((foodCost + packageCost) * 10) / 10
    const cost = costDelivery

    return NextResponse.json({ cost, costHall, costDelivery, breakdown }, { headers })
  } catch (e) {
    console.error('getMenuCost:', e)
    return NextResponse.json({ cost: 0, costHall: 0, costDelivery: 0, breakdown: [] }, { headers })
  }
}
