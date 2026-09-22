import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { resolveSaasTenantScope } from '@/lib/saas-tenant-scope'
import { storeRowFilter } from '@/lib/saas-store-conflict'

/** pos_connected_devices 에서 role=main 인 기기 토큰 목록 */
export async function listMainDeviceTokensForStore(
  storeCode: string,
  tenantId?: string | null
): Promise<string[]> {
  const s = String(storeCode || '').trim()
  if (!s) return []
  const tenantScope = await resolveSaasTenantScope({
    auth: tenantId ? { tenantId } : null,
    storeCode: s,
  })
  try {
    const rows = (await supabaseSelectFilter(
      'pos_connected_devices',
      `${storeRowFilter('store_code', s, tenantScope, 'pos_connected_devices')}&role=eq.main`,
      { limit: 100 }
    )) as { device_token?: string }[] | null
    const list = Array.isArray(rows) ? rows : []
    const tokens = list.map((r) => String(r.device_token ?? '').trim()).filter(Boolean)
    return [...new Set(tokens)]
  } catch (e) {
    // 테이블 미생성·PostgREST 스키마 캐시 없음(PGRST205) 등: 프린터 설정 조회 전체가 실패하지 않도록 빈 목록
    console.warn('listMainDeviceTokensForStore:', e)
    return []
  }
}

/**
 * 하위 호환: pos_printer_settings.main_device_token 을 메인 목록의 첫 토큰(없으면 null)으로 맞춤.
 * 구버전 클라이언트가 단일 컬럼만 볼 때를 위함.
 */
export async function syncLegacyMainDeviceToken(
  storeCode: string,
  tenantId?: string | null
): Promise<void> {
  const s = String(storeCode || '').trim()
  if (!s) return
  const tenantScope = await resolveSaasTenantScope({
    auth: tenantId ? { tenantId } : null,
    storeCode: s,
  })
  const tokens = await listMainDeviceTokensForStore(s, tenantId)
  const legacy = tokens[0] ?? null
  const settingsFilter = storeRowFilter('store_code', s, tenantScope, 'pos_printer_settings')
  const settingsRows = (await supabaseSelectFilter('pos_printer_settings', settingsFilter, {
    limit: 1,
  })) as { store_code?: string }[] | null
  const exists = Array.isArray(settingsRows) ? settingsRows.length > 0 : !!settingsRows
  if (!exists) return
  await supabaseUpdateByFilter('pos_printer_settings', settingsFilter, { main_device_token: legacy })
}
