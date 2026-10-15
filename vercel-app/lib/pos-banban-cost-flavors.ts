import { parseBanbanFlavorsFromName, parseBanbanFlavorsFromPersistedNote } from '@/lib/pos-banban-utils'

/**
 * 반반 원가: 반반 메뉴 자체 BOM(맛과 무관한 고정 소스) 대신
 * 고른 두 맛 메뉴의 M Boneless 레시피를 각 0.5 씩 쓴다. (반반 가격 = M 사이즈)
 */
export type BanbanCostLookup = {
  banbanMenuIds: Set<string>
  menuIdByNormalizedName: Map<string, string>
  halfOptionIdByMenuId: Map<string, string>
}

export type BanbanCostFlavor = { menuId: string; optionId: string }

const BANBAN_LINE_ID_RE = /(?:^|[-:])banban-(\d+)-(\d+)(?=-|$)/i
const BANBAN_HALF_OPTION_NAME_RE = /^\s*M\s*-\s*Boneless\b/i

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildBanbanCostLookup(params: {
  menus: { id: unknown; name?: unknown; isBanban?: boolean }[]
  options: { id: unknown; menuId: unknown; name?: unknown }[]
}): BanbanCostLookup {
  const banbanMenuIds = new Set<string>()
  const menuIdByNormalizedName = new Map<string, string>()
  for (const m of params.menus) {
    const id = str(m.id)
    const name = str(m.name)
    if (!id) continue
    if (m.isBanban === true || /banban|반반/i.test(name)) banbanMenuIds.add(id)
    if (name) menuIdByNormalizedName.set(normalizeName(name), id)
  }
  const halfOptionIdByMenuId = new Map<string, string>()
  for (const o of params.options) {
    const menuId = str(o.menuId)
    const id = str(o.id)
    if (!menuId || !id || halfOptionIdByMenuId.has(menuId)) continue
    if (BANBAN_HALF_OPTION_NAME_RE.test(str(o.name))) halfOptionIdByMenuId.set(menuId, id)
  }
  return { banbanMenuIds, menuIdByNormalizedName, halfOptionIdByMenuId }
}

/** 반반 줄이면 두 맛(메뉴·옵션)을 돌려준다. 반반이 아니거나 맛을 못 찾으면 null */
export function resolveBanbanCostFlavors(
  row: Record<string, unknown>,
  lookup: BanbanCostLookup
): [BanbanCostFlavor, BanbanCostFlavor] | null {
  const parent = str(row.menuId ?? row.menu_id)
  const m1 = str(row.menuId1 ?? row.menu_id1)
  const m2 = str(row.menuId2 ?? row.menu_id2)
  const idMatch = str(row.id).match(BANBAN_LINE_ID_RE)
  const isBanban = lookup.banbanMenuIds.has(parent) || lookup.banbanMenuIds.has(m1) || !!idMatch
  if (!isBanban) return null

  let pair: [string, string] | null = null
  let pairOptions: [string, string] = ['', '']
  if (m1 && m2 && !lookup.banbanMenuIds.has(m1) && !lookup.banbanMenuIds.has(m2)) {
    pair = [m1, m2]
    pairOptions = [str(row.optionId1 ?? row.option_id1), str(row.optionId2 ?? row.option_id2)]
  } else if (idMatch) {
    pair = [idMatch[1], idMatch[2]]
  } else {
    const named =
      parseBanbanFlavorsFromPersistedNote(str(row.note)) ??
      parseBanbanFlavorsFromName(str(row.name ?? row.menuName ?? row.menu_name))
    if (named) {
      const a = lookup.menuIdByNormalizedName.get(normalizeName(named.flavor1)) ?? ''
      const b = lookup.menuIdByNormalizedName.get(normalizeName(named.flavor2)) ?? ''
      if (a && b) pair = [a, b]
    }
  }
  if (!pair) return null
  const flavor = (i: 0 | 1): BanbanCostFlavor => ({
    menuId: pair[i],
    optionId: pairOptions[i] || lookup.halfOptionIdByMenuId.get(pair[i]) || '',
  })
  return [flavor(0), flavor(1)]
}
