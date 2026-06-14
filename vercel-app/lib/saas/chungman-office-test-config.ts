/**
 * 충만(레거시) 🔴 위험 작업 — 오피스 매장 사전 검증용
 *
 * SaaS 기능은 별도 파일럿 없이 바로 적용(tenantId 있을 때만 enforce).
 * 아래 env는 docs/saas-deferred-chungman-risk.md 🔴 항목을
 * **오피스 매장에서만** 시험 적용할 때 사용.
 *
 * CM_OFFICE_TEST_STORE_CODES — 콤마/세미콜론 구분 매장 코드
 */
export function getOfficeTestStoreCodes(): string[] {
  const raw = String(
    process.env.CM_OFFICE_TEST_STORE_CODES ||
      process.env.CM_SAAS_PILOT_STORE_CODES ||
      ""
  ).trim()
  if (!raw) return []
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isOfficeTestStore(storeCode: string | undefined | null): boolean {
  const code = String(storeCode || "").trim()
  if (!code) return false
  const codes = getOfficeTestStoreCodes()
  if (codes.length === 0) return false
  const norm = (s: string) => s.toLowerCase().replace(/^cm\s+/, "").trim()
  const n = norm(code)
  return codes.some((c) => norm(c) === n || c.trim() === code)
}

/** 🔴 위험 기능을 오피스 매장에만 켰는지 (feature flag 패턴용) */
export function isChungmanRiskFeatureEnabledForStore(
  storeCode: string | undefined | null,
  opts?: { requireOfficeTestList?: boolean }
): boolean {
  const codes = getOfficeTestStoreCodes()
  if (opts?.requireOfficeTestList !== false && codes.length === 0) return false
  return isOfficeTestStore(storeCode)
}
