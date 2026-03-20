import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 치킨 기본 옵션(S 순살): 원가 분석에서는 메뉴 기본 행으로 이미 포함되므로 옵션 목록에서 제외 */
function isChickenDefaultOption(name: string | undefined): boolean {
  const n = String(name ?? '').trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살'
}

/** POS 메뉴 원가 분석 - 전체 메뉴 + 옵션별 원가/재료 breakdown (본사/매장 구분) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [menuData, sauceData, sauceIngData] = await Promise.all([
      Promise.all([
        (async () => {
          try {
            return await supabaseSelect('pos_menus', {
              order: 'category_main.asc,category.asc,sort_order.asc,name.asc',
              limit: 500,
              select: 'id,code,name,category,category_main,price,price_delivery,vat_included,cooking_time_min',
            })
          } catch {
            return supabaseSelect('pos_menus', {
              order: 'category.asc,sort_order.asc,name.asc',
              limit: 500,
              select: 'id,code,name,category,price,price_delivery,vat_included',
            })
          }
        })(),
        supabaseSelect('pos_menu_ingredients', { limit: 5000, select: 'id,menu_id,option_id,item_code,quantity,loss_rate,ingredient_type' }),
        (async () => {
          try {
            return await supabaseSelect('pos_menu_options', { limit: 2000, order: 'menu_id.asc,sort_order.asc,name.asc', select: 'id,menu_id,name,option_type,item_code,quantity,sort_order,price_modifier,price_modifier_delivery' })
          } catch {
            return supabaseSelect('pos_menu_options', { limit: 2000, order: 'menu_id.asc,sort_order.asc,name.asc', select: 'id,menu_id,name,option_type,item_code,quantity,sort_order' })
          }
        })(),
        supabaseSelect('items', { limit: 5000, select: 'code,name,cost,price,total_quantity,unit,purchase_source,category' }),
      ]),
      supabaseSelect('sauces', { limit: 500, select: 'id,code,name,cost_per_unit,unit,overhead_percent' }).catch(() => null),
      supabaseSelect('sauce_ingredients', { limit: 5000, select: 'sauce_id,item_code,quantity,loss_rate' }).catch(() => null),
    ])
    const [menuRows, ingRows, optRows, itemRows] = menuData as [
      { id?: number; code?: string; name?: string; category?: string; category_main?: string; price?: number; price_delivery?: number | null; vat_included?: boolean; cooking_time_min?: number | null }[] | null,
      { id?: number; menu_id?: number; option_id?: number | null; item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null,
      { id?: number; menu_id?: number; name?: string; option_type?: string; item_code?: string | null; quantity?: number; sort_order?: number; price_modifier?: number; price_modifier_delivery?: number | null }[] | null,
      { code?: string; name?: string; cost?: number; price?: number; total_quantity?: number; unit?: string; purchase_source?: string; category?: string }[] | null,
    ]
    const sauceRows = sauceData as { id?: number; code?: string; name?: string; cost_per_unit?: number; unit?: string; overhead_percent?: number }[] | null
    const sauceIngRows = sauceIngData as { sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[] | null

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
    const sauceCostComputed: Record<string, number> = {}
    const sauceByCode: Record<string, { id?: number; cost_per_unit?: number; overhead_percent?: number }> = {}
    for (const s of sauceRows || []) {
      const c = String(s.code ?? '').trim()
      if (c) sauceByCode[c] = s
    }
    const ingBySauce: Record<number, { item_code?: string; quantity?: number; loss_rate?: number }[]> = {}
    for (const si of sauceIngRows || []) {
      const sid = Number(si.sauce_id ?? 0)
      if (!ingBySauce[sid]) ingBySauce[sid] = []
      ingBySauce[sid].push(si)
    }
    for (let pass = 0; pass < 5; pass++) {
      let changed = false
      for (const s of sauceRows || []) {
        const code = String(s.code ?? '').trim()
        if (!code || Number(s.cost_per_unit ?? 0) > 0) continue
        const ings = ingBySauce[Number(s.id ?? 0)] || []
        let totalCost = 0
        let totalQty = 0
        let ok = true
        for (const ing of ings) {
          const icode = String(ing.item_code ?? '').trim()
          const qty = Number(ing.quantity ?? 1)
          const lossRate = Number(ing.loss_rate ?? 0)
          const itemInfo = itemMap[icode]
          let subCost: number | undefined
          if (itemInfo) subCost = itemInfo.cost
          else if (sauceByCode[icode]) subCost = (sauceCostComputed[icode] ?? Number(sauceByCode[icode].cost_per_unit ?? 0)) || undefined
          if (subCost === undefined) {
            ok = false
            break
          }
          totalCost += subCost * qty * (1 + lossRate / 100)
          totalQty += qty
        }
        if (ok && totalQty > 0) {
          const oh = Number(s.overhead_percent ?? 5)
          const cost = (totalCost * (1 + oh / 100)) / totalQty
          if (Math.abs((sauceCostComputed[code] ?? 0) - cost) > 1e-9) {
            sauceCostComputed[code] = cost
            changed = true
          }
        }
      }
      if (!changed) break
    }
    for (const r of sauceRows || []) {
      const code = String(r.code ?? '').trim()
      if (code && !itemMap[code]) {
        const cost = Number(r.cost_per_unit ?? 0) > 0 ? Number(r.cost_per_unit ?? 0) : (sauceCostComputed[code] ?? 0)
        itemMap[code] = {
          name: String(r.name ?? ''),
          cost,
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
      categoryMain: string
      priceHall: number
      priceDelivery: number | null
      vatIncluded: boolean
      optionId: string | null
      optionName: string | null
      optionType?: 'substitution' | 'additive' | null
      costHall: number
      costDelivery: number
      breakdown: BreakdownRow[]
      cookingTimeMin?: number | null
    }

    const result: MenuCostRow[] = []

    for (const menu of menuRows || []) {
      const mid = Number(menu.id ?? 0)
      const priceHall = Number(menu.price ?? 0)
      const priceDelivery = menu.price_delivery != null ? Number(menu.price_delivery) : null
      const opts = optsByMenu[mid] || []
      const sortOpt = (a: { sort_order?: number; id?: number }, b: { sort_order?: number; id?: number }) =>
        (a.sort_order ?? 999) - (b.sort_order ?? 999) || (a.id ?? 0) - (b.id ?? 0)
      const subOpts = opts.filter((o) => (o.option_type || 'substitution') === 'substitution').sort(sortOpt)
      const addOpts = opts.filter((o) => (o.option_type || '') === 'additive').sort(sortOpt)
      /** 메뉴 관리와 동일: 옵션 전체를 sort_order 순으로. 치킨은 S 순살(기본) 제외하고 M 순살/윙/봉만 표시 */
      const allOptsSorted = [...subOpts, ...addOpts].sort(sortOpt)
      const isChicken = String(menu.code ?? '').trim().toLowerCase().startsWith('c')
      const optsToShow = isChicken ? allOptsSorted.filter((o) => !isChickenDefaultOption(o.name)) : allOptsSorted

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
      const categoryMain = String(menu.category_main ?? '').trim()
      const cookingTimeMin = menu.cooking_time_min != null && Number.isFinite(menu.cooking_time_min) ? menu.cooking_time_min : null
      const vatIncluded = menu.vat_included !== false
      result.push({
        menuId: String(menu.id ?? ''),
        menuCode: String(menu.code ?? ''),
        menuName: String(menu.name ?? ''),
        category: String(menu.category ?? ''),
        categoryMain,
        priceHall,
        priceDelivery,
        vatIncluded,
        optionId: null,
        optionName: null,
        optionType: null,
        costHall: base.costHall,
        costDelivery: base.costDelivery,
        breakdown: base.breakdown,
        cookingTimeMin,
      })

      for (const opt of optsToShow) {
        const modHall = Number(opt.price_modifier ?? 0)
        const modDelivery = opt.price_modifier_delivery != null ? Number(opt.price_modifier_delivery) : modHall
        const optPriceHall = priceHall + modHall
        const optPriceDelivery = priceDelivery != null ? priceDelivery + modDelivery : null
        const isAdditive = (opt.option_type || '') === 'additive'
        if (isAdditive) {
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
            categoryMain,
            priceHall: optPriceHall,
            priceDelivery: optPriceDelivery,
            vatIncluded,
            optionId: String(opt.id ?? ''),
            optionName: String(opt.name ?? ''),
            optionType: 'additive',
            costHall: Math.round((baseCost + addFood) * 10) / 10,
            costDelivery: Math.round((baseCost + addFood + basePkg) * 10) / 10,
            breakdown: addBreakdown,
            cookingTimeMin,
          })
        } else {
          const computed = computeCost(String(opt.id))
          result.push({
            menuId: String(menu.id ?? ''),
            menuCode: String(menu.code ?? ''),
            menuName: String(menu.name ?? ''),
            category: String(menu.category ?? ''),
            categoryMain,
            priceHall: optPriceHall,
            priceDelivery: optPriceDelivery,
            vatIncluded,
            optionId: String(opt.id ?? ''),
            optionName: String(opt.name ?? ''),
            optionType: 'substitution',
            costHall: computed.costHall,
            costDelivery: computed.costDelivery,
            breakdown: computed.breakdown,
            cookingTimeMin,
          })
        }
      }
    }

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getPosMenuCostAnalysis:', e)
    return NextResponse.json([], { headers })
  }
}
