import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  getPosBusinessDateStrFromConfig,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'

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

/** @deprecated POS 매출 분개는 `resolvePosBusinessAccountingDate` 사용 */
export function resolveBangkokAccountingDate(createdAtIso?: string): string {
  const iso = String(createdAtIso || '').trim()
  if (!iso) return getBangkokTodayDateString()
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return getBangkokTodayDateString()
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** POS 영업일 라벨 — 매장 영업시간 설정과 결산·매출 집계와 동일 */
export function resolvePosBusinessAccountingDate(
  createdAtIso: string | undefined,
  hours: PosBusinessHoursConfig
): string {
  const iso = String(createdAtIso || '').trim()
  const base = iso ? new Date(iso) : new Date()
  if (Number.isNaN(base.getTime())) return getPosBusinessDateStrFromConfig(new Date(), hours)
  return getPosBusinessDateStrFromConfig(base, hours)
}

export async function resolvePosBusinessAccountingDateForStore(
  createdAtIso: string | undefined,
  storeCode: string
): Promise<string> {
  const hours = await loadPosBusinessHoursForServer(storeCode)
  return resolvePosBusinessAccountingDate(createdAtIso, hours)
}
