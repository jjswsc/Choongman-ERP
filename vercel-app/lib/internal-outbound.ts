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

/** 본사 창고 코드(S&J) — 가맹 매장명이 아님 */
function isSjHqWarehouseName(storeName: string): boolean {
  const compact = String(storeName || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, "")
  return compact === "s&j"
}

/**
 * 회계발주 미수 채무자로 쓰면 안 되는 이름.
 * 본사·오피스·입고등록·S&J 창고 — 매입이 들어오는 곳이지 가맹 미수 거래처가 아님.
 */
export function isHqWarehouseReceivableStoreName(storeName: string): boolean {
  const raw = String(storeName || "").trim()
  if (!raw) return false
  if (isHeadOfficeLikeStoreName(raw)) return true
  if (isSjHqWarehouseName(raw)) return true
  const compact = raw.toLowerCase().replace(/[\s_\-]+/g, "")
  if (compact === "입고등록" || compact === "입고등록(본사)" || compact === "cmoffice") return true
  // สาขาซื้อเอง = 직접구매 지점(내부 창고 라벨). 가맹 미수 거래처가 아님.
  if (raw.includes("ซื้อเอง") || compact.includes("selfpurchase")) return true
  return false
}
