import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import {
  isPosMenuSoldOut,
  normalizePosMenuSoldOutScope,
  type PosMenuSoldOutScope,
} from '@/lib/pos-menu-sold-out'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type StoreSoldOutLoadResult = {
  /** menu_id → sold_out_date (YYYY-MM-DD) */
  byMenuId: Map<number, string>
  /** menu_id → 품절 범위 (scope 컬럼 미배포면 전부 all) */
  scopeByMenuId?: Map<number, PosMenuSoldOutScope>
  schemaReady: boolean
}

/** storefront = POS 홀·포장·QR·픽업, delivery = Grab 등 배달 (scope=store 행 제외) */
export type StoreSoldOutChannel = 'storefront' | 'delivery'

/** PostgREST 컬럼 누락 메시지에도 테이블명이 들어가므로 scope 컬럼 오류를 먼저 거른다 */
function isMissingScopeColumnError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase()
  return (
    (msg.includes("'scope'") || msg.includes('.scope')) &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

function isMissingRelationError(err: unknown): boolean {
  if (isMissingScopeColumnError(err)) return false
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase()
  return (
    msg.includes('pos_menu_store_sold_out') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

async function selectStoreSoldOutRows(
  code: string
): Promise<Array<{ menu_id?: number | null; sold_out_date?: string | null; scope?: string | null }>> {
  const filter = `store_code=eq.${encodeURIComponent(code)}`
  try {
    return (await supabaseSelectFilter('pos_menu_store_sold_out', filter, {
      limit: 20000,
      select: 'menu_id,sold_out_date,scope',
    })) as Array<{ menu_id?: number | null; sold_out_date?: string | null; scope?: string | null }>
  } catch (e) {
    if (!isMissingScopeColumnError(e)) throw e
    return (await supabaseSelectFilter('pos_menu_store_sold_out', filter, {
      limit: 20000,
      select: 'menu_id,sold_out_date',
    })) as Array<{ menu_id?: number | null; sold_out_date?: string | null }>
  }
}

/** 매장별 품절 맵 로드. 테이블 미배포면 schemaReady=false + 빈 맵 */
export async function loadStoreMenuSoldOutMap(
  storeCode: string,
  opts?: { channel?: StoreSoldOutChannel }
): Promise<StoreSoldOutLoadResult> {
  const code = stripTenantPrefixedStoreCode(storeCode)
  const empty: StoreSoldOutLoadResult = { byMenuId: new Map(), scopeByMenuId: new Map(), schemaReady: true }
  if (!code) return empty
  const channel = opts?.channel ?? 'storefront'
  try {
    const rows = await selectStoreSoldOutRows(code)
    const byMenuId = new Map<number, string>()
    const scopeByMenuId = new Map<number, PosMenuSoldOutScope>()
    for (const row of rows || []) {
      const menuId = Math.floor(Number(row.menu_id || 0))
      const d = String(row.sold_out_date || '').trim().slice(0, 10)
      if (!menuId || !d) continue
      const scope = normalizePosMenuSoldOutScope(row.scope)
      if (channel === 'delivery' && scope === 'store') continue
      byMenuId.set(menuId, d)
      scopeByMenuId.set(menuId, scope)
    }
    return { byMenuId, scopeByMenuId, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { byMenuId: new Map(), scopeByMenuId: new Map(), schemaReady: false }
    }
    throw e
  }
}

/**
 * 매장 컨텍스트: 매장별 행만 품절.
 * 매장 컨텍스트 없음(관리자 전체 목록): 전역 sold_out_date.
 */
export function resolveMenuSoldOutDate(params: {
  menuId: number
  globalSoldOutDate?: string | null
  storeMap: Map<number, string> | null
  useStoreScope: boolean
}): string | null {
  if (params.useStoreScope && params.storeMap) {
    return params.storeMap.get(params.menuId) || null
  }
  const g = String(params.globalSoldOutDate || '').trim().slice(0, 10)
  return g || null
}

export function isMenuSoldOutForStore(params: {
  menuId: number
  globalSoldOutDate?: string | null
  storeMap: Map<number, string> | null
  useStoreScope: boolean
}): boolean {
  return isPosMenuSoldOut(
    resolveMenuSoldOutDate(params)
  )
}

/** 매장 품절 ON/OFF. soldOut=false 이면 행 삭제. scope=store 는 scope 컬럼 필요 */
export async function setStoreMenuSoldOut(params: {
  menuId: number | string
  storeCode: string
  soldOut: boolean
  scope?: PosMenuSoldOutScope
}): Promise<{
  soldOutDate: string | null
  soldOutScope: PosMenuSoldOutScope | null
  schemaReady: boolean
  scopeSchemaReady: boolean
}> {
  const menuId = Math.floor(Number(params.menuId || 0))
  const storeCode = stripTenantPrefixedStoreCode(params.storeCode)
  if (!menuId || !storeCode) {
    throw new Error('menu id and storeCode required')
  }
  const scope = normalizePosMenuSoldOutScope(params.scope)
  const today = bangkokTodayYmd()
  try {
    if (params.soldOut) {
      const base = { menu_id: menuId, store_code: storeCode, sold_out_date: today }
      try {
        await supabaseUpsert('pos_menu_store_sold_out', [{ ...base, scope }], 'store_code,menu_id')
      } catch (e) {
        if (!isMissingScopeColumnError(e)) throw e
        if (scope === 'store') {
          return { soldOutDate: null, soldOutScope: null, schemaReady: true, scopeSchemaReady: false }
        }
        await supabaseUpsert('pos_menu_store_sold_out', [base], 'store_code,menu_id')
      }
      return { soldOutDate: today, soldOutScope: scope, schemaReady: true, scopeSchemaReady: true }
    }
    await supabaseDeleteByFilter(
      'pos_menu_store_sold_out',
      `store_code=eq.${encodeURIComponent(storeCode)}&menu_id=eq.${menuId}`
    )
    return { soldOutDate: null, soldOutScope: null, schemaReady: true, scopeSchemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { soldOutDate: null, soldOutScope: null, schemaReady: false, scopeSchemaReady: false }
    }
    throw e
  }
}
