import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 원가 분석 - 전체 메뉴 + 옵션별 원가/재료 breakdown (본사/매장 구분) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [menuData, sauceData] = await Promise.all([
      Promise.all([
        supabaseSelect('pos_menus', {
          order: 'category.asc,sort_order.asc,name.asc',
          limit: 500,
          select: 'id,code,name,category,price,price_delivery,vat_included',
        }),
        supabaseSelect('pos_menu_ingredients', { limit: 5000, select: 'id,menu_id,option_id,item_code,quantity,loss_rate,ingredient_type' }),
        supabaseSelect('pos_menu_options', { limit: 2000, select: 'id,menu_id,name,option_type,item_code,quantity' }),
        supabaseSelect('items', { limit: 5000, select: 'code,name,cost,price,total_quantity,unit,purchase_source,category' }),
      ]),
      supabaseSelect('sauces', { limit: 500, select: 'code,name,cost_per_unit,unit' }).catch(() => null),
    ])
    const [menuRows, ingRows, optRows, itemRows] = menuData as [
      { id?: number; code?: string; name?: string; category?: string; price?: number; price_delivery?: number | null; vat_included?: boolean }[] | null,
      { id?: number; menu_id?: number; option_id?: number | null; item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null,
      { id?: number; menu_id?: number; name?: string; option_type?: string; item_code?: string | null; quantity?: number }[] | null,
      { code?: string; name?: string; cost?: number; price?: number; total_quantity?: number; unit?: string; purchase_source?: string; category?: string }[] | null,
    ]
    const sauceRows = sauceData as { code?: string; name?: string; cost_per_unit?: number; unit?: string }[] | null

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemMap: Record<string, { name: string; cost: number; unit: string; purchaseSource: 'hq' | 'store'; raw?: typeof itemRows extends (infer R)[] | null ? R : never }> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) {
        const isPkg = /포장|packaging|박스|용기|봉지/.test(String(r.category ?? ''))
        itemMap[code] = {
          name: String(r.name ?? ''),
          cost: getItemCostPerUnit(r, isPkg),
          unit: String(r.unit ?? 'g'),
          purchaseSource: (r.purchase_source ?? 'hq') === 'store' ? 'store' : 'hq',
          raw: r,
        }
      }
    }
    for (const r of sauceRows || []) {
      const code = String(r.code ?? '').trim()
      if (code && !itemMap[code]) {
        itemMap[code] = {
          name: String(r.name ?? ''),
          cost: Number(r.cost_per_unit) ?? 0,
          unit: String(r.unit ?? 'g'),
          purchaseSource: 'hq',
        }
      }
    }

    const menusById: Record<number, typeof menuRows extends (infer R)[] | null ? R : never> = {}
    for (const m of menuRows || []) {
      if (m.id != null) menusById[m.id] = m
    }

    const optsByMenu: Record<number, (typeof optRows) extends (infer R)[] | null ? R[] : never> = {}
    for (const o of optRows || []) {
      const mid = Number(o.menu_id ?? 0)
      if (!optsByMenu[mid]) optsByMenu[mid] = []
      optsByMenu[mid].push(o)
    }

    const ingByMenuOpt: Record<string, (typeof ingRows) extends (infer R)[] | null ? R[] : never> = {}
    for (const ing of ingRows || []) {
      const mid = Number(ing.menu_id ?? 0)
      const oid = ing.option_id != null ? String(ing.option_id) : 'null'
      const key = `${mid}:${oid}`
      if (!ingByMenuOpt[key]) ingByMenuOpt[key] = []
      ingByMenuOpt[key].push(ing)
    }

    interface BreakdownRow {
      itemCode: string
      itemName: string
      unit: string
      costPerUnit: number
      quantity: number
      lossRate: number
      costTotal: number
      source: 'hq' | 'store'
      ingredientType: 'food' | 'packaging'
    }

    interface MenuCostRow {
      menuId: string
      menuCode: string
      menuName: string
      category: string
      priceHall: number
      priceDelivery: number | null
      optionId: string | null
      optionName: string | null
      costHall: number
      costDelivery: number
      breakdown: BreakdownRow[]
    }

    const result: MenuCostRow[] = []

    for (const menu of menuRows || []) {
      const mid = Number(menu.id ?? 0)
      const priceHall = Number(menu.price ?? 0)
      const priceDelivery = menu.price_delivery != null ? Number(menu.price_delivery) : null
      const opts = optsByMenu[mid] || []
      const subOpts = opts.filter((o) => (o.option_type || 'substitution') === 'substitution')
      const addOpts = opts.filter((o) => (o.option_type || '') === 'additive')

      const computeCost = (optionId: string | null): { costHall: number; costDelivery: number; breakdown: BreakdownRow[] } => {
        const oid = optionId === '' || optionId === 'null' ? null : optionId
        const key = `${mid}:${oid ?? 'null'}`
        const ings = ingByMenuOpt[key] || []
        const breakdown: BreakdownRow[] = []
        let foodCost = 0
        let packageCost = 0

        const addRow = (ing: { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }, additive = false) => {
          const code = String(ing.item_code ?? '').trim()
          const qty = Number(ing.quantity) ?? 1
          const lossRate = Number(ing.loss_rate) ?? 0
          const itype = (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' as const : 'food' as const
          const info = itemMap[code]
          const costPerUnit = info?.raw ? getItemCostPerUnit(info.raw, itype === 'packaging') : (info?.cost ?? 0)
          const costTotal = additive ? costPerUnit * qty : costPerUnit * qty * (1 + lossRate / 100)
          if (itype === 'packaging') packageCost += costTotal
          else foodCost += costTotal
          breakdown.push({
            itemCode: code,
            itemName: info?.name ?? code,
            unit: info?.unit ?? '',
            costPerUnit,
            quantity: qty,
            lossRate: additive ? 0 : lossRate,
            costTotal: Math.round(costTotal * 10) / 10,
            source: itemMap[code] ? (itemMap[code].purchaseSource as 'hq' | 'store') : 'store',
            ingredientType: itype,
          })
        }

        for (const ing of ings) {
          addRow(ing)
        }

        return {
          costHall: Math.round(foodCost * 10) / 10,
          costDelivery: Math.round((foodCost + packageCost) * 10) / 10,
          breakdown,
        }
      }

      const base = computeCost(null)
      result.push({
        menuId: String(menu.id ?? ''),
        menuCode: String(menu.code ?? ''),
        menuName: String(menu.name ?? ''),
        category: String(menu.category ?? ''),
        priceHall,
        priceDelivery,
        optionId: null,
        optionName: null,
        costHall: base.costHall,
        costDelivery: base.costDelivery,
        breakdown: base.breakdown,
      })

      for (const opt of subOpts) {
        const computed = computeCost(String(opt.id))
        result.push({
          menuId: String(menu.id ?? ''),
          menuCode: String(menu.code ?? ''),
          menuName: String(menu.name ?? ''),
          category: String(menu.category ?? ''),
          priceHall,
          priceDelivery,
          optionId: String(opt.id ?? ''),
          optionName: String(opt.name ?? ''),
          costHall: computed.costHall,
          costDelivery: computed.costDelivery,
          breakdown: computed.breakdown,
        })
      }

      for (const opt of addOpts) {
        const baseCost = base.costHall
        const basePkg = base.costDelivery - base.costHall
        let addFood = 0
        const addBreakdown: BreakdownRow[] = [...base.breakdown]
        if (opt.item_code) {
          const info = itemMap[String(opt.item_code).trim()]
          const qty = Number(opt.quantity) ?? 1
          const costTotal = (info?.cost ?? 0) * qty
          addFood = costTotal
          addBreakdown.push({
            itemCode: String(opt.item_code ?? ''),
            itemName: info?.name ?? String(opt.item_code ?? ''),
            unit: info?.unit ?? '',
            costPerUnit: info?.cost ?? 0,
            quantity: qty,
            lossRate: 0,
            costTotal: Math.round(costTotal * 10) / 10,
            source: info ? (info.purchaseSource as 'hq' | 'store') : 'store',
            ingredientType: 'food',
          })
        }
        result.push({
          menuId: String(menu.id ?? ''),
          menuCode: String(menu.code ?? ''),
          menuName: String(menu.name ?? ''),
          category: String(menu.category ?? ''),
          priceHall,
          priceDelivery,
          optionId: String(opt.id ?? ''),
          optionName: String(opt.name ?? ''),
          costHall: Math.round((baseCost + addFood) * 10) / 10,
          costDelivery: Math.round((baseCost + addFood + basePkg) * 10) / 10,
          breakdown: addBreakdown,
        })
      }
    }

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getPosMenuCostAnalysis:', e)
    return NextResponse.json([], { headers })
  }
}
