/**
 * @deprecated SaaS 파일럿 개념 폐지 — SaaS는 tenantId 있을 때 바로 enforce.
 * - SaaS enforce: `saas-enforce.ts`
 * - 충만 🔴 오피스 검증: `chungman-office-test-config.ts`
 */
export { shouldEnforceSaasForAuth } from "./saas-enforce"
export {
  getOfficeTestStoreCodes as getSaasPilotStoreCodes,
  isOfficeTestStore,
} from "./chungman-office-test-config"

/** @deprecated SaaS 파일럿 tenant 불사용 */
export function getSaasPilotTenantId(): string | undefined {
  return undefined
}

/** @deprecated */
export function isSaasPilotTenant(_tenantId: string | undefined | null): boolean {
  return false
}
