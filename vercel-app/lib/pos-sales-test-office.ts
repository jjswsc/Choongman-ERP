/**
 * 본사·오피스 POS 매출 = 테스트·시연용.
 * - **매출 관리** 집계·필터 목록에서 제외 (`excludePosSalesTestOfficeRows`).
 * - **본사 손익** 매출은 물류 출고(stock_logs), POS 아님.
 * - POS 단말·getPosTodaySales(해당 매장 조회)는 테스트 매장도 조회 가능.
 */
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'

export function isPosSalesTestOfficeStoreCode(storeCode: unknown): boolean {
  return isHeadOfficeLikeStoreName(String(storeCode ?? ''))
}

/** 매출 관리·가맹 POS 손익 집계용 — 본사 테스트 POS 주문 제외 */
export function excludePosSalesTestOfficeRows<T extends { store_code?: string | null }>(
  rows: T[]
): T[] {
  return rows.filter((r) => !isPosSalesTestOfficeStoreCode(r.store_code))
}

export function filterPosSalesStoreOptionsForManagement(storeCodes: string[]): string[] {
  return storeCodes.filter((s) => {
    const t = String(s || '').trim()
    return t && !isPosSalesTestOfficeStoreCode(t)
  })
}
