/**
 * 본사·오피스 POS 매출 = 테스트·시연용.
 * - **매출 관리** 집계·필터 목록에서 제외 (`excludePosSalesTestOfficeRows`).
 * - **본사 손익** 매출은 물류 출고(stock_logs), POS 아님.
 * - POS 단말·getPosTodaySales(해당 매장 조회)는 테스트 매장도 조회 가능.
 */
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'

/** 매출·실시간 집계에서 제외할 비운영 store_code (정확 일치, 대소문자 무시). HQ 등은 isHeadOfficeLikeStoreName 으로 별도 제외. */
const POS_SALES_EXCLUDED_STORE_CODES = new Set(['test', 'hq'])

/** 로그인·회원앱 등 — test/HQ 샌드박스만 (CM Office 본사 시연용은 유지) */
export function isSandboxStoreCode(storeCode: unknown): boolean {
  const norm = String(storeCode ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return POS_SALES_EXCLUDED_STORE_CODES.has(norm)
}

export function isPosSalesTestOfficeStoreCode(storeCode: unknown): boolean {
  const raw = String(storeCode ?? '').trim()
  if (!raw) return false
  if (isHeadOfficeLikeStoreName(raw)) return true
  const norm = raw.toLowerCase().replace(/\s+/g, ' ')
  return POS_SALES_EXCLUDED_STORE_CODES.has(norm)
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

/**
 * POS 터미널·테이블/주문 스냅샷용 매장 목록.
 * CM Office 등 본사 시연 매장은 포함하고, 매출 집계용 본사 제외(`filterPosSalesStoreOptionsForManagement`)와 분리한다.
 */
export function filterPosTerminalStoreOptions(storeCodes: string[]): string[] {
  return storeCodes.filter((s) => {
    const t = String(s || '').trim()
    if (!t) return false
    const norm = t.toLowerCase().replace(/\s+/g, ' ')
    return !POS_SALES_EXCLUDED_STORE_CODES.has(norm)
  })
}

/**
 * POS 터미널·홈 매장 선택 — CM Office 등 본사 시연 매장 포함.
 * `stores`(매출 집계용)만 캐시된 경우 storeLabels에서 Office 코드를 보강한다.
 */
export function buildPosTerminalStoreCodes(
  catalog: string[],
  storeLabels?: Record<string, string>
): string[] {
  const set = new Set(filterPosTerminalStoreOptions(catalog))
  for (const [code, label] of Object.entries(storeLabels || {})) {
    const c = String(code || '').trim()
    if (!c || isSandboxStoreCode(c)) continue
    if (isHeadOfficeLikeStoreName(c) || isHeadOfficeLikeStoreName(String(label || ''))) {
      set.add(c)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
}
