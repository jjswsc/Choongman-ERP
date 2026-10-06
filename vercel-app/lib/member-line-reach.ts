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
