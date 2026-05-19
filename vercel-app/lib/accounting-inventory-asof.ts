import { addBangkokCalendarDays, getBangkokEndOfDayUtcIso } from '@/lib/bangkok-time'

/** 재고 현황(stock-table)과 동일: 원가 없으면 판매가로 평가 */
export function resolveStockValuationUnitCost(
  cost: number | null | undefined,
  price: number | null | undefined
): number {
  return Number(cost ?? price ?? 0)
}

/** 기초재고: 월초 전일 말, 기말재고: 해당 월 말(방콕) — 재고 현황(getAppData)과 동일 */
export function resolveInventoryAsOfUtcIso(cutoffDate: string, isBefore: boolean): string {
  if (isBefore) {
    return getBangkokEndOfDayUtcIso(addBangkokCalendarDays(cutoffDate, -1))
  }
  return getBangkokEndOfDayUtcIso(cutoffDate)
}
