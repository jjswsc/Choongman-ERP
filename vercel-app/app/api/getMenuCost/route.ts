import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 원가 계산 (로스율 적용, 소수점 첫째자리) - 대체형/추가형 옵션 지원 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()
  const optionId = searchParams.get('optionId')?.trim()

  if (!menuId) {
    return NextResponse.json({ cost: 0, breakdown: [] }, { headers })
  }

  try {
    type ItemRow = { code?: string; cost?: number; price?: number; total_quantity?: number; unit?: string; name?: string; category?: string }
    const itemRows = (await supabaseSelect('items', {
      order: 'code.asc',
      limit: 50000,
      select: 'code,cost,price,total_quantity,unit,name,category',
    })) as ItemRow[] | null

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemByCode: Record<string, ItemRow> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) itemByCode[code] = r
    }

    const breakdown: { itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number }[] = []
    let totalCost = 0

    let optionType = 'substitution'
    let optionItemCode: string | null = null
    let additiveSourceMenuId: number | null = null
    let optionQty = 1

    if (optionId && optionId !== 'null') {
      try {
        const optRows = (await supabaseSelectFilter('pos_menu_options', `id=eq.${encodeURIComponent(optionId)}`, {
          limit: 1,
          select: 'option_type,item_code,additive_source_menu_id,quantity',
        })) as { option_type?: string; item_code?: string | null; additive_source_menu_id?: number | null; quantity?: number }[] | null
        const opt = optRows?.[0]
        if (opt) {
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
            select: 'option_type,item_code,quantity',
          })) as { option_type?: string; item_code?: string | null; quantity?: number }[] | null
          const opt = optRows?.[0]
          if (opt) {
            optionType = (opt.option_type || 'substitution') as string
            optionItemCode = opt.item_code ? String(opt.item_code).trim() : null
            optionQty = Number(opt.quantity) ?? 1
          }
        } catch {
          /* ignore */
        }
      }
    }

    const fetchIng = (filter: string) =>
      supabaseSelectFilter('pos_menu_ingredients', filter, { order: 'id.asc', limit: 200 }) as Promise<
        { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string; option_id?: unknown }[] | null
      >

    let ingRows: { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null = null
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

    const ingredients = ingRows || []
    let foodCost = 0
    let packageCost = 0

    for (const ing of ingredients) {
      const code = String(ing.item_code ?? '').trim()
      const qty = Number(ing.quantity) ?? 1
      const lossRate = Number(ing.loss_rate) ?? 0
      const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
      const item = itemByCode[code]
      const costPerUnit = item ? getItemCostPerUnit(item, itype === 'packaging') : 0
      const costTotal = costPerUnit * qty * (1 + lossRate / 100)
      if (itype === 'packaging') packageCost += costTotal
      else foodCost += costTotal
      totalCost += costTotal
      breakdown.push({
        itemCode: code,
        itemName: item?.name ?? code,
        quantity: qty,
        lossRate,
        costPerUnit,
        costTotal: Math.round(costTotal * 10) / 10,
      })
    }

    if (optionType === 'additive' && optionId && optionId !== 'null') {
      if (additiveSourceMenuId) {
        let addIng: { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null
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
          const code = String(ing.item_code ?? '').trim()
          if (!code) continue
          const qty = (Number(ing.quantity) ?? 1) * optionQty
          const lossRate = Number(ing.loss_rate) ?? 0
          const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
          const item = itemByCode[code]
          const costPerUnit = item ? getItemCostPerUnit(item, itype === 'packaging') : 0
          const costTotal = costPerUnit * qty * (1 + lossRate / 100)
          if (itype === 'packaging') packageCost += costTotal
          else foodCost += costTotal
          totalCost += costTotal
          breakdown.push({
            itemCode: code,
            itemName: item?.name ?? code,
            quantity: qty,
            lossRate,
            costPerUnit,
            costTotal: Math.round(costTotal * 10) / 10,
          })
        }
      } else if (optionItemCode) {
        const optItem = itemByCode[optionItemCode]
        const costPerUnit = optItem ? getItemCostPerUnit(optItem, false) : 0
        const costTotal = costPerUnit * optionQty
        foodCost += costTotal
        totalCost += costTotal
        breakdown.push({
          itemCode: optionItemCode,
          itemName: optItem?.name ?? optionItemCode,
          quantity: optionQty,
          lossRate: 0,
          costPerUnit,
          costTotal: Math.round(costTotal * 10) / 10,
        })
      }
    }

    const cost = Math.round(totalCost * 10) / 10
    const costHall = Math.round(foodCost * 10) / 10
    const costDelivery = Math.round((foodCost + packageCost) * 10) / 10

    return NextResponse.json({ cost, costHall, costDelivery, breakdown }, { headers })
  } catch (e) {
    console.error('getMenuCost:', e)
    return NextResponse.json({ cost: 0, breakdown: [] }, { headers })
  }
}
