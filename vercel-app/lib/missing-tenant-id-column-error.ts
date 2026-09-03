/**
 * PostgREST/Postgres: tenant_id 컬럼이 없을 때만 true.
 * PGRST204·42703 단독은 다른 컬럼 누락에도 나와서 쓰면 안 된다.
 */
export function isMissingTenantIdColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  if (!msg || !/tenant_id/i.test(msg)) return false
  return /42703|PGRST204|does not exist|could not find/i.test(msg)
}
