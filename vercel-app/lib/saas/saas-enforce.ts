/**
 * SaaS enforce 판정 — tenantId 있을 때만 게이트·과금 적용.
 * JWT tenantId 없음(충만) → 항상 false → 레거시와 동일.
 */
export function shouldEnforceSaasForAuth(tenantId: string | undefined | null): boolean {
  return Boolean(String(tenantId || "").trim())
}
