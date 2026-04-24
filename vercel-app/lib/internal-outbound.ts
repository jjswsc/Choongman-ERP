const OFFICE_STORE_KEYWORDS = [
  "본사",
  "오피스",
  "본점",
  "office",
  "head office",
  "hq",
]

/**
 * 본사(오피스) 계열 매장명인지 판별한다.
 * - 출고 청구/미수금 제외(내부 제조/내부 사용) 규칙에서 공통 사용.
 */
export function isHeadOfficeLikeStoreName(storeName: string): boolean {
  const raw = String(storeName || "").trim()
  if (!raw) return false
  const normalized = raw.toLowerCase()
  return OFFICE_STORE_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

/**
 * 강제출고 행이 본사→본사(내부 사용)인지 판별한다.
 */
export function isInternalForceOutboundTarget(storeName: string): boolean {
  return isHeadOfficeLikeStoreName(storeName)
}
