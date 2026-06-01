import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectAllPages, supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import {
  normalizeMenuIngredientOptionKeySeg,
  resolveIngredientMenuIdFromCode,
} from '@/lib/pos-menu-ingredient-scope'

/** 메뉴·재료·옵션 페이지 반복 조회 시 서버리스 타임아웃 완화 (플랜별 상한 적용) */
export const maxDuration = 120

/** 치킨 기본 옵션(S Boneless): 원가 분석에서는 메뉴 기본 행으로 이미 포함되므로 옵션 목록에서 제외 */
function isChickenDefaultOption(name: string | undefined): boolean {
  const n = String(name ?? '').trim()
  return (
    /^S\s*[-]?\s*순살\s*$/i.test(n) ||
    /^S\s*[-]?\s*Boneless\s*$/i.test(n) ||
    n === 'S 순살' ||
    n === 'S - 순살' ||
    n === 'S-순살' ||
    n === 'S Boneless' ||
    n === 'S - Boneless' ||
    n === 'S-Boneless'
  )
}

type MenuRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  promo_id?: number | null
  is_active?: boolean | null
  price?: number
  price_delivery?: number | null
  vat_included?: boolean
  cooking_time_min?: number | null
  delivery_app_fee_percent?: number | null
}
type IngRow = {
  id?: number
  menu_id?: number
  /** 코드 중심 매핑용 스냅샷(컬럼 없으면 undefined) */
  menu_code?: string | null
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
  option_code?: string | null
  option_type?: string
  item_code?: string | null
  additive_source_menu_id?: number | null
  quantity?: number
  sort_order?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
}
type PromoItemRow = {
  promo_id?: number
  menu_id?: number
  option_id?: number | null
  quantity?: number
}
type ItemRow = {
  id?: number
  code?: string
  name?: string
  cost?: number
  price?: number
  total_quantity?: number
  unit?: string
  purchase_source?: string
  category?: string
}

/** 품목 관리 getItems와 동일: code 없으면 매장 전용 등만 `_local_${id}` 키로 노출 */
function effectiveItemCodeKey(r: ItemRow): string {
  const raw = String(r.code ?? '').trim()
  if (raw) return raw
  const isStore =
    (r.purchase_source ?? 'hq') === 'store' || String(r.category ?? '').trim() === '매장 전용'
  if (isStore && r.id != null) return `_local_${r.id}`
  return ''
}

type ItemMapEntry = {
  name: string
  cost: number
  unit: string
  purchaseSource: 'hq' | 'store'
  raw?: ItemRow
}

/** BOM·엑셀에서 전각 숫자·대소문자만 다른 코드로 itemMap 미스 → 원가 0 방지 */
function itemCodeLookupVariants(raw: string): string[] {
  const t = String(raw ?? '').trim()
  if (!t) return []
  const asciiDigits = t.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48)
  )
  const variants = new Set<string>([t, asciiDigits])
  for (const x of [t, asciiDigits]) {
    variants.add(x.toUpperCase())
    variants.add(x.toLowerCase())
  }
  const digitsOnly = asciiDigits.replace(/\s/g, '')
  if (/^[0-9]+$/.test(digitsOnly)) {
    variants.add(String(Number(digitsOnly)))
  }
  return [...variants].filter(Boolean)
}

function buildItemLookup(map: Record<string, ItemMapEntry>): Record<string, ItemMapEntry> {
  const lookup: Record<string, ItemMapEntry> = { ...map }
  for (const k of Object.keys(map)) {
    const entry = map[k]
    for (const v of itemCodeLookupVariants(k)) {
      if (v && lookup[v] === undefined) lookup[v] = entry
    }
  }
  return lookup
}

function resolveItemInfo(rawCode: string, lookup: Record<string, ItemMapEntry>): ItemMapEntry | undefined {
  for (const v of itemCodeLookupVariants(rawCode)) {
    const hit = lookup[v]
    if (hit) return hit
  }
  return undefined
}

async function loadPosMenusPaged(): Promise<MenuRow[]> {
  try {
    return (await supabaseSelectAllPages('pos_menus', {
      order: 'category_main.asc,category.asc,sort_order.asc,name.asc',
      select: 'id,code,name,category,category_main,promo_id,is_active,price,price_delivery,vat_included,cooking_time_min,delivery_app_fee_percent',
    })) as MenuRow[]
  } catch {
    return (await supabaseSelectAllPages('pos_menus', {
      order: 'category.asc,sort_order.asc,name.asc',
      select: 'id,code,name,category,promo_id,price,price_delivery,vat_included',
    })) as MenuRow[]
  }
}

async function loadPosMenuOptionsPaged(): Promise<OptRow[]> {
  const order = 'menu_id.asc,sort_order.asc,name.asc'
  const selects = [
    'id,menu_id,name,option_code,option_type,item_code,additive_source_menu_id,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_code,option_type,item_code,quantity,sort_order,price_modifier,price_modifier_delivery',
    'id,menu_id,name,option_type,item_code,quantity,sort_order',
  ]
  for (const select of selects) {
    try {
      return (await supabaseSelectAllPages('pos_menu_options', { order, select })) as OptRow[]
    } catch {
      /* 다음 select 조합 시도 */
    }
  }
  return []
}

async function loadPosMenuIngredientsPaged(): Promise<IngRow[]> {
  const order = 'id.asc'
  const selects = [
    'id,menu_id,menu_code,option_id,item_code,quantity,loss_rate,ingredient_type',
    'id,menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
  ]
  for (const select of selects) {
    try {
      return (await supabaseSelectAllPages('pos_menu_ingredients', { order, select })) as IngRow[]
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
  headers.set(
    'Access-Control-Expose-Headers',
    'X-CM-Pos-Cost-Analysis-Rows, X-CM-Pos-Cost-Analysis-Error, X-CM-Pos-Cost-Analysis-Active-Menus, X-CM-Pos-Cost-Analysis-Inactive-Menus'
  )

  const summaryOnly =
    request.nextUrl.searchParams.get('summary') === '1' ||
    request.nextUrl.searchParams.get('summary') === 'true'

  try {
    const [menuData, sauceData, sauceIngData] = await Promise.all([
      Promise.all([
        loadPosMenusPaged(),
        loadPosMenuIngredientsPaged(),
        loadPosMenuOptionsPaged(),
        supabaseSelectAllPages('items', {
          order: 'code.asc',
          select: 'id,code,name,cost,price,total_quantity,unit,purchase_source,category',
        }),
      ]),
      supabaseSelectAllPages('sauces', {
        order: 'id.asc',
        select: 'id,code,name,cost_per_unit,unit,overhead_percent',
      }).catch(() => []),
      supabaseSelectAllPages('sauce_ingredients', {
        order: 'sauce_id.asc',
        select: 'sauce_id,item_code,quantity,loss_rate',
      }).catch(() => []),
    ])
    const [menuRows, ingRows, optRows, itemRows] = menuData as [MenuRow[], IngRow[], OptRow[], ItemRow[]]
    const activeMenuRows = (menuRows || []).filter((m) => m?.is_active !== false)
    headers.set('X-CM-Pos-Cost-Analysis-Active-Menus', String(activeMenuRows.length))
    headers.set(
      'X-CM-Pos-Cost-Analysis-Inactive-Menus',
      String(Math.max(0, (menuRows || []).length - activeMenuRows.length))
    )
    const promoItemsByPromoId: Record<number, PromoItemRow[]> = {}
    const promoIds = Array.from(
      new Set(
        (activeMenuRows || [])
          .map((m) => Number(m.promo_id ?? 0))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    )
    if (promoIds.length > 0) {
      const chunkSize = 300
      for (let i = 0; i < promoIds.length; i += chunkSize) {
        const chunk = promoIds.slice(i, i + chunkSize)
        const rows = (await supabaseSelectFilter(
          'pos_promo_items',
          `promo_id=in.(${chunk.join(',')})`,
          {
            order: 'sort_order.asc,id.asc',
            limit: 10000,
            select: 'promo_id,menu_id,option_id,quantity',
          }
        ).catch(() => [])) as PromoItemRow[]
        for (const r of rows || []) {
          const pid = Number(r.promo_id ?? 0)
          if (!Number.isFinite(pid) || pid <= 0) continue
          if (!promoItemsByPromoId[pid]) promoItemsByPromoId[pid] = []
          promoItemsByPromoId[pid].push(r)
        }
      }
    }
    if ((ingRows || []).length === 0 && (menuRows || []).length > 0) {
      console.warn(
        'getPosMenuCostAnalysis: pos_menu_ingredients 0행·메뉴는 있음. RLS에 SELECT 정책 없음 또는 anon 키만 쓰는 경우입니다. supabase_pos_orders_table_layouts_rls_policies.sql 의 pos_menu_ingredients 정책 적용 또는 SUPABASE_SERVICE_ROLE_KEY 사용.'
      )
    }
    const sauceRows = sauceData as { id?: number; code?: string; name?: string; cost_per_unit?: number; unit?: string; overhead_percent?: number }[] | null
    const sauceIngRows = sauceIngData as { sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[] | null

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemMap: Record<string, ItemMapEntry> = {}
    for (const r of itemRows || []) {
      const code = effectiveItemCodeKey(r)
      if (!code) continue
      const isPkg = /포장|packaging|박스|용기|봉지/.test(String(r.category ?? ''))
      itemMap[code] = {
        name: String(r.name ?? ''),
        cost: getItemCostPerUnit(r, isPkg),
        unit: String(r.unit ?? 'g'),
        purchaseSource: (r.purchase_source ?? 'hq') === 'store' ? 'store' : 'hq',
        raw: r,
      }
    }
    let itemLookup = buildItemLookup(itemMap)
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
          const itemInfo = resolveItemInfo(icode, itemLookup)
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
      const name = String(r.name ?? '').trim()
      if (name && !itemMap[name] && code) {
        const cost = Number(r.cost_per_unit ?? 0) > 0 ? Number(r.cost_per_unit ?? 0) : (sauceCostComputed[code] ?? 0)
        itemMap[name] = {
          name: String(r.name ?? ''),
          cost,
          unit: String(r.unit ?? 'g'),
          purchaseSource: 'hq',
        }
      }
    }
    itemLookup = buildItemLookup(itemMap)

    const menusById: Record<number, typeof menuRows extends (infer R)[] | null ? R : never> = {}
    for (const m of menuRows || []) {
      if (m.id != null) menusById[m.id] = m
    }

    const parseMenuIdNum = (raw: unknown): number => {
      if (raw == null || raw === '') return NaN
      const n = Number(String(raw).trim())
      return Number.isFinite(n) ? n : NaN
    }
    const normalizeMenuCodeKey = (raw: unknown): string => String(raw ?? '').trim().toLowerCase()
    const menuIdByCodeKey: Record<string, number> = {}
    for (const m of menuRows || []) {
      const codeKey = normalizeMenuCodeKey(m.code)
      const mid = parseMenuIdNum(m.id)
      if (!codeKey || !Number.isFinite(mid) || mid <= 0) continue
      menuIdByCodeKey[codeKey] = mid
    }

    const optsByMenu: Record<number, (typeof optRows) extends (infer R)[] | null ? R[] : never> = {}
    for (const o of optRows || []) {
      const mid = parseMenuIdNum(o.menu_id)
      if (!Number.isFinite(mid)) continue
      if (!optsByMenu[mid]) optsByMenu[mid] = []
      optsByMenu[mid].push(o)
    }

    const ingByMenuOpt: Record<string, (typeof ingRows) extends (infer R)[] | null ? R[] : never> = {}
    let remappedByCodeCount = 0
    for (const ing of ingRows || []) {
      let mid = parseMenuIdNum(ing.menu_id)
      const ingCodeKey = normalizeMenuCodeKey(ing.menu_code)
      const resolvedMid = resolveIngredientMenuIdFromCode({
        menuId: mid,
        menuCodeOnRow: ingCodeKey,
        mappedMenuIdFromCode: ingCodeKey ? menuIdByCodeKey[ingCodeKey] : undefined,
        menuExistsForMenuId: Number.isFinite(mid) && mid > 0 && !!menusById[mid],
      })
      if (resolvedMid.remapped) remappedByCodeCount += 1
      mid = resolvedMid.menuId
      if (!Number.isFinite(mid) || mid <= 0) continue
      const oidSeg = normalizeMenuIngredientOptionKeySeg(ing.option_id)
      const key = `${mid}:${oidSeg}`
      if (!ingByMenuOpt[key]) ingByMenuOpt[key] = []
      ingByMenuOpt[key].push(ing)
    }
    if (remappedByCodeCount > 0) {
      console.warn(`getPosMenuCostAnalysis: remapped ${remappedByCodeCount} ingredient rows by menu_code`)
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
      optionCode?: string | null
      optionName: string | null
      optionType?: 'substitution' | 'additive' | null
      costHall: number
      costDelivery: number
      breakdown: BreakdownRow[]
      cookingTimeMin?: number | null
      deliveryAppFeePercent?: number | null
    }

    const result: MenuCostRow[] = []

    for (const menu of activeMenuRows || []) {
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
        const seg = oid == null ? 'null' : normalizeMenuIngredientOptionKeySeg(oid)
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
          const info = resolveItemInfo(code, itemLookup)
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
            source: info ? (info.purchaseSource as 'hq' | 'store') : 'store',
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

      const hasComputedCost = (c: { costHall: number; costDelivery: number; breakdown: BreakdownRow[] }) =>
        c.breakdown.length > 0 || c.costHall > 0 || c.costDelivery > 0

      const computeOptionOwnCost = (opt: OptRow): { costHall: number; costDelivery: number; breakdown: BreakdownRow[] } | null => {
        if (opt.id == null) return null
        const direct = computeCost(String(opt.id), { substitutionFallbackBase: false })
        return hasComputedCost(direct) ? direct : null
      }

      /** 가산형 옵션만: 소스메뉴·item_code·옵션 BOM (기본 레시피 제외) */
      const additiveIncremental = (opt: OptRow): { addFood: number; addPkg: number; incBreakdown: BreakdownRow[] } => {
        let addFood = 0
        let addPkg = 0
        const incBreakdown: BreakdownRow[] = []
        const srcMid = Number(opt.additive_source_menu_id ?? 0)
        const qtyMult = Number(opt.quantity) ?? 1
        if (srcMid > 0) {
          const srcKey = `${srcMid}:null`
          const srcBaseIngs = ingByMenuOpt[srcKey] || []
          if (srcBaseIngs.length > 0) {
            for (const ing of srcBaseIngs) {
              const code = String(ing.item_code ?? '').trim()
              const qty = (Number(ing.quantity) ?? 1) * qtyMult
              const lossRate = Number(ing.loss_rate) ?? 0
              const itype: 'food' | 'packaging' =
                (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
              const info = resolveItemInfo(code, itemLookup)
              const costPerUnit = info?.raw ? getItemCostPerUnit(info.raw, itype === 'packaging') : (info?.cost ?? 0)
              const costTotal = costPerUnit * qty * (1 + lossRate / 100)
              if (itype === 'packaging') addPkg += costTotal
              else addFood += costTotal
              incBreakdown.push({
                itemCode: code,
                itemName: info?.name ?? code,
                unit: info?.unit ?? '',
                costPerUnit,
                quantity: qty,
                lossRate,
                costTotal: Math.round(costTotal * 10) / 10,
                source: info ? (info.purchaseSource as 'hq' | 'store') : 'store',
                ingredientType: itype,
              })
            }
          } else {
            /**
             * 세트 구성용 source 메뉴가 option null BOM 없이 옵션 기반 원가만 가진 경우,
             * source 메뉴 기본 행(이미 계산된 결과)을 폴백으로 사용해 0원가 표시를 방지한다.
             */
            const srcBaseRow = result.find((r) => Number(r.menuId) === srcMid && r.optionId == null)
            if (srcBaseRow) {
              const srcFood = Number(srcBaseRow.costHall ?? 0)
              const srcPkg = Math.max(0, Number(srcBaseRow.costDelivery ?? 0) - srcFood)
              const totalFood = srcFood * qtyMult
              const totalPkg = srcPkg * qtyMult
              addFood += totalFood
              addPkg += totalPkg
              const srcMenuName = String(menusById[srcMid]?.name ?? srcBaseRow.menuName ?? `menu:${srcMid}`)
              incBreakdown.push({
                itemCode: `MENU:${srcMid}`,
                itemName: `${srcMenuName} (set source)`,
                unit: 'set',
                costPerUnit: Math.round((srcFood + srcPkg) * 10) / 10,
                quantity: qtyMult,
                lossRate: 0,
                costTotal: Math.round((totalFood + totalPkg) * 10) / 10,
                source: 'hq',
                ingredientType: 'food',
              })
            }
          }
        } else if (opt.item_code) {
          const info = resolveItemInfo(String(opt.item_code).trim(), itemLookup)
          const qty = Number(opt.quantity) ?? 1
          const costTotal = (info?.cost ?? 0) * qty
          addFood = costTotal
          incBreakdown.push({
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
        const optId = Number(opt.id ?? NaN)
        const addOptSeg = Number.isFinite(optId)
          ? normalizeMenuIngredientOptionKeySeg(String(opt.id ?? ''))
          : normalizeMenuIngredientOptionKeySeg(String(opt.id ?? ''))
        if (addOptSeg !== 'null') {
          for (const ing of ingByMenuOpt[`${mid}:${addOptSeg}`] || []) {
            const code = String(ing.item_code ?? '').trim()
            const qty = Number(ing.quantity) ?? 1
            const lossRate = Number(ing.loss_rate) ?? 0
            const itype: 'food' | 'packaging' =
              (ing.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food'
            const info = resolveItemInfo(code, itemLookup)
            const costPerUnit = info?.raw ? getItemCostPerUnit(info.raw, itype === 'packaging') : (info?.cost ?? 0)
            const costTotal = costPerUnit * qty * (1 + lossRate / 100)
            if (itype === 'packaging') addPkg += costTotal
            else addFood += costTotal
            incBreakdown.push({
              itemCode: code,
              itemName: info?.name ?? code,
              unit: info?.unit ?? '',
              costPerUnit,
              quantity: qty,
              lossRate,
              costTotal: Math.round(costTotal * 10) / 10,
              source: info ? (info.purchaseSource as 'hq' | 'store') : 'store',
              ingredientType: itype,
            })
          }
        }
        return { addFood, addPkg, incBreakdown }
      }

      const base = computeCost(null)
      const baseDisplay = base
      const additiveIncByOptId = new Map<number, { addFood: number; addPkg: number; incBreakdown: BreakdownRow[] }>()
      for (const opt of optsToShow) {
        if ((opt.option_type || '') === 'additive' && opt.id != null) {
          additiveIncByOptId.set(Number(opt.id), additiveIncremental(opt))
        }
      }
      let rollupAddFood = 0
      let rollupAddPkg = 0
      const rollupIncBreakdown: BreakdownRow[] = []
      for (const opt of optsToShow) {
        if ((opt.option_type || '') !== 'additive' || opt.id == null) continue
        const v = additiveIncByOptId.get(Number(opt.id))
        if (!v) continue
        rollupAddFood += v.addFood
        rollupAddPkg += v.addPkg
        rollupIncBreakdown.push(...v.incBreakdown)
      }

      const categoryMain = normalizePromotionCategoryMain(menu.category_main)
      const cookingTimeMin = menu.cooking_time_min != null && Number.isFinite(menu.cooking_time_min) ? menu.cooking_time_min : null
      const vatIncluded = menu.vat_included !== false
      const deliveryAppFeePercent =
        menu.delivery_app_fee_percent != null && Number.isFinite(Number(menu.delivery_app_fee_percent))
          ? Number(menu.delivery_app_fee_percent)
          : null
      result.push({
        menuId: String(menu.id ?? ''),
        menuCode: String(menu.code ?? ''),
        menuName: String(menu.name ?? ''),
        category: String(menu.category ?? ''),
        categoryMain,
        priceHall,
        priceDelivery,
        vatIncluded,
        deliveryAppFeePercent,
        optionId: null,
        optionCode: null,
        optionName: null,
        optionType: null,
        costHall: Math.round((baseDisplay.costHall + rollupAddFood) * 10) / 10,
        costDelivery: Math.round((baseDisplay.costDelivery + rollupAddFood + rollupAddPkg) * 10) / 10,
        breakdown: [...baseDisplay.breakdown, ...rollupIncBreakdown],
        cookingTimeMin,
      })

      for (const opt of optsToShow) {
        const modHall = Number(opt.price_modifier ?? 0)
        const modDelivery = opt.price_modifier_delivery != null ? Number(opt.price_modifier_delivery) : modHall
        const optPriceHall = priceHall + modHall
        const optPriceDelivery = priceDelivery != null ? priceDelivery + modDelivery : null
        const isAdditive = (opt.option_type || '') === 'additive'
        if (isAdditive) {
          const baseCost = baseDisplay.costHall
          const basePkg = baseDisplay.costDelivery - baseDisplay.costHall
          const inc =
            opt.id != null
              ? (additiveIncByOptId.get(Number(opt.id)) ?? { addFood: 0, addPkg: 0, incBreakdown: [] })
              : additiveIncremental(opt)
          const { addFood, addPkg, incBreakdown } = inc
          const addBreakdown: BreakdownRow[] = [...baseDisplay.breakdown, ...incBreakdown]
          result.push({
            menuId: String(menu.id ?? ''),
            menuCode: String(menu.code ?? ''),
            menuName: String(menu.name ?? ''),
            category: String(menu.category ?? ''),
            categoryMain,
            priceHall: optPriceHall,
            priceDelivery: optPriceDelivery,
            vatIncluded,
            deliveryAppFeePercent,
            optionId: String(opt.id ?? ''),
            optionCode: String(opt.option_code ?? '').trim() || `${String(menu.code ?? '')}-${Math.max(0, Number(opt.sort_order ?? 0)) + 1}`,
            optionName: String(opt.name ?? ''),
            optionType: 'additive',
            costHall: Math.round((baseCost + addFood) * 10) / 10,
            costDelivery: Math.round((baseCost + addFood + basePkg + addPkg) * 10) / 10,
            breakdown: addBreakdown,
            cookingTimeMin,
          })
        } else {
          /**
           * 대체형: 옵션 전용 BOM(직접 매칭 + orphan option_id 매칭)이 있으면 그 값을 우선,
           * 둘 다 없으면 메뉴 기본 BOM으로 폴백해 base와 동일 cost로 표시한다.
           * (폴백을 끊으면 옵션 BOM이 누락된 메뉴가 모두 0으로 표시되어 운영상 더 혼란스러움.
           *  실제 옵션별 cost를 다르게 보고 싶으면 cost-calculator에서 옵션 BOM을 직접 입력.)
           */
          const computed =
            computeOptionOwnCost(opt) ?? computeCost(String(opt.id), { substitutionFallbackBase: true })
          result.push({
            menuId: String(menu.id ?? ''),
            menuCode: String(menu.code ?? ''),
            menuName: String(menu.name ?? ''),
            category: String(menu.category ?? ''),
            categoryMain,
            priceHall: optPriceHall,
            priceDelivery: optPriceDelivery,
            vatIncluded,
            deliveryAppFeePercent,
            optionId: String(opt.id ?? ''),
            optionCode: String(opt.option_code ?? '').trim() || `${String(menu.code ?? '')}-${Math.max(0, Number(opt.sort_order ?? 0)) + 1}`,
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

    /**
     * 프로모션 미러 메뉴(pos_menus.promo_id)는 BOM 대신 pos_promo_items 합성으로 원가를 잡는다.
     * 기본 계산에서 0으로 남은 미러 메뉴(base row)에만 구성 메뉴 원가를 합산해 채운다.
     */
    const rowMapByKey = new Map<string, MenuCostRow>()
    for (const r of result) {
      const optSeg =
        r.optionId == null || String(r.optionId).trim() === '' ? 'null' : normalizeMenuIngredientOptionKeySeg(r.optionId)
      rowMapByKey.set(`${r.menuId}:${optSeg}`, r)
    }
    for (const r of result) {
      if (r.optionId != null) continue
      if (r.costHall > 0 || r.costDelivery > 0 || (r.breakdown?.length ?? 0) > 0) continue
      const mid = Number(r.menuId)
      if (!Number.isFinite(mid) || mid <= 0) continue
      const promoId = Number(menusById[mid]?.promo_id ?? 0)
      if (!Number.isFinite(promoId) || promoId <= 0) continue
      const comp = promoItemsByPromoId[promoId] || []
      if (comp.length === 0) continue
      let hall = 0
      let del = 0
      for (const c of comp) {
        const cMid = Number(c.menu_id ?? 0)
        if (!Number.isFinite(cMid) || cMid <= 0) continue
        const cOptSeg = normalizeMenuIngredientOptionKeySeg(c.option_id)
        const qty = Number(c.quantity ?? 1)
        const child =
          rowMapByKey.get(`${cMid}:${cOptSeg}`) ??
          rowMapByKey.get(`${cMid}:null`)
        if (!child) continue
        hall += Number(child.costHall ?? 0) * qty
        del += Number(child.costDelivery ?? child.costHall ?? 0) * qty
      }
      if (hall > 0 || del > 0) {
        r.costHall = Math.round(hall * 10) / 10
        r.costDelivery = Math.round(del * 10) / 10
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
    headers.set('X-CM-Pos-Cost-Analysis-Active-Menus', '0')
    headers.set('X-CM-Pos-Cost-Analysis-Inactive-Menus', '0')
    return NextResponse.json([], { headers })
  }
}
