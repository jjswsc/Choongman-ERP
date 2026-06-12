import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isMemberPortalPublicStore } from '@/lib/member-portal-stores-shared'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export { MEMBER_PORTAL_PREPAY_MIN_QR_BAHT, MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS } from '@/lib/member-portal-prepay-constants'

const KEY_ENABLED = 'member_portal_prepay_enabled'
const KEY_STORE_CODES = 'member_portal_prepay_store_codes'
const KEY_ALL_PUBLIC = 'member_portal_prepay_all_public_stores'

export type MemberPortalPrepayConfig = {
  enabled: boolean
  /** 비어 있으면 enabled 시 본사·오피스 계열 매장명/코드 허용 */
  storeCodes: Set<string>
  /** true면 회원앱 공개 매장 전체 선결제 (storeCodes 무시) */
  allPublicStores: boolean
}

function parseStoreCodesJson(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x || '').trim()).filter(Boolean)
  } catch {
    return trimmed
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  }
}

function normStoreCode(code: string): string {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseBoolSetting(raw: string): boolean {
  const v = String(raw || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function readSettingValue(raw: unknown): string {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  if (typeof raw === 'string') return raw.replace(/^"|"$/g, '').trim()
  if (raw != null) return JSON.stringify(raw)
  return ''
}

export async function loadMemberPortalPrepayConfig(): Promise<MemberPortalPrepayConfig> {
  const envEnabled = String(process.env.MEMBER_PORTAL_PREPAY_ENABLED || '').trim() === '1'
  try {
    const filter = `or=(key.eq.${KEY_ENABLED},key.eq.${KEY_STORE_CODES},key.eq.${KEY_ALL_PUBLIC})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]
    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      if (key) map.set(key, readSettingValue(row.value_json))
    }
    const enabled = envEnabled || parseBoolSetting(map.get(KEY_ENABLED) || '')
    const codes = parseStoreCodesJson(map.get(KEY_STORE_CODES) || '')
    return {
      enabled,
      storeCodes: new Set(codes.map(normStoreCode)),
      allPublicStores: parseBoolSetting(map.get(KEY_ALL_PUBLIC) || ''),
    }
  } catch {
    return { enabled: envEnabled, storeCodes: new Set(), allPublicStores: false }
  }
}

export function isMemberPortalPrepayStore(
  store: Pick<{ storeCode: string; displayName?: string }, 'storeCode' | 'displayName'>,
  config: MemberPortalPrepayConfig
): boolean {
  if (!config.enabled) return false
  const code = String(store.storeCode || '').trim()
  if (!code) return false
  const displayName = String(store.displayName || '').trim()
  if (config.allPublicStores && isMemberPortalPublicStore({ storeCode: code, displayName: displayName || code })) return true
  const norm = normStoreCode(code)
  if (config.storeCodes.size > 0) {
    return config.storeCodes.has(norm)
  }
  return isHeadOfficeLikeStoreName(code) || isHeadOfficeLikeStoreName(displayName)
}

export async function loadMemberPortalPrepaySettingsForAdmin(): Promise<{
  enabled: boolean
  storeCodes: string[]
  allPublicStores: boolean
  envOverride: boolean
}> {
  const envOverride = String(process.env.MEMBER_PORTAL_PREPAY_ENABLED || '').trim() === '1'
  try {
    const filter = `or=(key.eq.${KEY_ENABLED},key.eq.${KEY_STORE_CODES},key.eq.${KEY_ALL_PUBLIC})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]
    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      if (key) map.set(key, readSettingValue(row.value_json))
    }
    const dbEnabled = parseBoolSetting(map.get(KEY_ENABLED) || '')
    return {
      enabled: envOverride || dbEnabled,
      storeCodes: parseStoreCodesJson(map.get(KEY_STORE_CODES) || ''),
      allPublicStores: parseBoolSetting(map.get(KEY_ALL_PUBLIC) || ''),
      envOverride,
    }
  } catch {
    return { enabled: envOverride, storeCodes: [], allPublicStores: false, envOverride }
  }
}

export async function saveMemberPortalPrepaySettings(params: {
  enabled: boolean
  storeCodes: string[]
  allPublicStores?: boolean
}): Promise<void> {
  if (String(process.env.MEMBER_PORTAL_PREPAY_ENABLED || '').trim() === '1') {
    throw new Error('prepay_env_override')
  }
  const codes = (params.storeCodes || []).map((c) => String(c || '').trim()).filter(Boolean)
  const now = getBangkokDateTimeString()
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: KEY_ENABLED,
        value_json: params.enabled ? 'true' : 'false',
        updated_at: now,
      },
      {
        key: KEY_STORE_CODES,
        value_json: JSON.stringify(codes),
        updated_at: now,
      },
      {
        key: KEY_ALL_PUBLIC,
        value_json: params.allPublicStores ? 'true' : 'false',
        updated_at: now,
      },
    ],
    'key'
  )
}
