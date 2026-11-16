import {
  supabaseDeleteByFilter,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { normalizeMenuScopeStoreCodes } from '@/lib/pos-menu-store-scope'
import { upsertRowsTenantStore } from '@/lib/saas-store-conflict'
import type { PosCatalogTenantScope } from '@/lib/pos-catalog-tenant-scope'

export type PromoMirrorIndex = {
  hasMirrorById: Set<string>
  storeCodesByPromoId: Map<string, string[]>
  scopeSchemaReady: boolean
}

/** 메뉴 id → 매장 스코프 코드 목록 */
export async function loadStoreCodesByMenuIds(menuIds: number[]): Promise<{
  byMenuId: Map<number, string[]>
  scopeSchemaReady: boolean
}> {
  const byMenuId = new Map<number, string[]>()
  const ids = [...new Set(menuIds.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0))]
  if (ids.length === 0) return { byMenuId, scopeSchemaReady: true }

  try {
    const chunkSize = 300
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
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
        const list = byMenuId.get(menuId) || []
        if (!list.some((x) => x.toLowerCase() === storeCode.toLowerCase())) list.push(storeCode)
        byMenuId.set(menuId, list)
      }
    }
    return { byMenuId, scopeSchemaReady: true }
  } catch {
    return { byMenuId, scopeSchemaReady: false }
  }
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
  const mirrorMenuIds = [...new Set(menuIdByPromoId.values())]
  const { byMenuId: storeCodesByMenuId, scopeSchemaReady } = await loadStoreCodesByMenuIds(mirrorMenuIds)

  const storeCodesByPromoId = new Map<string, string[]>()
  for (const [promoId, menuId] of menuIdByPromoId) {
    storeCodesByPromoId.set(promoId, normalizeMenuScopeStoreCodes(storeCodesByMenuId.get(menuId) || []))
  }

  return { hasMirrorById, storeCodesByPromoId, scopeSchemaReady }
}

/** 세트 구성 메뉴들의 노출 매장 합집합 */
export async function loadUnionStoreCodesFromPromoItems(promoId: string): Promise<string[]> {
  const id = String(promoId || '').trim()
  if (!id || !/^\d+$/.test(id)) return []
  try {
    const items = (await supabaseSelectFilter('pos_promo_items', `promo_id=eq.${id}`, {
      limit: 5000,
      select: 'menu_id',
    })) as Array<{ menu_id?: number | null }>
    const menuIds = [...new Set((items || []).map((r) => Number(r.menu_id || 0)).filter(Boolean))]
    if (menuIds.length === 0) return []
    const { byMenuId } = await loadStoreCodesByMenuIds(menuIds)
    const out: string[] = []
    for (const codes of byMenuId.values()) {
      for (const code of codes) {
        if (!out.some((x) => x.toLowerCase() === code.toLowerCase())) out.push(code)
      }
    }
    return normalizeMenuScopeStoreCodes(out)
  } catch {
    return []
  }
}

/**
 * 세트/프로모 저장 시 미러 메뉴 스코프에 쓸 매장 목록.
 * - storeCodes 배열이 요청에 오면 그대로 동기화(빈 배열이면 스코프 삭제)
 * - 없으면 구성 메뉴 스코프 합집합으로 채움(있을 때만 동기화)
 * - 둘 다 없으면 기존 스코프를 건드리지 않음(판매중 토글 등)
 */
export async function resolvePromoMirrorStoreCodesForSave(params: {
  hasExplicitStoreCodes: boolean
  explicitStoreCodes?: unknown
  promoId: string
}): Promise<{ storeCodes: string[]; shouldSync: boolean }> {
  if (params.hasExplicitStoreCodes) {
    return {
      storeCodes: normalizeMenuScopeStoreCodes(params.explicitStoreCodes),
      shouldSync: true,
    }
  }
  const inherited = await loadUnionStoreCodesFromPromoItems(params.promoId)
  if (inherited.length > 0) {
    return { storeCodes: inherited, shouldSync: true }
  }
  return { storeCodes: [], shouldSync: false }
}

/** 미러 메뉴의 pos_menu_store_scopes 를 교체 저장 */
export async function syncPromoMirrorMenuStoreScopes(params: {
  menuId: number | string
  storeCodes: string[]
  catalogScope: PosCatalogTenantScope
}): Promise<{ ok: boolean; message?: string }> {
  const savedMenuId = String(params.menuId || '').trim()
  if (!savedMenuId) {
    return { ok: false, message: '미러 메뉴 id 없음 — 매장 노출 범위를 저장하지 못했습니다.' }
  }
  const storeCodes = normalizeMenuScopeStoreCodes(params.storeCodes)
  try {
    await supabaseDeleteByFilter('pos_menu_store_scopes', `menu_id=eq.${encodeURIComponent(savedMenuId)}`)
    if (storeCodes.length > 0) {
      await upsertRowsTenantStore(
        'pos_menu_store_scopes',
        'store_code,menu_id',
        storeCodes.map((storeCode) => ({
          menu_id: Number(savedMenuId),
          store_code: storeCode,
          enabled: true,
        })),
        params.catalogScope
      )
    }
    return { ok: true }
  } catch (e) {
    console.error('syncPromoMirrorMenuStoreScopes:', e)
    return {
      ok: false,
      message: '미러 메뉴 저장은 완료되었지만 매장 노출 범위 저장에 실패했습니다. DB 스키마를 확인해 주세요.',
    }
  }
}
