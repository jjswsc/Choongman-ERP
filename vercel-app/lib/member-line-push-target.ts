import { getLineUserProfile, pushLineMessages, type LinePushMessage } from '@/lib/line-messaging-server'
import { isActiveLineProviderIdentity, rankMemberLineIdentities } from '@/lib/member-line-reach'
import { setLineIdentityStatus } from '@/lib/members-server-core'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type MemberLinePushCandidate = {
  id: number
  userId: string
  status: string
  lastSeenAt: string
  active: boolean
}

type IdentityRow = {
  id?: number | null
  provider_user_id?: string | null
  status?: string | null
  last_seen_at?: string | null
}

/** LINE이 친구 아님·무효 user id에 주는 푸시 400. 메시지 형식 오류 400과는 구분한다. */
export function isLineUserUnreachablePush(message?: string): boolean {
  const text = String(message || '')
  return /line_push_400:/i.test(text) && /failed to send messages/i.test(text)
}

function lineProfileHttpStatus(error: unknown): number {
  const msg = error instanceof Error ? error.message : String(error || '')
  const matched = msg.match(/LINE profile 조회 실패\((\d+)\)/)
  return matched ? Number(matched[1]) : 0
}

export async function listMemberLinePushCandidates(memberId: number): Promise<MemberLinePushCandidate[]> {
  const id = Number(memberId || 0)
  if (!id) return []
  const rows = (await supabaseSelectFilter(
    'member_identities',
    `provider=eq.line&member_id=eq.${id}`,
    { limit: 20, select: 'id,provider_user_id,status,last_seen_at' }
  )) as IdentityRow[]
  return rankMemberLineIdentities(rows || []).map((row) => ({
    id: Number(row.id || 0),
    userId: String(row.provider_user_id || '').trim(),
    status: String(row.status || '').trim(),
    lastSeenAt: String(row.last_seen_at || '').trim(),
    active: isActiveLineProviderIdentity(row),
  }))
}

/** 화면 표시용. 프로필 API는 호출하지 않고 정렬 1순위만 반환한다. */
export async function resolvePreferredMemberLineUserId(memberId: number): Promise<string> {
  const candidates = await listMemberLinePushCandidates(memberId)
  const active = candidates.filter((row) => row.active)
  const pool = active.length ? active : candidates
  return pool[0]?.userId || ''
}

type ProfileProbe = 'ok' | 'missing' | 'unknown'

async function probeLineProfile(userId: string): Promise<ProfileProbe> {
  try {
    await getLineUserProfile(userId)
    return 'ok'
  } catch (error) {
    if (lineProfileHttpStatus(error) === 404) return 'missing'
    return 'unknown'
  }
}

/**
 * 후보가 하나여도 Get profile이 200인 ID만 보낸다.
 * 200이 아니면 그 ID로는 푸시하지 않는다.
 * 404이고 다음 후보가 있으면 그 ID만 inactive. 마지막 ID는 친구 재추가 후 같은 ID로 복구되므로 끄지 않는다.
 */
async function pushPool(
  pool: MemberLinePushCandidate[],
  messages: LinePushMessage[]
): Promise<{ ok: boolean; message?: string; userId?: string }> {
  if (!pool.length) return { ok: false, message: 'no_line_identity' }
  let sawUnreachableProfile = false

  for (let i = 0; i < pool.length; i += 1) {
    const candidate = pool[i]
    const hasAnother = i < pool.length - 1
    const probe = await probeLineProfile(candidate.userId)
    if (probe !== 'ok') {
      sawUnreachableProfile = true
      if (probe === 'missing' && hasAnother) {
        await setLineIdentityStatus(candidate.userId, 'inactive')
      }
      continue
    }

    const result = await pushLineMessages({ userId: candidate.userId, messages })
    if (result.ok) return { ok: true, userId: candidate.userId }
    if (isLineUserUnreachablePush(result.message) && hasAnother) {
      await setLineIdentityStatus(candidate.userId, 'inactive')
      continue
    }
    return { ok: false, message: result.message || 'push_failed', userId: candidate.userId }
  }

  if (sawUnreachableProfile) return { ok: false, message: 'line_profile_not_reachable' }
  return { ok: false, message: 'push_failed' }
}

/** 회원 LINE 카드·텍스트. 프로필 200인 User ID만 보낸다. */
export async function pushLineMessagesToMember(params: {
  memberId: number
  messages: LinePushMessage[]
}): Promise<{ ok: boolean; message?: string; userId?: string }> {
  const candidates = await listMemberLinePushCandidates(params.memberId)
  const active = candidates.filter((row) => row.active)
  const pool = active.length ? active : candidates
  return pushPool(pool, params.messages)
}
