/**
 * 메뉴 BOM → 원재료 qty 폭발 (POS 자동차감·이론 소진 리포트 공통).
 * 식: need = menuQty × quantity × (1 + loss_rate/100)
 */
import { supabaseSelectAllPages, supabaseSelectFilter } from '@/lib/supabase-server'

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
      usageByItem[optionItemCode] = (usageByItem[optionItemCode] ?? 0) + mult
      if (typeByItem && !typeByItem[optionItemCode]) typeByItem[optionItemCode] = 'food'
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

/** DB에서 BOM·옵션 인덱스 로드 */
export async function buildPosMenuBomIndex(): Promise<PosMenuBomIndex> {
  const [ingRows, optRows] = await Promise.all([
    supabaseSelectAllPages('pos_menu_ingredients', {
      order: 'menu_id.asc,id.asc',
      select: 'menu_id,option_id,item_code,quantity,loss_rate,ingredient_type',
    }).catch(() => []) as Promise<
      {
        menu_id?: number
        option_id?: number | null
        item_code?: string
        quantity?: number
        loss_rate?: number
        ingredient_type?: string
      }[]
    >,
    supabaseSelectAllPages('pos_menu_options', {
      order: 'id.asc',
      select: 'id,option_type,item_code,additive_source_menu_id,quantity',
    }).catch(() => []) as Promise<
      {
        id?: number
        option_type?: string
        item_code?: string | null
        additive_source_menu_id?: number | null
        quantity?: number
      }[]
    >,
  ])

  const byMenuOption = new Map<string, BomLine[]>()
  const baseByMenu = new Map<string, BomLine[]>()

  for (const r of ingRows || []) {
    const line = asBomLine(r)
    if (!line) continue
    const mid = String(r.menu_id ?? '').trim()
    if (!mid) continue
    const oidRaw = r.option_id
    const oid =
      oidRaw != null && Number.isFinite(Number(oidRaw)) && Number(oidRaw) > 0
        ? String(Number(oidRaw))
        : ''
    if (!oid) {
      const arr = baseByMenu.get(mid) || []
      arr.push(line)
      baseByMenu.set(mid, arr)
    } else {
      const k = bomKey(mid, oid)
      const arr = byMenuOption.get(k) || []
      arr.push(line)
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

  return { byMenuOption, baseByMenu, optionsById }
}

/**
 * POS 주문 1건용 — DB 조회 기반 (자동차감). buildPosMenuBomIndex 와 동일 식.
 */
export async function explodeMenuIngredientsAsync(
  menuId: string,
  optionId: string | null,
  menuQty: number,
  usageByItem: Record<string, number>
): Promise<void> {
  let optionType = 'substitution'
  let optionItemCode: string | null = null
  let additiveSourceMenuId: number | null = null
  let optionQty = 1

  if (optionId) {
    try {
      const optRows = (await supabaseSelectFilter('pos_menu_options', `id=eq.${encodeURIComponent(optionId)}`, {
        limit: 1,
        select: 'option_type,item_code,additive_source_menu_id,quantity',
      })) as {
        option_type?: string
        item_code?: string | null
        additive_source_menu_id?: number | null
        quantity?: number
      }[] | null
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

  let filter = `menu_id=eq.${encodeURIComponent(menuId)}`
  if (optionId && optionType === 'substitution') {
    filter += '&option_id=eq.' + encodeURIComponent(optionId)
  } else {
    filter += '&option_id=is.null'
  }

  let bomRows: { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null
  try {
    bomRows = (await supabaseSelectFilter('pos_menu_ingredients', filter, {
      limit: 200,
      select: 'item_code,quantity,loss_rate,ingredient_type',
    })) as typeof bomRows
  } catch {
    bomRows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${encodeURIComponent(menuId)}`, {
      limit: 200,
      select: 'item_code,quantity,loss_rate,ingredient_type',
    })) as typeof bomRows
  }

  /** 대체형: 옵션 전용 BOM이 비면 기본 BOM으로 폴백 (sync explode·원가분석과 동일) */
  if (
    optionId &&
    optionType === 'substitution' &&
    !(bomRows || []).some((b) => String(b.item_code ?? '').trim())
  ) {
    try {
      bomRows = (await supabaseSelectFilter(
        'pos_menu_ingredients',
        `menu_id=eq.${encodeURIComponent(menuId)}&option_id=is.null`,
        { limit: 200, select: 'item_code,quantity,loss_rate,ingredient_type' }
      )) as typeof bomRows
    } catch {
      /* keep empty */
    }
  }

  const lines: BomLine[] = []
  for (const b of bomRows || []) {
    const line = asBomLine(b)
    if (line) lines.push(line)
  }
  addBomLinesNeed(usageByItem, lines, menuQty)

  if (optionType === 'additive' && optionId) {
    const mult = menuQty * optionQty
    if (additiveSourceMenuId && mult > 0) {
      await explodeMenuIngredientsAsync(String(additiveSourceMenuId), null, mult, usageByItem)
    } else if (optionItemCode && mult > 0) {
      usageByItem[optionItemCode] = (usageByItem[optionItemCode] ?? 0) + mult
    }
    try {
      const optBom = (await supabaseSelectFilter(
        'pos_menu_ingredients',
        `menu_id=eq.${encodeURIComponent(menuId)}&option_id=eq.${encodeURIComponent(optionId)}`,
        { limit: 200, select: 'item_code,quantity,loss_rate,ingredient_type' }
      )) as { item_code?: string; quantity?: number; loss_rate?: number; ingredient_type?: string }[] | null
      const optLines: BomLine[] = []
      for (const b of optBom || []) {
        const line = asBomLine(b)
        if (line) optLines.push(line)
      }
      addBomLinesNeed(usageByItem, optLines, menuQty)
    } catch {
      /* ignore */
    }
  }
}
