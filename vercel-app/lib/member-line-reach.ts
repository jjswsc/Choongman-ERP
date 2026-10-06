/** 회원 목록 — LINE 푸시 수신 가능 여부 (active LINE identity) */

export type MemberLineReach = 'all' | 'reachable' | 'unreachable'

export function parseMemberLineReach(raw: unknown): MemberLineReach {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'reachable' || value === 'linked') return 'reachable'
  if (value === 'unreachable' || value === 'unlinked') return 'unreachable'
  return 'all'
}

/** provider=line, status=active, user id가 있으면 메시지를 보낼 수 있다. */
export function isActiveLineProviderIdentity(
  row?: { provider_user_id?: string | null; status?: string | null } | null
): boolean {
  if (!row) return false
  const userId = String(row.provider_user_id || '').trim()
  if (!userId) return false
  return String(row.status || 'active').trim().toLowerCase() === 'active'
}

export type MemberLineIdentityRankRow = {
  id?: number | null
  provider_user_id?: string | null
  status?: string | null
  last_seen_at?: string | null
}

/**
 * 푸시 대상 정렬. 음수면 a가 앞.
 * active 우선 → last_seen_at 최신 → id가 큰 행.
 */
export function compareMemberLineIdentityRank(
  a: MemberLineIdentityRankRow,
  b: MemberLineIdentityRankRow
): number {
  const aActive = isActiveLineProviderIdentity(a) ? 1 : 0
  const bActive = isActiveLineProviderIdentity(b) ? 1 : 0
  if (aActive !== bActive) return bActive - aActive
  const aSeen = String(a.last_seen_at || '')
  const bSeen = String(b.last_seen_at || '')
  if (aSeen !== bSeen) return aSeen < bSeen ? 1 : -1
  return Number(b.id || 0) - Number(a.id || 0)
}

export function rankMemberLineIdentities<T extends MemberLineIdentityRankRow>(rows: T[]): T[] {
  return (rows || [])
    .filter((row) => String(row.provider_user_id || '').trim())
    .slice()
    .sort(compareMemberLineIdentityRank)
}
