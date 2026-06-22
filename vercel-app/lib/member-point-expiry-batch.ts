/** 포인트·등급 포인트가 있는 회원 — 배치 조회 PostgREST 필터 */
export function buildMembersWithPointsBatchFilter(afterMemberId: number): string {
  const base = 'or=(point_balance.gt.0,tier_points.gt.0)'
  const afterId = Math.max(0, Math.trunc(Number(afterMemberId || 0)))
  if (afterId > 0) return `and=(${base},id.gt.${afterId})`
  return base
}

export const MEMBER_POINT_EXPIRY_BATCH_PAGE_SIZE = 200
export const MEMBER_POINT_EXPIRY_BATCH_DEFAULT_MAX = 10_000
