import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** pos_connected_devices 에서 role=main 인 기기 토큰 목록 */
export async function listMainDeviceTokensForStore(storeCode: string): Promise<string[]> {
  const s = String(storeCode || '').trim()
  if (!s) return []
  const rows = (await supabaseSelectFilter(
    'pos_connected_devices',
    `store_code=eq.${encodeURIComponent(s)}&role=eq.main`,
    { limit: 100 }
  )) as { device_token?: string }[] | null
  const list = Array.isArray(rows) ? rows : []
  const tokens = list.map((r) => String(r.device_token ?? '').trim()).filter(Boolean)
  return [...new Set(tokens)]
}

/**
 * 하위 호환: pos_printer_settings.main_device_token 을 메인 목록의 첫 토큰(없으면 null)으로 맞춤.
 * 구버전 클라이언트가 단일 컬럼만 볼 때를 위함.
 */
export async function syncLegacyMainDeviceToken(storeCode: string): Promise<void> {
  const s = String(storeCode || '').trim()
  if (!s) return
  const tokens = await listMainDeviceTokensForStore(s)
  const legacy = tokens[0] ?? null
  const settingsRows = (await supabaseSelectFilter(
    'pos_printer_settings',
    `store_code=eq.${encodeURIComponent(s)}`,
    { limit: 1 }
  )) as { store_code?: string }[] | null
  const exists = Array.isArray(settingsRows) ? settingsRows.length > 0 : !!settingsRows
  if (!exists) return
  await supabaseUpdateByFilter(
    'pos_printer_settings',
    `store_code=eq.${encodeURIComponent(s)}`,
    { main_device_token: legacy }
  )
}
