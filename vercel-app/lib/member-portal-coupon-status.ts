import { getBangkokDateTimeString, toBangkokWallClockCompareKey } from '@/lib/bangkok-time'

function parseExpiryComparable(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  // 날짜만 있으면 그날 끝까지 유효
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 23:59:59`
  return toBangkokWallClockCompareKey(text)
}

/** 발급 시각이 주문(사용) 시각 이전이어야 같은 쿠폰코드로 매칭 가능 */
export function couponIssueEligibleForOrderTime(issuedAt?: string | null, orderPaidAt?: string | null): boolean {
  const paid = toBangkokWallClockCompareKey(String(orderPaidAt || ''))
  if (!paid) return false
  const issued = toBangkokWallClockCompareKey(String(issuedAt || ''))
  // 발급시각 없으면 false-positive로 단정하지 않음(used → issued 되돌림 방지)
  if (!issued) return true
  return issued <= paid
}

export function isMemberCouponIssueExpired(expiresAt?: string | null, validTo?: string | null): boolean {
  const cutoff = parseExpiryComparable(String(expiresAt || validTo || ''))
  if (!cutoff) return false
  return cutoff < getBangkokDateTimeString()
}

export function resolveMemberPortalCouponStatus(
  row: {
    id?: number
    status?: string
    expiresAt?: string
    validTo?: string
    orderId?: number | null
    usedAt?: string
  },
  redeemedIssueIds?: ReadonlySet<number>
): string {
  const base = String(row.status || 'issued').trim().toLowerCase()
  if (base !== 'issued') return base

  const issueId = Number(row.id || 0)
  if (issueId > 0 && redeemedIssueIds?.has(issueId)) return 'used'
  if (Number(row.orderId || 0) > 0 && String(row.usedAt || '').trim()) return 'used'
  if (isMemberCouponIssueExpired(row.expiresAt, row.validTo)) return 'expired'
  return 'issued'
}

export function isMemberPortalCouponReady(status: string): boolean {
  return String(status || '').trim().toLowerCase() === 'issued'
}
