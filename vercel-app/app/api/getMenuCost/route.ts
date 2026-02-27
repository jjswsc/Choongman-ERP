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
    const itemRows = (await supabaseSelect('items', {
      limit: 1000,
      select: 'code,cost,price,total_quantity,unit,name,category',
    })) as { code?: string; cost?: number; price?: number; total_quantity?: number; unit?: string; name?: string; category?: string }[] | null

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemByCode: Record<string, (typeof itemRows)[number]> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) itemByCode[code] = r
    }

    const breakdown: { itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number }[] = []
    let totalCost = 0

    let optionType = 'substitution'
    let optionItemCode: string | null = null
    let optionQty = 1

    if (optionId && optionId !== 'null') {
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
      }
    }

    let filter = `menu_id=eq.${encodeURIComponent(menuId)}`
    if (optionId && optionId !== 'null' && optionType === 'substitution') {
      filter += `&option_id=eq.${encodeURIComponent(optionId)}`
    } else {
      filter += '&option_id=is.null'
    }

    let ingRows: { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null
    try {
      ingRows = (await supabaseSelectFilter('pos_menu_ingredients', filter, { order: 'id.asc', limit: 200 })) as typeof ingRows
    } catch {
      ingRows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${encodeURIComponent(menuId)}`, { order: 'id.asc', limit: 200 })) as typeof ingRows
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

    if (optionType === 'additive' && optionItemCode && optionId && optionId !== 'null') {
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

    const cost = Math.round(totalCost * 10) / 10
    const costHall = Math.round(foodCost * 10) / 10
    const costDelivery = Math.round((foodCost + packageCost) * 10) / 10

    return NextResponse.json({ cost, costHall, costDelivery, breakdown }, { headers })
  } catch (e) {
    console.error('getMenuCost:', e)
    return NextResponse.json({ cost: 0, breakdown: [] }, { headers })
  }
}
