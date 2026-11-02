import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  buildPosOrderMenuIdLikePatterns,
  posMenuDeleteBlockMessage,
  type PosMenuDeleteBlockReason,
} from '@/lib/pos-menu-delete-guard'

function isMissingRpcError(err: unknown): boolean {
  const s = err instanceof Error ? err.message : String(err || '')
  return (
    s.includes('PGRST202') ||
    /Could not find the function/i.test(s) ||
    /function .* does not exist/i.test(s)
  )
}

async function tableHasRow(table: string, filter: string): Promise<boolean> {
  try {
    const rows = (await supabaseSelectFilter(table, filter, {
      limit: 1,
      select: 'id',
    })) as unknown[]
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    const s = e instanceof Error ? e.message : String(e || '')
    // 테이블/컬럼 미배포 환경은 해당 검사를 건너뜀
    if (/PGRST205|PGRST204|does not exist|Could not find/i.test(s)) return false
    throw e
  }
}

async function orderUsageViaRpc(menuId: string): Promise<boolean | null> {
  try {
    const raw = await supabaseRpc<boolean | { has_usage?: boolean } | null>(
      'pos_menu_has_order_usage',
      { p_menu_id: Number(menuId) }
    )
    if (typeof raw === 'boolean') return raw
    if (raw && typeof raw === 'object' && 'has_usage' in raw) {
      return Boolean((raw as { has_usage?: boolean }).has_usage)
    }
    return Boolean(raw)
  } catch (e) {
    if (isMissingRpcError(e)) return null
    throw e
  }
}

async function orderUsageViaLikeFallback(menuId: string): Promise<boolean> {
  const patterns = buildPosOrderMenuIdLikePatterns(menuId)
  for (const pattern of patterns) {
    const filter = `items_json=like.${encodeURIComponent(pattern)}`
    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 1,
      select: 'id',
    })) as unknown[]
    if (Array.isArray(rows) && rows.length > 0) return true
  }
  return false
}

/**
 * 삭제 가능하면 null, 불가하면 한국어 메시지(API → translateApiMessage).
 */
export async function findPosMenuDeleteBlockReason(params: {
  menuId: string
  promoId?: number | string | null
}): Promise<{ reason: PosMenuDeleteBlockReason; message: string } | null> {
  const menuId = String(params.menuId || '').trim()
  if (!menuId) return null

  const promoId = params.promoId != null && String(params.promoId).trim() !== ''
    ? String(params.promoId).trim()
    : ''
  if (promoId && promoId !== '0') {
    return { reason: 'promo_mirror', message: posMenuDeleteBlockMessage('promo_mirror') }
  }

  if (await tableHasRow('pos_promo_items', `menu_id=eq.${encodeURIComponent(menuId)}`)) {
    return { reason: 'promo_items', message: posMenuDeleteBlockMessage('promo_items') }
  }

  const banbanOr = `or=(banban_menu_id.eq.${encodeURIComponent(menuId)},flavor_menu_id.eq.${encodeURIComponent(menuId)})`
  if (await tableHasRow('pos_banban_flavor_links', banbanOr)) {
    return { reason: 'banban', message: posMenuDeleteBlockMessage('banban') }
  }

  if (
    await tableHasRow(
      'pos_menu_options',
      `additive_source_menu_id=eq.${encodeURIComponent(menuId)}`
    )
  ) {
    return { reason: 'additive_source', message: posMenuDeleteBlockMessage('additive_source') }
  }

  const viaRpc = await orderUsageViaRpc(menuId)
  const hasOrder = viaRpc === null ? await orderUsageViaLikeFallback(menuId) : viaRpc
  if (hasOrder) {
    return { reason: 'order', message: posMenuDeleteBlockMessage('order') }
  }

  return null
}
