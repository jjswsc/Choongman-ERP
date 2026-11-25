import { bangkokTodayYmd } from '@/lib/bangkok-date'
import {
  shouldApplyBanbanFlavorSoldOutForChannel,
  type BanbanFlavorSoldOutChannel,
} from '@/lib/pos-banban-flavor-store-sold-out'
import {
  normalizePosMenuSoldOutScope,
  type PosMenuSoldOutScope,
} from '@/lib/pos-menu-sold-out'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { supabaseDeleteByFilter, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type StoreBanbanFlavorSoldOutLoadResult = {
  byMenuId: Map<number, string>
  scopeByMenuId: Map<number, PosMenuSoldOutScope>
  /** 채널 필터 반영된 품절 flavor menu id */
  soldOutMenuIds: Set<string>
  schemaReady: boolean
}

function isMissingRelationError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err || '').toLowerCase()
  return (
    msg.includes('pos_banban_flavor_store_sold_out') &&
    (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find'))
  )
}

/** 매장별 Banban 맛 품절 로드. 테이블 미배포면 schemaReady=false */
export async function loadStoreBanbanFlavorSoldOut(
  storeCode: string,
  opts?: { channel?: BanbanFlavorSoldOutChannel }
): Promise<StoreBanbanFlavorSoldOutLoadResult> {
  const code = stripTenantPrefixedStoreCode(storeCode)
  const empty: StoreBanbanFlavorSoldOutLoadResult = {
    byMenuId: new Map(),
    scopeByMenuId: new Map(),
    soldOutMenuIds: new Set(),
    schemaReady: true,
  }
  if (!code) return empty
  const channel = opts?.channel ?? 'storefront'
  try {
    const rows = (await supabaseSelectFilter(
      'pos_banban_flavor_store_sold_out',
      `store_code=eq.${encodeURIComponent(code)}`,
      {
        limit: 5000,
        select: 'flavor_menu_id,sold_out_date,scope',
      }
    )) as Array<{
      flavor_menu_id?: number | null
      sold_out_date?: string | null
      scope?: string | null
    }>
    const byMenuId = new Map<number, string>()
    const scopeByMenuId = new Map<number, PosMenuSoldOutScope>()
    const soldOutMenuIds = new Set<string>()
    for (const row of rows || []) {
      const menuId = Math.floor(Number(row.flavor_menu_id || 0))
      const d = String(row.sold_out_date || '').trim().slice(0, 10)
      if (!menuId || !d) continue
      const scope = normalizePosMenuSoldOutScope(row.scope ?? 'store')
      byMenuId.set(menuId, d)
      scopeByMenuId.set(menuId, scope)
      if (shouldApplyBanbanFlavorSoldOutForChannel(channel, scope)) {
        soldOutMenuIds.add(String(menuId))
      }
    }
    return { byMenuId, scopeByMenuId, soldOutMenuIds, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return {
        byMenuId: new Map(),
        scopeByMenuId: new Map(),
        soldOutMenuIds: new Set(),
        schemaReady: false,
      }
    }
    throw e
  }
}

export function isBanbanFlavorSoldOutForStore(
  flavorMenuId: number | string,
  soldOutMenuIds: ReadonlySet<string>
): boolean {
  const id = String(Math.floor(Number(flavorMenuId) || 0))
  if (!id || id === '0') return false
  return soldOutMenuIds.has(id)
}

/** Banban 맛 품절 ON/OFF. soldOut=false 이면 행 삭제. */
export async function setStoreBanbanFlavorSoldOut(params: {
  storeCode: string
  flavorMenuId: number | string
  soldOut: boolean
  scope?: PosMenuSoldOutScope
}): Promise<{
  soldOutDate: string | null
  soldOutScope: PosMenuSoldOutScope | null
  schemaReady: boolean
}> {
  const storeCode = stripTenantPrefixedStoreCode(params.storeCode)
  const flavorMenuId = Math.floor(Number(params.flavorMenuId || 0))
  if (!storeCode || !flavorMenuId) {
    throw new Error('storeCode, flavorMenuId required')
  }
  const scope = normalizePosMenuSoldOutScope(params.scope ?? 'store')
  const today = bangkokTodayYmd()
  try {
    if (params.soldOut) {
      await supabaseUpsert(
        'pos_banban_flavor_store_sold_out',
        [
          {
            store_code: storeCode,
            flavor_menu_id: flavorMenuId,
            sold_out_date: today,
            scope,
          },
        ],
        'store_code,flavor_menu_id'
      )
      return { soldOutDate: today, soldOutScope: scope, schemaReady: true }
    }
    await supabaseDeleteByFilter(
      'pos_banban_flavor_store_sold_out',
      `store_code=eq.${encodeURIComponent(storeCode)}&flavor_menu_id=eq.${flavorMenuId}`
    )
    return { soldOutDate: null, soldOutScope: null, schemaReady: true }
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { soldOutDate: null, soldOutScope: null, schemaReady: false }
    }
    throw e
  }
}
