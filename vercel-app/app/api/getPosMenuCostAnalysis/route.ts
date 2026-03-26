import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectAllPages } from '@/lib/supabase-server'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'

/** 메뉴·재료·옵션 페이지 반복 조회 시 서버리스 타임아웃 완화 (플랜별 상한 적용) */
export const maxDuration = 120

/** 치킨 기본 옵션(S 순살): 원가 분석에서는 메뉴 기본 행으로 이미 포함되므로 옵션 목록에서 제외 */
function isChickenDefaultOption(name: string | undefined): boolean {
  const n = String(name ?? '').trim()
  return /^S\s*[-]?\s*순살\s*$/i.test(n) || n === 'S 순살' || n === 'S - 순살' || n === 'S-순살'
}

type MenuRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number
  price_delivery?: number | null
  vat_included?: boolean
  cooking_time_min?: number | null
}
type IngRow = {
  id?: number
  menu_id?: number
  option_id?: number | null
  item_code?: string
  quantity?: number
  loss_rate?: number
  ingredient_type?: string
}
type OptRow = {
  id?: number
  menu_id?: number
  name?: string
  option_type?: string
  item_code?: string | null
  additive_source_menu_id?: number | null
  quantity?: number
  sort_order?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
}
type ItemRow = {
  code?: string
  name?: string
  cost?: number
  price?: number
  total_quantity?: number
  unit?: string
  purchase_source?: string
  category?: string
}

async function loadPosMenusPaged(): Promise<MenuRow[]> {
  const pageSize = 8000
  const fetchAll = async (order: string, select: string) => {
    const acc: MenuRow[] = []
    for (let offset = 0; ; offset += pageSize) {
      const batch = await supabaseSelect('pos_menus', { order, limit: pageSize, offset, select })
      const rows = Array.isArray(batch) ? (batch as MenuRow[]) : []
      acc.push(...rows)
      if (rows.length < pageSize) break
    }
    return acc
  }
  try {
    return await fetchAll(
      'category_main.asc,category.asc,sort_order.asc,name.asc',
      'id,code,name,category,category_main,price,price_delivery,vat_included,cooking_time_min'
    )
  } catch {
    return await fetchAll(
      'category.asc,sort_order.asc,name.asc',
      'id,code,name,category,price,price_delivery,vat_included'
    )
  }
}

async function loadPosMenuOptionsPaged(): Promise<OptRow[]> {
  const pageSize = 3000
  const order = 'menu_id.asc,sort_order.asc,name.asc'
  const selects = [
    'id,menu_id,name,option_type,item_code,additive_source_menu_id,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_type,item_code,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_type,item_code,quantity,sort_order',
  ]
  for (const select of selects) {
    try {
      const acc: OptRow[] = []
      for (let offset = 0; ; offset += pageSize) {
        const batch = await supabaseSelect('pos_menu_options', { order, limit: pageSize, offset, select })
        const rows = Array.isArray(batch) ? (batch as OptRow[]) : []
        acc.push(...rows)
        if (rows.length < pageSize) break
      }
      return acc
    } catch {
      /* 다음 select 조합 시도 */
    }
  }
  return []
}

/** POS 메뉴 원가 분석 - 전체 메뉴 + 옵션별 원가/재료 breakdown (본사/매장 구분) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'X-CM-Pos-Cost-Analysis-Rows, X-CM-Pos-Cost-Analysis-Error')

  const summaryOnly =
    request.nextUrl.searchParams.get('summary') === '1' ||
    request.nextUrl.searchParams.get('summary') === 'true'

  try {
    const [menuData, sauceData, sauceIngData] = await Promise.all([
      Promise.all([
        loadPosMenusPaged(),
        supabaseSelectAllPages('pos_menu_ingredients', {
          order: 'id.asc',
          select: 'id,menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
          pageSize: 10000,
        }),
        loadPosMenuOptionsPaged(),
        supabaseSelectAllPages('items', {
          order: 'code.asc',
          select: 'code,name,cost,price,total_quantity,unit,purchase_source,category',
          pageSize: 10000,
        }),
      ]),
      supabaseSelect('sauces', { limit: 500, select: 'id,code,name,cost_per_unit,unit,overhead_percent' }).catch(() => null),
      supabaseSelectAllPages('sauce_ingredients', {
        order: 'sauce_id.asc',
        select: 'sauce_id,item_code,quantity,loss_rate',
        pageSize: 10000,
      }).catch(() => []),
    ])
    const [menuRows, ingRows, optRows, itemRows] = menuData as [MenuRow[], IngRow[], OptRow[], ItemRow[]]
    if ((ingRows || []).length === 0 && (menuRows || []).length > 0) {
      console.warn(
        'getPosMenuCostAnalysis: pos_menu_ingredients 0행·메뉴는 있음. RLS에 SELECT 정책 없음 또는 anon 키만 쓰는 경우입니다. supabase_pos_orders_table_layouts_rls_policies.sql 의 pos_menu_ingredients 정책 적용 또는 SUPABASE_SERVICE_ROLE_KEY 사용.'
      )
    }
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

    const parseMenuIdNum = (raw: unknown): number => {
      if (raw == null || raw === '') return NaN
      const n = Number(String(raw).trim())
      return Number.isFinite(n) ? n : NaN
    }

    const optsByMenu: Record<number, (typeof optRows) extends (infer R)[] | null ? R[] : never> = {}
    for (const o of optRows || []) {
      const mid = parseMenuIdNum(o.menu_id)
      if (!Number.isFinite(mid)) continue
      if (!optsByMenu[mid]) optsByMenu[mid] = []
      optsByMenu[mid].push(o)
    }

    /** pos_menu_ingredients.option_id: null·0·'' 는 모두 "메뉴 기본"으로 묶음 (레거시 DB 호환) */
    const normalizeIngOptionKeySeg = (raw: unknown): string => {
      if (raw == null) return 'null'
      if (typeof raw === 'number' && raw === 0) return 'null'
      const s = String(raw).trim()
      if (s === '' || s === '0') return 'null'
      if (/^\d+$/.test(s)) return String(Number(s))
      return s
    }

    const ingByMenuOpt: Record<string, (typeof ingRows) extends (infer R)[] | null ? R[] : never> = {}
    for (const ing of ingRows || []) {
      const mid = parseMenuIdNum(ing.menu_id)
      if (!Number.isFinite(mid) || mid <= 0) continue
      const oidSeg = normalizeIngOptionKeySeg(ing.option_id)
      const key = `${mid}:${oidSeg}`
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
      const mid = parseMenuIdNum(menu.id)
      if (!Number.isFinite(mid) || mid <= 0) continue
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

      const computeCost = (
        optionId: string | null,
        params?: { substitutionFallbackBase?: boolean }
      ): { costHall: number; costDelivery: number; breakdown: BreakdownRow[] } => {
        const oid = optionId === '' || optionId === 'null' ? null : optionId
        const seg = oid == null ? 'null' : normalizeIngOptionKeySeg(oid)
        const key = `${mid}:${seg}`
        let ings = ingByMenuOpt[key] || []
        /** 대체형: 옵션 전용 레시피 행이 없으면 메뉴 기본(option null) 레시피와 동일 원가 */
        if (ings.length === 0 && params?.substitutionFallbackBase && seg !== 'null') {
          ings = ingByMenuOpt[`${mid}:null`] || []
        }
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
      const categoryMain = normalizePromotionCategoryMain(menu.category_main)
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
          let addPkg = 0
          const addBreakdown: BreakdownRow[] = [...base.breakdown]
          const srcMid = Number((opt as { additive_source_menu_id?: number | null }).additive_source_menu_id ?? 0)
          const qtyMult = Number(opt.quantity) ?? 1
          if (srcMid > 0) {
            const srcKey = `${srcMid}:null`
            for (const ing of ingByMenuOpt[srcKey] || []) {
              const code = String(ing.item_code ?? '').trim()
              const qty = (Number(ing.quantity) ?? 1) * qtyMult
              const lossRate = Number(ing.loss_rate) ?? 0
              const itype: 'food' | 'packaging' =
                (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
              const info = itemMap[code]
              const costPerUnit = info?.raw ? getItemCostPerUnit(info.raw, itype === 'packaging') : (info?.cost ?? 0)
              const costTotal = costPerUnit * qty * (1 + lossRate / 100)
              if (itype === 'packaging') addPkg += costTotal
              else addFood += costTotal
              addBreakdown.push({
                itemCode: code,
                itemName: info?.name ?? code,
                unit: info?.unit ?? '',
                costPerUnit,
                quantity: qty,
                lossRate,
                costTotal: Math.round(costTotal * 10) / 10,
                source: itemMap[code] ? (itemMap[code].purchaseSource as 'hq' | 'store') : 'store',
                ingredientType: itype,
              })
            }
          } else if (opt.item_code) {
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
            costDelivery: Math.round((baseCost + addFood + basePkg + addPkg) * 10) / 10,
            breakdown: addBreakdown,
            cookingTimeMin,
          })
        } else {
          const computed = computeCost(String(opt.id), { substitutionFallbackBase: true })
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

    /** 세트 메뉴 탭 등: 행마다 breakdown 제거 → 응답 크기 대폭 감소(파싱 실패·빈 목록 방지) */
    const payload = summaryOnly ? result.map((r) => ({ ...r, breakdown: [] })) : result
    headers.set('X-CM-Pos-Cost-Analysis-Rows', String(payload.length))
    return NextResponse.json(payload, { headers })
  } catch (e) {
    console.error('getPosMenuCostAnalysis:', e)
    headers.set('X-CM-Pos-Cost-Analysis-Rows', '0')
    headers.set('X-CM-Pos-Cost-Analysis-Error', '1')
    return NextResponse.json([], { headers })
  }
}
