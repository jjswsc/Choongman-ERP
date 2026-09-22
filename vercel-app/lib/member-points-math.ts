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

/**
 * 주문 적립 후 POS 등급 점수.
 * LINE 등급점수(line_tier_points)는 넣지 않는다. 승급은 max(tier_points, line_tier_points)로 본다.
 * max(tier, line)+적립 으로 저장하면 다음 주문마다 LINE 점수 위에 적립이 또 쌓여 등급이 잠깐 뛴다.
 */
export function addPosTierPoints(currentTierPoints: unknown, earned: unknown): number {
  return roundMemberPointsEarn(roundMemberPointsEarn(currentTierPoints) + roundMemberPointsEarn(earned))
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
