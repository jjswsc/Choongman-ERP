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
  return (
    kind === 'use' || kind === 'redeem' || kind === 'adjust' || kind === 'reverse' || kind === 'expire'
  )
}

/** LINE CRM 이월 포인트 원장 메모 — 회원 잔액을 원장 재생으로 재산정하므로 이월분도 원장 행이 있어야 한다 */
export const LINE_OPENING_CREDIT_NOTE = 'line_opening_balance'
export const LINE_OPENING_USED_NOTE = 'line_opening_used'

/** 이 값을 넘는 LINE 이월은 엑셀 오입력 가능성이 커 자동 반영하지 않는다 (관리자 수동 확인) */
export const LINE_OPENING_MAX_AUTO_POINTS = 5000

const LINE_CARRYOVER_NOTE_PREFIXES = ['line_opening', 'LINE CRM import']

export function isLineCarryoverLedgerNote(note: unknown): boolean {
  const n = String(note ?? '').trim()
  return LINE_CARRYOVER_NOTE_PREFIXES.some((prefix) => n.startsWith(prefix))
}

/**
 * members.line_* 값과 원장의 LINE 이월 행을 맞추기 위해 추가할 원장 행.
 * 등급 누적분(lineTierPoints)을 +로 넣고, LINE에서 이미 쓴 만큼(tier − current)을 −로 넣어
 * 재생 결과가 잔액 = lineCurrentPoints, 등급 포인트 = lineTierPoints 가 되게 한다.
 */
export function planLineOpeningLedgerRows(params: {
  lineCurrentPoints: unknown
  lineTierPoints: unknown
  ledger: Array<Pick<MemberPointLedgerEntry, 'points'> & { note?: string | null }>
}): Array<{ points: number; note: string }> {
  const current = roundMemberPointsEarn(params.lineCurrentPoints)
  const tierTarget = Math.max(current, roundMemberPointsEarn(params.lineTierPoints))
  if (tierTarget <= 0 || tierTarget > LINE_OPENING_MAX_AUTO_POINTS) return []

  let credited = 0
  let net = 0
  for (const row of params.ledger) {
    if (!isLineCarryoverLedgerNote(row.note)) continue
    const p = normalizeMemberPoints(row.points)
    net += p
    if (p > 0) credited += p
  }

  const rows: Array<{ points: number; note: string }> = []
  const addCredit = normalizeMemberPoints(tierTarget - credited)
  if (addCredit > 0) {
    rows.push({ points: addCredit, note: LINE_OPENING_CREDIT_NOTE })
    net += addCredit
  }
  const over = normalizeMemberPoints(net - current)
  if (over > 0) rows.push({ points: -over, note: LINE_OPENING_USED_NOTE })
  else if (over < 0) rows.push({ points: -over, note: LINE_OPENING_CREDIT_NOTE })
  return rows
}

/** 이월 행 시각 — LINE 내보내기 시점(POS 적립보다 앞) 우선, 소멸 기준일보다 과거면 기준일로 */
export function resolveLineOpeningCreatedAt(params: {
  lineExportedAt?: string | null
  earliestLedgerAt?: string | null
  cutoffIso: string
  now: string
}): string {
  const picked =
    normalizeBangkokDateTimeCompareKey(params.lineExportedAt) ||
    normalizeBangkokDateTimeCompareKey(params.earliestLedgerAt) ||
    params.now
  return isBangkokDateTimeBefore(picked, params.cutoffIso) ? params.cutoffIso : picked
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
