import { isOfficeRole } from "@/lib/permissions"

/**
 * 손익 수동값(매출·기초재고) 공유 행의 store_key.
 * 본사 권한: 화면의 매장 필터 그대로(전체·본사·지점명).
 * 그 외: 로그인 매장만 (다른 매장 키로 읽기/쓰기 불가).
 */
export function resolveIncomeStatementOverrideStoreKey(
  storeFilter: string,
  userRole: string,
  userStore: string
): string {
  if (isOfficeRole(userRole)) {
    const s = String(storeFilter || "All").trim()
    return s || "All"
  }
  const u = String(userStore || "").trim()
  return u || "All"
}
