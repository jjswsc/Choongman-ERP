import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { isPosMenuSoldOut } from '@/lib/pos-menu-sold-out'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type StoreSoldOutLoadResult = {
  /** menu_id → sold_out_date (YYYY-MM-DD) */
  byMenuId: Map<number, string>
  schemaReady: boolean
}

function isMissingRelationError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase()
  return (
    msg.includes('pos_menu_store_sold_out') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

/** 매장별 품절 맵 로드. 테이블 미배포면 schemaReady=false + 빈 맵 */
export async function loadStoreMenuSoldOutMap(storeCode: string): Promise<StoreSoldOutLoadResult> {
  const code = stripTenantPrefixedStoreCode(storeCode)
  const empty: StoreSoldOutLoadResult = { byMenuId: new Map(), schemaReady: true }
  if (!code) return empty
  try {
    const rows = (await supabaseSelectFilter(
      'pos_menu_store_sold_out',
      `store_code=eq.${encodeURIComponent(code)}`,
      { limit: 20000, select: 'menu_id,sold_out_date' }
    )) as Array<{ menu_id?: number | null; sold_out_date?: string | null }>
    const byMenuId = new Map<number, string>()
    for (const row of rows || []) {
      const menuId = Math.floor(Number(row.menu_id || 0))
      const d = String(row.sold_out_date || '').trim().slice(0, 10)
      if (!menuId || !d) continue
      byMenuId.set(menuId, d)
    }
    return { byMenuId, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { byMenuId: new Map(), schemaReady: false }
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

/** 매장 품절 ON/OFF. soldOut=false 이면 행 삭제 */
export async function setStoreMenuSoldOut(params: {
  menuId: number | string
  storeCode: string
  soldOut: boolean
}): Promise<{ soldOutDate: string | null; schemaReady: boolean }> {
  const menuId = Math.floor(Number(params.menuId || 0))
  const storeCode = stripTenantPrefixedStoreCode(params.storeCode)
  if (!menuId || !storeCode) {
    throw new Error('menu id and storeCode required')
  }
  const today = bangkokTodayYmd()
  try {
    if (params.soldOut) {
      await supabaseUpsert(
        'pos_menu_store_sold_out',
        [{ menu_id: menuId, store_code: storeCode, sold_out_date: today }],
        'store_code,menu_id'
      )
      return { soldOutDate: today, schemaReady: true }
    }
    await supabaseDeleteByFilter(
      'pos_menu_store_sold_out',
      `store_code=eq.${encodeURIComponent(storeCode)}&menu_id=eq.${menuId}`
    )
    return { soldOutDate: null, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { soldOutDate: null, schemaReady: false }
    }
    throw e
  }
}
