import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isMemberPortalPublicStore } from '@/lib/member-portal-stores-shared'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import {
  loadTenantScopedSystemSettingsMap,
  upsertTenantScopedSystemSettings,
} from '@/lib/tenant-system-settings-server'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'
import type { NextRequest } from 'next/server'

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

const PREPAY_KEYS = [KEY_ENABLED, KEY_STORE_CODES, KEY_ALL_PUBLIC] as const
const LEGACY_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }

function configFromMap(map: Map<string, string>, envEnabled: boolean): MemberPortalPrepayConfig {
  const enabled = envEnabled || parseBoolSetting(map.get(KEY_ENABLED) || '')
  const codes = parseStoreCodesJson(map.get(KEY_STORE_CODES) || '')
  return {
    enabled,
    storeCodes: new Set(codes.map(normStoreCode)),
    allPublicStores: parseBoolSetting(map.get(KEY_ALL_PUBLIC) || ''),
  }
}

export function isMemberPortalPrepayEnvOverride(): boolean {
  return String(process.env.MEMBER_PORTAL_PREPAY_ENABLED || '').trim() === '1'
}

export async function loadMemberPortalPrepayConfig(
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<MemberPortalPrepayConfig> {
  const envEnabled = isMemberPortalPrepayEnvOverride()
  try {
    const map = await loadTenantScopedSystemSettingsMap(PREPAY_KEYS, scope)
    return configFromMap(map, envEnabled)
  } catch {
    return { enabled: envEnabled, storeCodes: new Set(), allPublicStores: false }
  }
}

/** 회원 세션 테넌트로 선결제 설정을 읽는다. (관리자 저장 키와 동일 스코프) */
export async function loadMemberPortalPrepayConfigForMember(params: {
  memberId?: number | null
  request?: NextRequest
}): Promise<MemberPortalPrepayConfig> {
  const tenantScope = await resolveMemberPortalTenantScope({
    memberId: params.memberId,
    request: params.request,
  })
  return loadMemberPortalPrepayConfig({
    enforce: tenantScope.enforce,
    tenantId: tenantScope.tenantId,
  })
}

export function isMemberPortalPrepayStore(
  store: Pick<{ storeCode: string; displayName?: string }, 'storeCode' | 'displayName'>,
  config: MemberPortalPrepayConfig
): boolean {
  if (!config.enabled) return false
  const code = String(store.storeCode || '').trim()
  if (!code) return false
  const displayName = String(store.displayName || '').trim()
  if (config.allPublicStores) {
    return isMemberPortalPublicStore({ storeCode: code, displayName: displayName || code })
  }
  const norm = normStoreCode(code)
  if (config.storeCodes.size > 0) {
    return config.storeCodes.has(norm)
  }
  return isHeadOfficeLikeStoreName(code) || isHeadOfficeLikeStoreName(displayName)
}

export async function loadMemberPortalPrepaySettingsForAdmin(
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<{
  enabled: boolean
  storeCodes: string[]
  allPublicStores: boolean
  envOverride: boolean
}> {
  const envOverride = isMemberPortalPrepayEnvOverride()
  try {
    const map = await loadTenantScopedSystemSettingsMap(PREPAY_KEYS, scope)
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

export async function saveMemberPortalPrepaySettings(
  params: {
    enabled: boolean
    storeCodes: string[]
    allPublicStores?: boolean
  },
  scope: TenantSettingsScope = LEGACY_SCOPE
): Promise<void> {
  const codes = (params.storeCodes || []).map((c) => String(c || '').trim()).filter(Boolean)
  await upsertTenantScopedSystemSettings(
    [
      { baseKey: KEY_ENABLED, value_json: params.enabled ? 'true' : 'false' },
      { baseKey: KEY_STORE_CODES, value_json: JSON.stringify(codes) },
      { baseKey: KEY_ALL_PUBLIC, value_json: params.allPublicStores ? 'true' : 'false' },
    ],
    scope
  )
}
