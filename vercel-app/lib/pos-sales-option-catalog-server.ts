import { supabaseSelectAllPages } from '@/lib/supabase-server'
import {
  type PosOptionGroupRow,
  buildMenuOptionsFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'
import type { PosOptionCatalogRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'

/**
 * Total Sales·판매 집계용 통합 옵션 카탈로그.
 * `getPosMenuOptions`와 동일하게 `pos_menu_options` + 옵션 그룹 링크 조합 행을 합친다.
 */
export async function loadPosSalesOptionCatalog(): Promise<PosOptionCatalogRow[]> {
  const linkedOptions: ReturnType<typeof buildMenuOptionsFromLinks> = []
  const linkedMenuIds = new Set<number>()
  const menuCodeById = new Map<number, string>()
  const linksByMenuId = new Map<number, Awaited<ReturnType<typeof loadMenuGroupLinks>>>()
  const groupsById = new Map<number, PosOptionGroupRow>()
  let itemsByGroupId: Awaited<ReturnType<typeof loadPosOptionGroupsWithItems>>['itemsByGroupId'] =
    new Map()

  try {
    const [{ groups, itemsByGroupId: loadedItems }, links] = await Promise.all([
      loadPosOptionGroupsWithItems(),
      loadMenuGroupLinks(),
    ])
    itemsByGroupId = loadedItems
    for (const g of groups || []) {
      const id = Number(g.id || 0)
      if (id) groupsById.set(id, g)
    }
    for (const link of links || []) {
      const mid = Number(link.menu_id || 0)
      if (!mid) continue
      linkedMenuIds.add(mid)
      if (!linksByMenuId.has(mid)) linksByMenuId.set(mid, [])
      linksByMenuId.get(mid)!.push(link)
    }
  } catch {
    // 그룹 구조 미배포 시 pos_menu_options 만 사용
  }

  try {
    const menuRows = (await supabaseSelectAllPages('pos_menus', {
      order: 'id.asc',
      pageSize: 3000,
      maxRows: 200000,
      select: 'id,code',
    })) as { id?: number; code?: string }[] | null
    for (const row of menuRows || []) {
      const id = Number(row.id || 0)
      if (id) menuCodeById.set(id, String(row.code ?? '').trim())
    }
  } catch {
    // option_code 없이 진행
  }

  for (const [mid, menuLinks] of linksByMenuId.entries()) {
    linkedOptions.push(
      ...buildMenuOptionsFromLinks(
        mid,
        menuLinks,
        groupsById,
        itemsByGroupId,
        menuCodeById.get(mid)
      )
    )
  }

  const linkedStepKeysByMenuId = new Map<number, Set<string>>()
  for (const opt of linkedOptions) {
    const mid = Number(opt.menuId || 0)
    if (!mid) continue
    if (!linkedStepKeysByMenuId.has(mid)) linkedStepKeysByMenuId.set(mid, new Set())
    for (const k of Object.keys(opt.optionStepValues || {})) {
      const t = String(k).trim()
      if (t) linkedStepKeysByMenuId.get(mid)!.add(t)
    }
  }

  const selectAttempts = [
    'id,menu_id,name,option_code,option_step_values',
    'id,menu_id,name,option_code',
    'id,menu_id,name',
  ]
  let rows: {
    id?: number | string
    menu_id?: number | string
    name?: string
    option_code?: string | null
    option_step_values?: Record<string, string> | null
  }[] = []

  for (const cols of selectAttempts) {
    try {
      rows =
        ((await supabaseSelectAllPages('pos_menu_options', {
          order: 'menu_id.asc,sort_order.asc,name.asc',
          pageSize: 3000,
          maxRows: 200000,
          select: cols,
        })) as typeof rows) ?? []
      break
    } catch {
      if (cols === selectAttempts[selectAttempts.length - 1]) rows = []
    }
  }

  const tableOptions: PosOptionCatalogRow[] = (rows || [])
    .filter((row) => {
      const mid = Number(row.menu_id || 0)
      if (!linkedMenuIds.has(mid)) return true
      const sv =
        row.option_step_values &&
        typeof row.option_step_values === 'object' &&
        !Array.isArray(row.option_step_values)
          ? row.option_step_values
          : null
      if (!sv || Object.keys(sv).length === 0) return true
      const linkedKeys = linkedStepKeysByMenuId.get(mid)
      if (!linkedKeys || linkedKeys.size === 0) return true
      return Object.keys(sv).some((k) => !linkedKeys.has(k))
    })
    .map((row) => ({
      id: String(row.id ?? ''),
      menu_id: row.menu_id,
      name: String(row.name ?? ''),
      option_code:
        row.option_code && String(row.option_code).trim()
          ? String(row.option_code).trim()
          : undefined,
      option_step_values:
        row.option_step_values &&
        typeof row.option_step_values === 'object' &&
        !Array.isArray(row.option_step_values)
          ? row.option_step_values
          : undefined,
    }))

  const linkedCatalog: PosOptionCatalogRow[] = linkedOptions.map((opt) => ({
    id: String(opt.id ?? ''),
    menu_id: opt.menuId,
    name: String(opt.name ?? ''),
    option_code: opt.optionCode,
    option_step_values: opt.optionStepValues,
  }))

  return [...linkedCatalog, ...tableOptions]
}
