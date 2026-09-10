import { supabaseSelectFilter } from '@/lib/supabase-server'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { normalizeMenuScopeStoreCodes } from '@/lib/pos-menu-store-scope'

export type PromoMirrorIndex = {
  hasMirrorById: Set<string>
  storeCodesByPromoId: Map<string, string[]>
  scopeSchemaReady: boolean
}

/** 프로모 id → 미러 메뉴 존재 여부 + 미러의 매장 스코프 */
export async function loadPromoMirrorIndex(promoIds: string[]): Promise<PromoMirrorIndex> {
  const ids = [...new Set(promoIds.map((id) => String(id || '').trim()).filter(Boolean))]
  const empty: PromoMirrorIndex = {
    hasMirrorById: new Set(),
    storeCodesByPromoId: new Map(),
    scopeSchemaReady: true,
  }
  if (ids.length === 0) return empty

  const menuIdByPromoId = new Map<string, number>()
  try {
    const chunkSize = 300
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const rows = (await supabaseSelectFilter('pos_menus', `promo_id=in.(${chunk.join(',')})`, {
        limit: 10000,
        select: 'id,promo_id',
      })) as Array<{ id?: number | null; promo_id?: number | null }>
      for (const row of rows || []) {
        const promoId = String(row.promo_id ?? '').trim()
        const menuId = Number(row.id || 0)
        if (!promoId || !menuId) continue
        menuIdByPromoId.set(promoId, menuId)
      }
    }
  } catch {
    return empty
  }

  const hasMirrorById = new Set(menuIdByPromoId.keys())
  const storeCodesByMenuId = new Map<number, string[]>()
  let scopeSchemaReady = true
  const mirrorMenuIds = [...new Set(menuIdByPromoId.values())]
  try {
    const chunkSize = 300
    for (let i = 0; i < mirrorMenuIds.length; i += chunkSize) {
      const chunk = mirrorMenuIds.slice(i, i + chunkSize)
      const scopeRows = (await supabaseSelectFilter(
        'pos_menu_store_scopes',
        `menu_id=in.(${chunk.join(',')})`,
        { limit: 100000, select: 'menu_id,store_code,enabled' }
      )) as Array<{ menu_id?: number | null; store_code?: string | null; enabled?: boolean | null }>
      for (const row of scopeRows || []) {
        if (row.enabled === false) continue
        const menuId = Number(row.menu_id || 0)
        const storeCode = stripTenantPrefixedStoreCode(row.store_code || '')
        if (!menuId || !storeCode) continue
        const list = storeCodesByMenuId.get(menuId) || []
        if (!list.some((x) => x.toLowerCase() === storeCode.toLowerCase())) list.push(storeCode)
        storeCodesByMenuId.set(menuId, list)
      }
    }
  } catch {
    scopeSchemaReady = false
  }

  const storeCodesByPromoId = new Map<string, string[]>()
  for (const [promoId, menuId] of menuIdByPromoId) {
    storeCodesByPromoId.set(promoId, normalizeMenuScopeStoreCodes(storeCodesByMenuId.get(menuId) || []))
  }

  return { hasMirrorById, storeCodesByPromoId, scopeSchemaReady }
}
