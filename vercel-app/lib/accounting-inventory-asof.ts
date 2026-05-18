import { addBangkokCalendarDays, getBangkokEndOfDayUtcIso } from '@/lib/bangkok-time'

/** 기초재고: 월초 전일 말, 기말재고: 해당 월 말(방콕) — 재고 현황(getAppData)과 동일 */
export function resolveInventoryAsOfUtcIso(cutoffDate: string, isBefore: boolean): string {
  if (isBefore) {
    return getBangkokEndOfDayUtcIso(addBangkokCalendarDays(cutoffDate, -1))
  }
  return getBangkokEndOfDayUtcIso(cutoffDate)
}
