import { getBangkokDateTimeString, isBangkokDateTimeBefore, normalizeBangkokDateTimeCompareKey } from '@/lib/bangkok-time'
import { MEMBER_POINT_RETENTION_YEARS } from '@/lib/member-point-expiry-policy'
import { normalizeMemberPoints, roundMemberPointsEarn } from '@/lib/member-points-math'

export type MemberPointLedgerEntry = {
  id?: number
  kind?: string | null
  points?: number | null
  created_at?: string | null
}

type EarnLot = {
  originalPoints: number
  remaining: number
  createdAt: string
}

function isPositiveCredit(kind: string, points: number): boolean {
  return points > 0 && (kind === 'earn' || kind === 'adjust')
}

function isNegativeDebit(kind: string, points: number): boolean {
  if (points >= 0) return false
  return kind === 'use' || kind === 'adjust' || kind === 'reverse' || kind === 'expire'
}

export function getMemberPointRetentionCutoffIso(
  now = new Date(),
  years = MEMBER_POINT_RETENTION_YEARS
): string {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }))
  local.setFullYear(local.getFullYear() - years)
  return getBangkokDateTimeString(local)
}

/** 원장 재생(FIFO) 후 2년 롤링 기준 잔액·등급 포인트·소멸 대상 계산 */
export function computeMemberPointExpiryState(
  ledger: MemberPointLedgerEntry[],
  cutoffIso: string
): { tierPoints: number; pointBalance: number; expirePoints: number } {
  const sorted = [...ledger]
    .filter((row) => String(row.kind || '').trim().toLowerCase() !== 'expire')
    .sort((a, b) => {
      const ka = normalizeBangkokDateTimeCompareKey(a.created_at)
      const kb = normalizeBangkokDateTimeCompareKey(b.created_at)
      if (ka !== kb) return ka < kb ? -1 : 1
      return Number(a.id || 0) - Number(b.id || 0)
    })

  const lots: EarnLot[] = []

  for (const row of sorted) {
    const kind = String(row.kind || '').trim().toLowerCase()
    const points = normalizeMemberPoints(row.points)
    if (!points) continue

    if (isPositiveCredit(kind, points)) {
      lots.push({
        originalPoints: points,
        remaining: points,
        createdAt: normalizeBangkokDateTimeCompareKey(row.created_at) || cutoffIso,
      })
      continue
    }

    if (isNegativeDebit(kind, points)) {
      let need = Math.abs(points)
      for (const lot of lots) {
        if (need <= 0) break
        if (lot.remaining <= 0) continue
        const take = Math.min(lot.remaining, need)
        lot.remaining -= take
        need -= take
      }
    }
  }

  let tierPoints = 0
  let pointBalance = 0
  let expirePoints = 0

  for (const lot of lots) {
    const inWindow = !isBangkokDateTimeBefore(lot.createdAt, cutoffIso)
    if (inWindow) {
      tierPoints += lot.originalPoints
      pointBalance += lot.remaining
    } else if (lot.remaining > 0) {
      expirePoints += lot.remaining
    }
  }

  return {
    tierPoints: roundMemberPointsEarn(tierPoints),
    pointBalance: roundMemberPointsEarn(pointBalance),
    expirePoints: roundMemberPointsEarn(expirePoints),
  }
}
