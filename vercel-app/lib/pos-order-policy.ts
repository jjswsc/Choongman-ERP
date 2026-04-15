import { getBangkokTodayDateString } from '@/lib/bangkok-time'

export const POS_COMPLETION_STATUSES = new Set(['completed'])
export const POS_PAID_LIKE_STATUSES = new Set(['paid', 'completed', 'ready'])
export const POS_REVERSAL_STATUSES = new Set(['cancelled', 'refunded'])

export function isPosCompletionStatus(status: string): boolean {
  return POS_COMPLETION_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function isPosPaidLikeStatus(status: string): boolean {
  return POS_PAID_LIKE_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function isPosReversalStatus(status: string): boolean {
  return POS_REVERSAL_STATUSES.has(String(status || '').trim().toLowerCase())
}

export function resolveBangkokAccountingDate(createdAtIso?: string): string {
  const iso = String(createdAtIso || '').trim()
  if (!iso) return getBangkokTodayDateString()
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return getBangkokTodayDateString()
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}
