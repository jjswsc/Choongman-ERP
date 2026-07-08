/** 회원 포인트 잔액·적립·사용 — 소수 2자리 (1P = 1바트 사용 규칙과 동일 정밀도) */
export const MEMBER_POINT_DECIMALS = 2

const MEMBER_POINT_FACTOR = 10 ** MEMBER_POINT_DECIMALS

export function normalizeMemberPoints(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * MEMBER_POINT_FACTOR) / MEMBER_POINT_FACTOR
}

/** 적립·잔액 표시용 — 음수는 0 */
export function roundMemberPointsEarn(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * MEMBER_POINT_FACTOR) / MEMBER_POINT_FACTOR
}

export function formatMemberPointsDisplay(raw: unknown): string {
  const v = normalizeMemberPoints(raw)
  const isWhole = Math.abs(v - Math.round(v)) < 1e-9
  if (isWhole) return Math.round(v).toLocaleString('en-US')
  return v.toLocaleString('en-US', {
    minimumFractionDigits: MEMBER_POINT_DECIMALS,
    maximumFractionDigits: MEMBER_POINT_DECIMALS,
  })
}
