import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendPosCatalogTenantFilter,
  type PosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import type { PosMenuImportExistingSnapshot } from '@/lib/pos-menu-import-unchanged'

type MenuRow = {
  id?: number | string | null
  code?: string | null
  name?: string | null
  category_main?: string | null
  category?: string | null
  price?: number | null
  price_delivery?: number | null
  image?: string | null
  vat_included?: boolean | null
  is_active?: boolean | null
  sort_order?: number | null
  kitchen_printer?: number | null
  cooking_time_min?: number | null
  is_banban?: boolean | null
  option_selection_groups?: unknown
}

const MENU_SELECT =
  'id,code,name,category_main,category,price,price_delivery,image,vat_included,is_active,sort_order,kitchen_printer,cooking_time_min,is_banban,option_selection_groups'

function parseGroups(raw: unknown): string[] | null {
  if (raw == null) return null
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) return parseGroups(parsed)
    } catch {
      return text.split(/[|｜,，;；]+/).map((item) => item.trim()).filter(Boolean)
    }
  }
  return null
}

function toSnapshot(row: MenuRow, storeCodes: string[]): PosMenuImportExistingSnapshot | null {
  const code = String(row.code ?? '').trim()
  if (!code) return null
  return {
    code,
    name: String(row.name ?? '').trim(),
    categoryMain: String(row.category_main ?? '').trim(),
    category: String(row.category ?? '').trim(),
    price: Number(row.price ?? 0),
    priceDelivery: row.price_delivery == null ? null : Number(row.price_delivery),
    image: String(row.image ?? '').trim(),
    vatIncluded: row.vat_included !== false,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    kitchenPrinter: row.kitchen_printer == null ? null : Number(row.kitchen_printer),
    cookingTimeMin: row.cooking_time_min == null ? null : Number(row.cooking_time_min),
    isBanban: row.is_banban === true,
    optionSelectionGroups: parseGroups(row.option_selection_groups),
    storeCodes,
  }
}

async function selectInBatches<T>(
  table: string,
  column: string,
  values: string[],
  select: string,
  extraFilter: string,
  limitPerRow: number
): Promise<T[]> {
  const out: T[] = []
  const unique = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
  for (let i = 0; i < unique.length; i += 80) {
    const batch = unique.slice(i, i + 80)
    const list = batch.map((value) => encodeURIComponent(value)).join(',')
    const filter = [extraFilter, `${column}=in.(${list})`].filter(Boolean).join('&')
    const rows = (await supabaseSelectFilter(table, filter, {
      select,
      limit: Math.max(batch.length * limitPerRow, 1),
    })) as T[] | null
    if (rows?.length) out.push(...rows)
  }
  return out
}

/** 코드 목록의 기존 메뉴와 노출 매장. 조회가 실패하면 null (그때는 행마다 저장). */
export async function loadPosMenuImportSnapshots(
  codes: string[],
  catalogScope: PosCatalogTenantScope
): Promise<Map<string, PosMenuImportExistingSnapshot> | null> {
  try {
    const menuFilter = appendPosCatalogTenantFilter('', catalogScope)
    const menus = await selectInBatches<MenuRow>('pos_menus', 'code', codes, MENU_SELECT, menuFilter, 2)
    const ids = menus
      .map((row) => String(row.id ?? '').trim())
      .filter(Boolean)
    const scopeRows = ids.length
      ? await selectInBatches<{ menu_id?: number | string | null; store_code?: string | null; enabled?: boolean | null }>(
          'pos_menu_store_scopes',
          'menu_id',
          ids,
          'menu_id,store_code,enabled',
          '',
          30
        )
      : []
    const storesByMenu = new Map<string, string[]>()
    for (const row of scopeRows) {
      if (row.enabled === false) continue
      const menuId = String(row.menu_id ?? '').trim()
      const storeCode = String(row.store_code ?? '').trim()
      if (!menuId || !storeCode) continue
      const list = storesByMenu.get(menuId) || []
      list.push(storeCode)
      storesByMenu.set(menuId, list)
    }
    const byCode = new Map<string, PosMenuImportExistingSnapshot>()
    for (const row of menus) {
      const snap = toSnapshot(row, storesByMenu.get(String(row.id ?? '').trim()) || [])
      if (!snap) continue
      byCode.set(snap.code.toLowerCase(), snap)
    }
    return byCode
  } catch (err) {
    console.error('loadPosMenuImportSnapshots:', err)
    return null
  }
}
