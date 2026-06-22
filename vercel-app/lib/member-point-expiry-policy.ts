/** 적립 포인트 보존 기간(년) 기본값. 관리자 화면·system_settings 로 변경 가능 */
export const DEFAULT_MEMBER_POINT_RETENTION_YEARS = 2

/** @deprecated loadMemberPointRetentionYears() 사용. 하위 호환 상수 */
export const MEMBER_POINT_RETENTION_YEARS = DEFAULT_MEMBER_POINT_RETENTION_YEARS

export const MEMBER_POINT_RETENTION_YEARS_KEY = 'member_point_retention_years'

export function parseMemberPointRetentionYears(raw: unknown): number {
  const n = Math.trunc(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_MEMBER_POINT_RETENTION_YEARS
  return Math.max(1, Math.min(10, n))
}
