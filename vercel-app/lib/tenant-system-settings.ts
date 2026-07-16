/**
 * Omni SaaS: system_settings 키를 tenant 단위로 네임스페이스.
 * 충만 레거시(enforce=false): 기존 글로벌 키 유지.
 */
export type TenantSettingsScope = {
  enforce: boolean
  tenantId: string
}

export function tenantScopedSettingsKey(baseKey: string, scope: TenantSettingsScope): string {
  const key = String(baseKey || '').trim()
  if (!key) return key
  if (!scope.enforce || !scope.tenantId) return key
  return `${key}:${scope.tenantId}`
}

/** tenant 키 + 레거시 글로벌 키(폴백) 목록 — 조회용 */
export function tenantScopedSettingsKeys(baseKey: string, scope: TenantSettingsScope): string[] {
  const scoped = tenantScopedSettingsKey(baseKey, scope)
  if (scoped === baseKey) return [baseKey]
  return [scoped, baseKey]
}
