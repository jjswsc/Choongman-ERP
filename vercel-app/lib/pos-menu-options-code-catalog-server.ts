import { supabaseSelectAllPages } from '@/lib/supabase-server'
import {
  type PosOptionGroupRow,
  buildMenuOptionsFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'

export type PosOptionCodeCatalogRow = {
  optionCode: string
  name: string
}

/** Grab 저장·수리·인쇄용 option_code → 표시명 (레거시 pos_menu_options + 옵션그룹 링크 병합) */
export async function loadPosOptionRowsForCodeMap(): Promise<PosOptionCodeCatalogRow[]> {
  const linkedOptions: Array<{ optionCode?: string; name?: string }> = []
  const linksByMenuId = new Map<number, Awaited<ReturnType<typeof loadMenuGroupLinks>>>()
  const groupsById = new Map<number, PosOptionGroupRow>()
  let itemsByGroupId: Awaited<ReturnType<typeof loadPosOptionGroupsWithItems>>['itemsByGroupId'] =
    new Map()
  const menuCodeById = new Map<number, string>()

  try {
    const [{ groups, itemsByGroupId: loadedItemsByGroupId }, links] = await Promise.all([
      loadPosOptionGroupsWithItems(),
      loadMenuGroupLinks(),
    ])
    itemsByGroupId = loadedItemsByGroupId
    for (const g of groups || []) {
      const id = Number(g.id || 0)
      if (!id) continue
      groupsById.set(id, g)
    }
    for (const link of links || []) {
      const mid = Number(link.menu_id || 0)
      if (!mid) continue
      if (!linksByMenuId.has(mid)) linksByMenuId.set(mid, [])
      linksByMenuId.get(mid)!.push(link)
    }
  } catch {
    // 신규 구조 미배포 환경 fallback
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
      if (!id) continue
      menuCodeById.set(id, String(row.code ?? '').trim())
    }
  } catch {
    // menu code 없으면 링크 option_code 생략
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

  let legacyRows: { name?: string; option_code?: string | null }[] | null = null
  try {
    legacyRows = (await supabaseSelectAllPages('pos_menu_options', {
      order: 'menu_id.asc,sort_order.asc,name.asc',
      pageSize: 3000,
      maxRows: 200000,
      select: 'name,option_code',
    })) as { name?: string; option_code?: string | null }[] | null
  } catch {
    try {
      legacyRows = (await supabaseSelectAllPages('pos_menu_options', {
        order: 'menu_id.asc,sort_order.asc,name.asc',
        pageSize: 3000,
        maxRows: 200000,
        select: 'name',
      })) as { name?: string }[] | null
    } catch {
      legacyRows = []
    }
  }

  const byCode = new Map<string, string>()
  const push = (codeRaw: unknown, nameRaw: unknown) => {
    const code = String(codeRaw ?? '').trim()
    const name = String(nameRaw ?? '').trim()
    if (!code || !name) return
    const key = code.toUpperCase()
    if (!byCode.has(key)) byCode.set(key, name)
  }

  for (const opt of linkedOptions) {
    push(opt.optionCode, opt.name)
  }
  for (const row of legacyRows || []) {
    push(row.option_code, row.name)
  }

  return [...byCode.entries()].map(([optionCode, name]) => ({ optionCode, name }))
}
