import { getPromoChoiceSlotLabel, splitPromoChoiceGroups, type PromoChoiceLine } from '@/lib/pos-promo-choice'

export type GrabPromoChoiceCatalogRow = PromoChoiceLine & {
  menuName?: string
  optionName?: string
  sortOrder?: number
}

export type GrabPromoChoiceModifierGroup = {
  id: string
  name: string
  sequence: number
  availableStatus: 'AVAILABLE'
  selectionRangeMin: number
  selectionRangeMax: number
  modifiers: Array<{
    id: string
    name: string
    sequence: number
    availableStatus: 'AVAILABLE'
    price: number
  }>
}

export type GrabPromoItemSnapshot = {
  menuId: string
  optionId: string | null
  optionCode?: string | null
  optionName?: string
  menuName?: string
  quantity: number
}

function slugPart(raw: string, fallback: string): string {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
  const cleaned = base.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

function normalizeLookup(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Grab 메뉴·주문 round-trip용 modifier id */
export function buildPromoChoiceModifierId(
  itemId: string,
  line: PromoChoiceLine,
  sequence: number
): string {
  const grp = slugPart(String(line.choiceGroup ?? ''), 'grp')
  const menuId = String(line.menuId ?? '').trim() || '0'
  const optId = line.optionId ? String(line.optionId).trim() : '0'
  const code = slugPart(String(line.optionCode ?? ''), 'x')
  return `${itemId}-pc-${grp}-${menuId}-${optId}-${code}-${sequence}`
}

export function promoChoiceModifierDisplayName(line: GrabPromoChoiceCatalogRow): string {
  const menu = String(line.menuName ?? '').trim()
  const opt = String(line.optionName ?? '').trim()
  if (opt) return opt
  return menu || 'Option'
}

export function promoChoiceGroupDisplayName(choiceGroup: string): string {
  const key = String(choiceGroup ?? '').trim()
  if (!key) return 'Options'
  const slot = getPromoChoiceSlotLabel(key)
  return slot && slot !== key ? slot : key
}

/** 프로모 choice_group → Grab modifierGroups (POS 세트 탭 선택 그룹과 동일) */
export function buildGrabPromoChoiceModifierGroups(params: {
  itemId: string
  items: GrabPromoChoiceCatalogRow[]
  sequenceStart: number
}): GrabPromoChoiceModifierGroup[] {
  const { groups } = splitPromoChoiceGroups(params.items)
  if (groups.length === 0) return []

  return groups.map((group, gidx) => {
    const pick = Math.max(1, Math.min(group.pickCount, group.lines.length))
    const groupSlug = slugPart(group.key, `g${gidx + 1}`)
    return {
      id: `${params.itemId}-pcg-${groupSlug}`,
      name: promoChoiceGroupDisplayName(group.key).slice(0, 60),
      sequence: params.sequenceStart + gidx + 1,
      availableStatus: 'AVAILABLE' as const,
      selectionRangeMin: pick,
      selectionRangeMax: pick,
      modifiers: group.lines.map((line, idx) => ({
        id: buildPromoChoiceModifierId(params.itemId, line, idx + 1),
        name: promoChoiceModifierDisplayName(line as GrabPromoChoiceCatalogRow),
        sequence: idx + 1,
        availableStatus: 'AVAILABLE' as const,
        price: 0,
      })),
    }
  })
}

function toPromoItemSnapshot(line: GrabPromoChoiceCatalogRow): GrabPromoItemSnapshot {
  return {
    menuId: String(line.menuId ?? '').trim(),
    optionId: line.optionId != null && String(line.optionId).trim() ? String(line.optionId).trim() : null,
    ...(line.optionCode ? { optionCode: String(line.optionCode).trim() } : {}),
    ...(line.optionName ? { optionName: String(line.optionName).trim() } : {}),
    ...(line.menuName ? { menuName: String(line.menuName).trim() } : {}),
    quantity: Math.max(1, Number(line.quantity) || 1),
  }
}

function modifierMatchesPromoChoiceCandidate(params: {
  modifier: { id?: unknown; name?: unknown }
  itemId: string
  candidate: GrabPromoChoiceCatalogRow
  candidateIndex: number
}): boolean {
  const modId = String(params.modifier.id ?? '').trim()
  const expectedId = buildPromoChoiceModifierId(params.itemId, params.candidate, params.candidateIndex + 1)
  if (modId && modId === expectedId) return true
  if (modId && modId.includes('-pc-')) {
    const menuId = String(params.candidate.menuId ?? '').trim()
    const optId = params.candidate.optionId ? String(params.candidate.optionId).trim() : '0'
    if (menuId && modId.includes(`-${menuId}-`) && modId.includes(`-${optId}-`)) return true
  }
  const modName = normalizeLookup(String(params.modifier.name ?? ''))
  const candName = normalizeLookup(promoChoiceModifierDisplayName(params.candidate))
  if (!modName || !candName) return false
  return modName === candName || modName.includes(candName) || candName.includes(modName)
}

/**
 * Grab 주문 modifier → 프로모 promoItems 스냅샷.
 * choice_group 없는 고정 구성 + 손님이 고른 선택 그룹 후보만 포함.
 */
export function resolvePromoItemsForGrabOrder(params: {
  allItems: GrabPromoChoiceCatalogRow[]
  itemId: string
  flatModifiers: Array<{ id?: unknown; name?: unknown }>
}): GrabPromoItemSnapshot[] {
  const { fixedItems, groups } = splitPromoChoiceGroups(params.allItems)
  if (groups.length === 0) {
    return params.allItems.map(toPromoItemSnapshot)
  }

  const out = fixedItems.map(toPromoItemSnapshot)
  const usedModifierIds = new Set<string>()

  for (const group of groups) {
    let picked = 0
    for (let ci = 0; ci < group.lines.length; ci++) {
      const candidate = group.lines[ci] as GrabPromoChoiceCatalogRow
      for (const mod of params.flatModifiers) {
        const modId = String(mod.id ?? '').trim()
        if (modId && usedModifierIds.has(modId)) continue
        if (
          modifierMatchesPromoChoiceCandidate({
            modifier: mod,
            itemId: params.itemId,
            candidate,
            candidateIndex: ci,
          })
        ) {
          out.push(toPromoItemSnapshot(candidate))
          if (modId) usedModifierIds.add(modId)
          picked += 1
          break
        }
      }
      if (picked >= group.pickCount) break
    }
  }

  return out
}

export function promoCatalogHasChoiceGroups(items: GrabPromoChoiceCatalogRow[]): boolean {
  return splitPromoChoiceGroups(items).groups.length > 0
}

type PromoItemDbRow = {
  promo_id?: number | string
  menu_id?: number | string
  option_id?: number | string | null
  option_code?: string | null
  quantity?: number
  choice_group?: string | null
  choice_pick_count?: number | null
  sort_order?: number
}

/** `pos_promo_items.choice_group` + 메뉴/옵션명 — Grab 메뉴·주문 공통 */
export async function loadGrabPromoChoiceCatalogByPromoId(): Promise<{
  byPromoId: Map<number, GrabPromoChoiceCatalogRow[]>
  menuPromoIdByMenuId: Map<number, string>
}> {
  const { supabaseSelectAllPages, supabaseSelectFilterAllPages } = await import('@/lib/supabase-server')

  const [itemRows, mirrorMenus, menus, options] = await Promise.all([
    supabaseSelectAllPages('pos_promo_items', {
      select: 'promo_id,menu_id,option_id,option_code,quantity,choice_group,choice_pick_count,sort_order',
      pageSize: 5000,
      order: 'promo_id.asc,sort_order.asc',
    }).catch(() => []) as Promise<PromoItemDbRow[]>,
    supabaseSelectFilterAllPages('pos_menus', 'promo_id=not.is.null', {
      select: 'id,promo_id',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<{ id?: number; promo_id?: number }[]>,
    supabaseSelectAllPages('pos_menus', {
      select: 'id,name',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<{ id?: number; name?: string }[]>,
    supabaseSelectAllPages('pos_menu_options', {
      select: 'id,name,option_code',
      pageSize: 5000,
      order: 'id.asc',
    }).catch(() => []) as Promise<{ id?: number; name?: string; option_code?: string }[]>,
  ])

  const menuNameById = new Map<number, string>()
  for (const m of menus || []) {
    const id = Number(m.id ?? 0)
    const name = String(m.name ?? '').trim()
    if (id > 0 && name) menuNameById.set(id, name)
  }
  const optionNameById = new Map<number, string>()
  for (const o of options || []) {
    const id = Number(o.id ?? 0)
    const name = String(o.name ?? '').trim()
    if (id > 0 && name) optionNameById.set(id, name)
  }

  const menuPromoIdByMenuId = new Map<number, string>()
  for (const m of mirrorMenus || []) {
    const mid = Number(m.id ?? 0)
    const pid = Number(m.promo_id ?? 0)
    if (mid > 0 && pid > 0) menuPromoIdByMenuId.set(mid, String(pid))
  }

  const byPromoId = new Map<number, GrabPromoChoiceCatalogRow[]>()
  for (const row of itemRows || []) {
    const promoId = Number(row.promo_id ?? 0)
    const menuId = Number(row.menu_id ?? 0)
    if (!promoId || !menuId) continue
    const optionId =
      row.option_id != null && String(row.option_id).trim() ? String(row.option_id).trim() : null
    const line: GrabPromoChoiceCatalogRow = {
      menuId: String(menuId),
      optionId,
      ...(row.option_code ? { optionCode: String(row.option_code).trim() } : {}),
      quantity: Math.max(1, Number(row.quantity) || 1),
      choiceGroup: row.choice_group != null ? String(row.choice_group).trim() || null : null,
      choicePickCount:
        row.choice_pick_count != null && Number.isFinite(Number(row.choice_pick_count))
          ? Math.max(1, Math.floor(Number(row.choice_pick_count)))
          : null,
      sortOrder: Number(row.sort_order ?? 0) || 0,
      menuName: menuNameById.get(menuId),
      optionName: optionId ? optionNameById.get(Number(optionId)) : undefined,
    }
    const list = byPromoId.get(promoId) || []
    list.push(line)
    byPromoId.set(promoId, list)
  }

  return { byPromoId, menuPromoIdByMenuId }
}
