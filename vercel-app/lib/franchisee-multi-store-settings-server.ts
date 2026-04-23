import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  FRANCHISEE_MULTI_STORE_SETTINGS_KEY,
  normalizeFranchiseeMultiStoreSettings,
  type FranchiseeMultiStoreSettings,
} from '@/lib/franchisee-multi-store'

export async function getFranchiseeMultiStoreSettings(): Promise<FranchiseeMultiStoreSettings> {
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(FRANCHISEE_MULTI_STORE_SETTINGS_KEY)}`,
      { limit: 1 }
    )) as { value_json?: unknown }[] | null
    const raw = rows?.[0]?.value_json
    return normalizeFranchiseeMultiStoreSettings(raw)
  } catch {
    return normalizeFranchiseeMultiStoreSettings(null)
  }
}

export async function saveFranchiseeMultiStoreSettings(
  settings: FranchiseeMultiStoreSettings
): Promise<void> {
  const normalized = normalizeFranchiseeMultiStoreSettings(settings)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: FRANCHISEE_MULTI_STORE_SETTINGS_KEY,
        value_json: normalized,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
}
