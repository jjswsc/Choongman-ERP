import { addBangkokCalendarDays, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { toHtmlDateInputValue } from '@/lib/company-hybrid-documents'

export const COMPANY_HYBRID_DOC_EXPIRY_SOON_DAYS = 30

export type CompanyHybridDocExpiryStatus = 'none' | 'valid' | 'expiring_soon' | 'expired'

export type CompanyHybridDocExpiryFilter = 'all' | 'expiring_soon' | 'expired' | 'no_expiry'

/** valid_to 기준 만료 상태 (방콕 달력) */
export function getCompanyHybridDocExpiryStatus(
  validTo: string | null | undefined,
  todayYmd: string = getBangkokTodayDateString()
): CompanyHybridDocExpiryStatus {
  const ymd = toHtmlDateInputValue(validTo)
  if (!ymd) return 'none'
  if (ymd < todayYmd) return 'expired'
  const soonEnd = addBangkokCalendarDays(todayYmd, COMPANY_HYBRID_DOC_EXPIRY_SOON_DAYS)
  if (ymd <= soonEnd) return 'expiring_soon'
  return 'valid'
}

export function matchesCompanyHybridDocExpiryFilter(
  validTo: string | null | undefined,
  filter: CompanyHybridDocExpiryFilter,
  todayYmd: string = getBangkokTodayDateString()
): boolean {
  if (filter === 'all') return true
  const status = getCompanyHybridDocExpiryStatus(validTo, todayYmd)
  if (filter === 'no_expiry') return status === 'none'
  if (filter === 'expired') return status === 'expired'
  if (filter === 'expiring_soon') return status === 'expiring_soon'
  return true
}

/** API valid_to 필터용 YYYY-MM-DD 경계 */
export function companyHybridDocExpiryFilterBounds(todayYmd: string = getBangkokTodayDateString()): {
  today: string
  soonEnd: string
} {
  return {
    today: todayYmd,
    soonEnd: addBangkokCalendarDays(todayYmd, COMPANY_HYBRID_DOC_EXPIRY_SOON_DAYS),
  }
}
