import { supabaseSelectFilter } from '@/lib/supabase-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'
import {
  loadTenantScopedSystemSettingsMap,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'
import { normalizeTenantId } from '@/lib/tenant-context'

const KEY_GLOBAL_MIN = 'member_portal_pickup_min_lead_minutes'
const KEY_STORE_MIN = 'member_portal_pickup_min_lead_by_store'
const KEY_LINE_NOTIFY = 'member_portal_pickup_line_notify_enabled'

const DEFAULT_MIN_LEAD = 30

function parseStoreMinMap(raw: string): Record<string, number> {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const code = String(k || '').trim()
      const n = Math.trunc(Number(v || 0))
      if (code && n >= 5 && n <= 240) out[code] = n
    }
    return out
  } catch {
    return {}
  }
}

function parseBoolSetting(raw: string | undefined, defaultValue: boolean): boolean {
  const v = String(raw ?? '')
    .trim()
    .replace(/^"|"$/g, '')
    .toLowerCase()
  if (!v) return defaultValue
  return v === 'true' || v === '1' || v === 'yes'
}

export async function loadMemberPortalPickupSettingsForAdmin(): Promise<{
  globalMinLeadMinutes: number
  storeMinLeadMinutes: Record<string, number>
  lineNotifyEnabled: boolean
}> {
  try {
    const filter = `or=(key.eq.${KEY_GLOBAL_MIN},key.eq.${KEY_STORE_MIN},key.eq.${KEY_LINE_NOTIFY})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]
    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      if (key) map.set(key, String(row.value_json ?? '').replace(/^"|"$/g, '').trim())
    }
    const globalRaw = Math.trunc(Number(map.get(KEY_GLOBAL_MIN) || DEFAULT_MIN_LEAD))
    const globalMinLeadMinutes =
      globalRaw >= 5 && globalRaw <= 240 ? globalRaw : DEFAULT_MIN_LEAD
    return {
      globalMinLeadMinutes,
      storeMinLeadMinutes: parseStoreMinMap(map.get(KEY_STORE_MIN) || ''),
      lineNotifyEnabled: parseBoolSetting(map.get(KEY_LINE_NOTIFY), true),
    }
  } catch {
    return { globalMinLeadMinutes: DEFAULT_MIN_LEAD, storeMinLeadMinutes: {}, lineNotifyEnabled: true }
  }
}

export async function isMemberPortalPickupLineNotifyEnabled(): Promise<boolean> {
  return isMemberPortalPickupLineNotifyEnabledForStoreCode()
}

export async function isMemberPortalPickupLineNotifyEnabledForStoreCode(storeCode?: string): Promise<boolean> {
  const code = String(storeCode || '').trim()
  const tenantIdResolved = code ? await resolveTenantIdForStoreCode(code).catch(() => undefined) : undefined
  const tenantId = tenantIdResolved ? normalizeTenantId(tenantIdResolved) : ''
  const settingsScope: TenantSettingsScope = { enforce: Boolean(tenantIdResolved), tenantId }
  const settings = await loadMemberPortalPickupSettingsForAdminScoped(settingsScope)
  return settings.lineNotifyEnabled
}

export async function saveMemberPortalPickupSettings(params: {
  globalMinLeadMinutes: number
  storeMinLeadMinutes?: Record<string, number>
  lineNotifyEnabled?: boolean
}): Promise<void> {
  const { getBangkokDateTimeString } = await import('@/lib/bangkok-time')
  const { supabaseUpsert } = await import('@/lib/supabase-server')
  const globalMinLeadMinutes = Math.min(240, Math.max(5, Math.trunc(Number(params.globalMinLeadMinutes || DEFAULT_MIN_LEAD))))
  const storeMap = params.storeMinLeadMinutes || {}
  const lineNotifyEnabled = params.lineNotifyEnabled !== false
  const now = getBangkokDateTimeString()
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: KEY_GLOBAL_MIN,
        value_json: String(globalMinLeadMinutes),
        updated_at: now,
      },
      {
        key: KEY_STORE_MIN,
        value_json: JSON.stringify(storeMap),
        updated_at: now,
      },
      {
        key: KEY_LINE_NOTIFY,
        value_json: lineNotifyEnabled ? 'true' : 'false',
        updated_at: now,
      },
    ],
    'key'
  )
}

export async function resolveMemberPortalPickupMinLeadMinutes(storeCode?: string): Promise<number> {
  const code = String(storeCode || '').trim()
  const tenantIdResolved = code ? await resolveTenantIdForStoreCode(code).catch(() => undefined) : undefined
  const tenantId = tenantIdResolved ? normalizeTenantId(tenantIdResolved) : ''
  const settingsScope: TenantSettingsScope = { enforce: Boolean(tenantIdResolved), tenantId }
  const settings = await loadMemberPortalPickupSettingsForAdminScoped(settingsScope)
  if (code && settings.storeMinLeadMinutes[code] != null) {
    return settings.storeMinLeadMinutes[code]
  }
  return settings.globalMinLeadMinutes
}

export async function loadMemberPortalPickupSettingsForAdminScoped(
  settingsScope: TenantSettingsScope
): Promise<{
  globalMinLeadMinutes: number
  storeMinLeadMinutes: Record<string, number>
  lineNotifyEnabled: boolean
}> {
  try {
    const map = await loadTenantScopedSystemSettingsMap(
      [KEY_GLOBAL_MIN, KEY_STORE_MIN, KEY_LINE_NOTIFY],
      settingsScope
    )
    const globalRaw = Math.trunc(Number(map.get(KEY_GLOBAL_MIN) || DEFAULT_MIN_LEAD))
    const globalMinLeadMinutes =
      globalRaw >= 5 && globalRaw <= 240 ? globalRaw : DEFAULT_MIN_LEAD
    return {
      globalMinLeadMinutes,
      storeMinLeadMinutes: parseStoreMinMap(map.get(KEY_STORE_MIN) || ''),
      lineNotifyEnabled: parseBoolSetting(map.get(KEY_LINE_NOTIFY), true),
    }
  } catch {
    return { globalMinLeadMinutes: DEFAULT_MIN_LEAD, storeMinLeadMinutes: {}, lineNotifyEnabled: true }
  }
}

export async function saveMemberPortalPickupSettingsScoped(params: {
  globalMinLeadMinutes: number
  storeMinLeadMinutes?: Record<string, number>
  lineNotifyEnabled?: boolean
  settingsScope: TenantSettingsScope
}): Promise<void> {
  const globalMinLeadMinutes = Math.min(
    240,
    Math.max(5, Math.trunc(Number(params.globalMinLeadMinutes || DEFAULT_MIN_LEAD)))
  )
  const storeMap = params.storeMinLeadMinutes || {}
  const lineNotifyEnabled = params.lineNotifyEnabled !== false

  await upsertTenantScopedSystemSettings(
    [
      { baseKey: KEY_GLOBAL_MIN, value_json: String(globalMinLeadMinutes) },
      { baseKey: KEY_STORE_MIN, value_json: JSON.stringify(storeMap) },
      { baseKey: KEY_LINE_NOTIFY, value_json: lineNotifyEnabled ? 'true' : 'false' },
    ],
    params.settingsScope
  )
}
