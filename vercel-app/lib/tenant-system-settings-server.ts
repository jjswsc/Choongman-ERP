import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { readSystemSettingString } from '@/lib/system-settings-value'
import {
  tenantScopedSettingsKey,
  tenantScopedSettingsKeys,
  type TenantSettingsScope,
} from '@/lib/tenant-system-settings'

/** tenant 스코프 키 우선, 없으면 레거시 글로벌 키 폴백 */
export async function loadTenantScopedSystemSettingsMap(
  baseKeys: readonly string[],
  scope: TenantSettingsScope
): Promise<Map<string, string>> {
  const lookupKeys = [...new Set(baseKeys.flatMap((k) => tenantScopedSettingsKeys(k, scope)))]
  if (!lookupKeys.length) return new Map()

  const filter = `or=(${lookupKeys.map((k) => `key.eq.${encodeURIComponent(k)}`).join(',')})`
  const rows = (await supabaseSelectFilter('system_settings', filter, {
    limit: Math.max(lookupKeys.length, 12),
    select: 'key,value_json',
  })) as { key?: string; value_json?: unknown }[]

  const rawByKey = new Map<string, string>()
  for (const row of rows || []) {
    const key = String(row.key || '').trim()
    if (!key) continue
    rawByKey.set(key, readSystemSettingString(row.value_json))
  }

  const result = new Map<string, string>()
  for (const baseKey of baseKeys) {
    for (const candidate of tenantScopedSettingsKeys(baseKey, scope)) {
      const value = rawByKey.get(candidate)
      if (value != null && value !== '') {
        result.set(baseKey, value)
        break
      }
    }
  }
  return result
}

/** JSON 원본 — tenant 키 우선, 글로벌 폴백 */
export async function loadTenantScopedSystemSettingJson(
  baseKey: string,
  scope: TenantSettingsScope
): Promise<unknown | null> {
  const keys = tenantScopedSettingsKeys(baseKey, scope)
  if (!keys.length) return null
  const filter = `or=(${keys.map((k) => `key.eq.${encodeURIComponent(k)}`).join(',')})`
  const rows = (await supabaseSelectFilter('system_settings', filter, {
    limit: keys.length,
    select: 'key,value_json',
  })) as { key?: string; value_json?: unknown }[]
  const byKey = new Map<string, unknown>()
  for (const row of rows || []) {
    const key = String(row.key || '').trim()
    if (key) byKey.set(key, row.value_json)
  }
  for (const candidate of keys) {
    if (byKey.has(candidate)) return byKey.get(candidate) ?? null
  }
  return null
}

export async function upsertTenantScopedSystemSettings(
  entries: Array<{ baseKey: string; value_json: unknown }>,
  scope: TenantSettingsScope
): Promise<void> {
  if (!entries.length) return
  const now = getBangkokDateTimeString()
  await supabaseUpsert(
    'system_settings',
    entries.map((entry) => ({
      key: tenantScopedSettingsKey(entry.baseKey, scope),
      value_json: entry.value_json,
      updated_at: now,
    })),
    'key'
  )
}
