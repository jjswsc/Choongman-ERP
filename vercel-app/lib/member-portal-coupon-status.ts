import { getBangkokDateTimeString } from '@/lib/bangkok-time'

function parseBangkokComparable(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 23:59:59`
  return text.replace('T', ' ').slice(0, 19)
}

export function isMemberCouponIssueExpired(expiresAt?: string | null, validTo?: string | null): boolean {
  const cutoff = parseBangkokComparable(String(expiresAt || validTo || ''))
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
