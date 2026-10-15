/**
 * 메뉴 BOM → 원재료 qty 폭발 (POS 자동차감·이론 소진 리포트 공통).
 * 식: need = menuQty × quantity × (1 + loss_rate/100)
 */
import { supabaseSelectAllPages, supabaseSelectFilter } from '@/lib/supabase-server'
import { buildBanbanCostLookup, type BanbanCostLookup } from '@/lib/pos-banban-cost-flavors'

export type BomLine = {
  item_code: string
  quantity: number
  loss_rate: number
  ingredient_type: 'food' | 'packaging'
}

export type OptionMeta = {
  option_type: string
  item_code: string | null
  additive_source_menu_id: number | null
  quantity: number
}

export type PosMenuBomIndex = {
  /** menuId|optionId → lines (substitution BOM). optionId 빈 문자열 = 기본(option_id null) */
  byMenuOption: Map<string, BomLine[]>
  /** menuId → 기본 BOM (option_id null) */
  baseByMenu: Map<string, BomLine[]>
  optionsById: Map<string, OptionMeta>
  /** 있으면 가산형 옵션 item_code 가 배합일 때도 원재료로 푼다 */
  sauces?: SauceRecipeIndex
  /** 이론 소진 리포트용 — 반반 줄을 두 맛 M Boneless 로 나눈다 */
  banban?: BanbanCostLookup
}

function bomKey(menuId: string, optionId: string): string {
  return `${menuId}|${optionId}`
}

function asBomLine(r: {
  item_code?: string
  quantity?: number
  loss_rate?: number
  ingredient_type?: string
}): BomLine | null {
  const code = String(r.item_code ?? '').trim()
  if (!code) return null
  return {
    item_code: code,
    quantity: Number(r.quantity) ?? 1,
    loss_rate: Number(r.loss_rate) ?? 0,
    ingredient_type: (r.ingredient_type ?? 'food') === 'packaging' ? 'packaging' : 'food',
  }
}

/** BOM 줄들을 usageByItem 에 가산 */
export function addBomLinesNeed(
  usageByItem: Record<string, number>,
  lines: BomLine[],
  menuQty: number,
  typeByItem?: Record<string, 'food' | 'packaging'>
): void {
  if (!(menuQty > 0) || !lines.length) return
  for (const b of lines) {
    const need = menuQty * b.quantity * (1 + b.loss_rate / 100)
    if (!(need > 0)) continue
    usageByItem[b.item_code] = (usageByItem[b.item_code] ?? 0) + need
    if (typeByItem && !typeByItem[b.item_code]) {
      typeByItem[b.item_code] = b.ingredient_type
    }
  }
}

/**
 * 인덱스 기반 동기 폭발 (리포트·일괄 집계용).
 * substitution: option 전용 BOM → 없으면 기본 BOM.
 * additive: 기본 BOM + additive 소스 메뉴(또는 option item_code).
 */
export function explodeMenuIngredientsSync(
  index: PosMenuBomIndex,
  menuId: string,
  optionId: string | null,
  menuQty: number,
  usageByItem: Record<string, number>,
  typeByItem?: Record<string, 'food' | 'packaging'>
): void {
  const mid = String(menuId ?? '').trim()
  if (!mid || !(menuQty > 0)) return

  let optionType = 'substitution'
  let optionItemCode: string | null = null
  let additiveSourceMenuId: number | null = null
  let optionQty = 1

  const oid = optionId ? String(optionId).trim() : ''
  if (oid) {
    const opt = index.optionsById.get(oid)
    if (opt) {
      optionType = opt.option_type || 'substitution'
      optionItemCode = opt.item_code
      additiveSourceMenuId = opt.additive_source_menu_id
      optionQty = opt.quantity
    }
  }

  if (oid && optionType === 'substitution') {
    const specific = index.byMenuOption.get(bomKey(mid, oid))
    const lines = specific?.length ? specific : index.baseByMenu.get(mid) || []
    addBomLinesNeed(usageByItem, lines, menuQty, typeByItem)
  } else {
    addBomLinesNeed(usageByItem, index.baseByMenu.get(mid) || [], menuQty, typeByItem)
  }

  if (optionType === 'additive' && oid) {
    const mult = menuQty * optionQty
    if (additiveSourceMenuId && mult > 0) {
      explodeMenuIngredientsSync(index, String(additiveSourceMenuId), null, mult, usageByItem, typeByItem)
    } else if (optionItemCode && mult > 0) {
      const optionLine: BomLine = { item_code: optionItemCode, quantity: 1, loss_rate: 0, ingredient_type: 'food' }
      const lines = index.sauces ? flattenSauceBomLines([optionLine], index.sauces) : [optionLine]
      addBomLinesNeed(usageByItem, lines, mult, typeByItem)
    }
    /** 가산형 옵션 전용 BOM 행(getMenuCost·원가 목록과 동일) */
    const optLines = index.byMenuOption.get(bomKey(mid, oid))
    if (optLines?.length) addBomLinesNeed(usageByItem, optLines, menuQty, typeByItem)
  }
}

/** cart items_json 파싱 후 품목별 이론 소진 (POS 차감과 동일 분기) */
export function explodeCartItemsToUsage(
  index: PosMenuBomIndex,
  items: {
    id?: string
    qty?: number
    promoId?: string
    promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
    menuId1?: string
    optionId1?: string
    menuId2?: string
    optionId2?: string
  }[],
  typeByItem?: Record<string, 'food' | 'packaging'>
): Record<string, number> {
  const usageByItem: Record<string, number> = {}
  for (const it of items || []) {
    const cartQty = Math.max(0, Number(it.qty ?? 1))
    if (cartQty <= 0) continue

    if (it.promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0) {
      for (const pi of it.promoItems) {
        const menuId = String(pi.menuId ?? '').trim()
        const optionId = pi.optionId ? String(pi.optionId) : null
        if (!menuId) continue
        const menuQty = cartQty * (Number(pi.quantity) ?? 1)
        if (menuQty <= 0) continue
        explodeMenuIngredientsSync(index, menuId, optionId, menuQty, usageByItem, typeByItem)
      }
      continue
    }

    if (it.menuId1 && it.menuId2) {
      const halfQty = cartQty * 0.5
      const opt1 = it.optionId1 ? String(it.optionId1) : null
      const opt2 = it.optionId2 ? String(it.optionId2) : null
      explodeMenuIngredientsSync(index, String(it.menuId1), opt1, halfQty, usageByItem, typeByItem)
      explodeMenuIngredientsSync(index, String(it.menuId2), opt2, halfQty, usageByItem, typeByItem)
      continue
    }

    const parts = String(it.id ?? '').split('-')
    const menuId = parts[0] ?? ''
    const optionId = parts[1] || null
    if (!menuId) continue
    explodeMenuIngredientsSync(index, menuId, optionId, cartQty, usageByItem, typeByItem)
  }
  return usageByItem
}

/**
 * 단일 메뉴 라인 기여도용 — menuId/optionId/label 단위로 폭발 후 품목 맵 반환.
 */
export function explodeSingleMenuLine(
  index: PosMenuBomIndex,
  menuId: string,
  optionId: string | null,
  menuQty: number
): Record<string, number> {
  const usage: Record<string, number> = {}
  explodeMenuIngredientsSync(index, menuId, optionId, menuQty, usage)
  return usage
}

type BomIngredientRow = {
  menu_id?: number
  option_id?: number | null
  item_code?: string
  quantity?: number
  loss_rate?: number
  ingredient_type?: string
}

type BomOptionRow = {
  id?: number
  option_type?: string
  item_code?: string | null
  additive_source_menu_id?: number | null
  quantity?: number
}

const BOM_INGREDIENT_SELECT = 'menu_id,option_id,item_code,quantity,loss_rate,ingredient_type'
const BOM_OPTION_SELECT = 'id,option_type,item_code,additive_source_menu_id,quantity'

/** 배합(sauces) 1회 생산 레시피. 생산량 = 재료 수량 합 (원가 인덱스 배합 단가와 같은 가정) */
export type SauceRecipeIndex = {
  /** items 에 같은 코드가 있으면 배합이 아니라 품목(본사 완제품)으로 본다 */
  itemCodes: Set<string>
  byCode: Map<string, { lines: { item_code: string; quantity: number; loss_rate: number }[]; yieldQty: number }>
}

const SAUCE_FLATTEN_MAX_DEPTH = 5

/** BOM 줄의 배합 코드를 원재료 줄로 푼다. 배합 안의 배합도 재귀로 푼다. */
export function flattenSauceBomLines(lines: BomLine[], sauces: SauceRecipeIndex, depth = 0): BomLine[] {
  const out: BomLine[] = []
  for (const line of lines) {
    const recipe = sauces.itemCodes.has(line.item_code) ? undefined : sauces.byCode.get(line.item_code)
    if (!recipe || !(recipe.yieldQty > 0) || depth >= SAUCE_FLATTEN_MAX_DEPTH) {
      out.push(line)
      continue
    }
    const batches = (line.quantity * (1 + line.loss_rate / 100)) / recipe.yieldQty
    const sub = recipe.lines.map((r) => ({
      item_code: r.item_code,
      quantity: batches * r.quantity,
      loss_rate: r.loss_rate,
      ingredient_type: line.ingredient_type,
    }))
    out.push(...flattenSauceBomLines(sub, sauces, depth + 1))
  }
  return out
}

export function buildSauceRecipeIndex(
  sauceRows: { id?: number; code?: string }[],
  sauceIngRows: { sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[],
  itemCodeRows: { code?: string }[]
): SauceRecipeIndex {
  const itemCodes = new Set(itemCodeRows.map((r) => String(r.code ?? '').trim()).filter(Boolean))
  const linesBySauceId = new Map<number, { item_code: string; quantity: number; loss_rate: number }[]>()
  for (const r of sauceIngRows) {
    const sid = Number(r.sauce_id ?? 0)
    const code = String(r.item_code ?? '').trim()
    if (!sid || !code) continue
    const arr = linesBySauceId.get(sid) ?? []
    arr.push({ item_code: code, quantity: Number(r.quantity ?? 1) || 0, loss_rate: Number(r.loss_rate ?? 0) || 0 })
    linesBySauceId.set(sid, arr)
  }
  const byCode: SauceRecipeIndex['byCode'] = new Map()
  for (const s of sauceRows) {
    const code = String(s.code ?? '').trim()
    if (!code) continue
    const lines = linesBySauceId.get(Number(s.id ?? 0)) ?? []
    byCode.set(code, { lines, yieldQty: lines.reduce((sum, l) => sum + l.quantity, 0) })
  }
  return { itemCodes, byCode }
}

/** DB에서 BOM·옵션 인덱스 로드 — 이론 소진 리포트용으로 배합을 원재료까지 풀고 반반은 맛별로 나눈다 */
export async function buildPosMenuBomIndex(): Promise<PosMenuBomIndex> {
  const [ingRows, optRows, sauceRows, sauceIngRows, itemRows, menuRows] = await Promise.all([
    supabaseSelectAllPages('pos_menu_ingredients', {
      order: 'menu_id.asc,id.asc',
      select: BOM_INGREDIENT_SELECT,
    }).catch(() => []) as Promise<BomIngredientRow[]>,
    supabaseSelectAllPages('pos_menu_options', {
      order: 'id.asc',
      select: `${BOM_OPTION_SELECT},menu_id,name`,
    }).catch(() => []) as Promise<(BomOptionRow & { menu_id?: number; name?: string })[]>,
    supabaseSelectAllPages('sauces', { order: 'id.asc', select: 'id,code' }).catch(() => []) as Promise<
      { id?: number; code?: string }[]
    >,
    supabaseSelectAllPages('sauce_ingredients', {
      order: 'sauce_id.asc',
      select: 'sauce_id,item_code,quantity,loss_rate',
    }).catch(() => []) as Promise<{ sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[]>,
    supabaseSelectAllPages('items', { order: 'id.asc', select: 'code' }).catch(() => []) as Promise<
      { code?: string }[]
    >,
    supabaseSelectAllPages('pos_menus', { order: 'id.asc', select: 'id,name,is_banban' }).catch(() => []) as Promise<
      { id?: number; name?: string; is_banban?: boolean }[]
    >,
  ])
  const index = buildPosMenuBomIndexFromRows(
    ingRows,
    optRows,
    buildSauceRecipeIndex(sauceRows, sauceIngRows, itemRows)
  )
  index.banban = buildBanbanCostLookup({
    menus: menuRows.map((m) => ({ id: m.id, name: m.name, isBanban: m.is_banban === true })),
    options: optRows.map((o) => ({ id: o.id, menuId: o.menu_id, name: o.name })),
  })
  return index
}

type CartLineForBom = {
  id?: string
  qty?: number
  promoId?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
  menuId1?: string
  optionId1?: string
  menuId2?: string
  optionId2?: string
  cancelledAt?: string | null
  cancelled_at?: string | null
}

export function isCartLineCancelledForBom(it: CartLineForBom): boolean {
  return Boolean(it.cancelledAt || it.cancelled_at)
}

const NUMERIC_ID = /^\d+$/

/** 주문 줄에서 BOM 조회에 필요한 메뉴·옵션 id 수집 (숫자 id만) */
export function collectCartMenuRefsForBom(items: CartLineForBom[]): { menuIds: string[]; optionIds: string[] } {
  const menuIds = new Set<string>()
  const optionIds = new Set<string>()
  const add = (menuId: unknown, optionId: unknown) => {
    const m = String(menuId ?? '').trim()
    if (NUMERIC_ID.test(m)) menuIds.add(m)
    const o = String(optionId ?? '').trim()
    if (NUMERIC_ID.test(o)) optionIds.add(o)
  }
  for (const it of items || []) {
    if (isCartLineCancelledForBom(it)) continue
    if (it.promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0) {
      for (const pi of it.promoItems) add(pi.menuId, pi.optionId)
      continue
    }
    if (it.menuId1 && it.menuId2) {
      add(it.menuId1, it.optionId1)
      add(it.menuId2, it.optionId2)
      continue
    }
    const parts = String(it.id ?? '').split('-')
    add(parts[0], parts[1])
  }
  return { menuIds: [...menuIds], optionIds: [...optionIds] }
}

/**
 * POS 주문 1건용 — 주문에 나온 메뉴·옵션만 `in.()` 2회로 로드 (줄 수와 무관하게 왕복 고정).
 * 조회 실패는 throw — 빈 BOM으로 차감 완료 처리되지 않게.
 */
export async function buildPosMenuBomIndexForMenus(menuIds: string[], optionIds: string[]): Promise<PosMenuBomIndex> {
  const optRows = optionIds.length
    ? ((await supabaseSelectFilter('pos_menu_options', `id=in.(${optionIds.join(',')})`, {
        limit: Math.max(50, optionIds.length * 2),
        select: BOM_OPTION_SELECT,
      })) as BomOptionRow[] | null) || []
    : []
  const allMenuIds = new Set(menuIds)
  for (const o of optRows) {
    const aid = Number(o.additive_source_menu_id)
    if (Number.isFinite(aid) && aid > 0) allMenuIds.add(String(Math.trunc(aid)))
  }
  const ingRows = allMenuIds.size
    ? ((await supabaseSelectFilter('pos_menu_ingredients', `menu_id=in.(${[...allMenuIds].join(',')})`, {
        limit: 10000,
        order: 'menu_id.asc,id.asc',
        select: BOM_INGREDIENT_SELECT,
      })) as BomIngredientRow[] | null) || []
    : []
  return buildPosMenuBomIndexFromRows(ingRows, optRows)
}

export function buildPosMenuBomIndexFromRows(
  ingRows: BomIngredientRow[],
  optRows: BomOptionRow[],
  sauces?: SauceRecipeIndex
): PosMenuBomIndex {
  const byMenuOption = new Map<string, BomLine[]>()
  const baseByMenu = new Map<string, BomLine[]>()

  for (const r of ingRows || []) {
    const raw = asBomLine(r)
    if (!raw) continue
    const mid = String(r.menu_id ?? '').trim()
    if (!mid) continue
    const lines = sauces ? flattenSauceBomLines([raw], sauces) : [raw]
    const oidRaw = r.option_id
    const oid =
      oidRaw != null && Number.isFinite(Number(oidRaw)) && Number(oidRaw) > 0
        ? String(Number(oidRaw))
        : ''
    if (!oid) {
      const arr = baseByMenu.get(mid) || []
      arr.push(...lines)
      baseByMenu.set(mid, arr)
    } else {
      const k = bomKey(mid, oid)
      const arr = byMenuOption.get(k) || []
      arr.push(...lines)
      byMenuOption.set(k, arr)
    }
  }

  const optionsById = new Map<string, OptionMeta>()
  for (const o of optRows || []) {
    const id = String(o.id ?? '').trim()
    if (!id) continue
    const aid = o.additive_source_menu_id
    optionsById.set(id, {
      option_type: (o.option_type || 'substitution') as string,
      item_code: o.item_code ? String(o.item_code).trim() : null,
      additive_source_menu_id:
        aid != null && Number.isFinite(Number(aid)) && Number(aid) > 0 ? Number(aid) : null,
      quantity: Number(o.quantity) ?? 1,
    })
  }

  return { byMenuOption, baseByMenu, optionsById, sauces }
}
