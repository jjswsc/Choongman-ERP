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
 * active가 2개 이상일 때만 프로필로 수신 가능 ID를 고른다.
 * 404는 inactive. 5xx·네트워크는 끄지 않고 다음을 본다. 전부 불통이면 null.
 * 프로필이 둘 다 200이면 최신 last_seen(첫 200)만 고르고 나머지는 유지한다.
 */
async function pickVerifiedActiveCandidate(
  active: MemberLinePushCandidate[]
): Promise<MemberLinePushCandidate | null> {
  let fallback: MemberLinePushCandidate | null = null
  for (const candidate of active) {
    const probe = await probeLineProfile(candidate.userId)
    if (probe === 'ok') return candidate
    if (probe === 'missing') {
      await setLineIdentityStatus(candidate.userId, 'inactive')
      continue
    }
    if (!fallback) fallback = candidate
  }
  return fallback
}

async function pushPool(
  pool: MemberLinePushCandidate[],
  messages: LinePushMessage[]
): Promise<{ ok: boolean; message?: string; userId?: string }> {
  if (!pool.length) return { ok: false, message: 'no_line_identity' }
  let start = 0
  if (pool.length >= 2 && pool.every((row) => row.active)) {
    const picked = await pickVerifiedActiveCandidate(pool)
    if (!picked) return { ok: false, message: 'no_line_identity' }
    start = Math.max(0, pool.findIndex((row) => row.userId === picked.userId))
  }

  for (let i = start; i < pool.length; i += 1) {
    const candidate = pool[i]
    const result = await pushLineMessages({ userId: candidate.userId, messages })
    if (result.ok) return { ok: true, userId: candidate.userId }
    const hasAnother = i < pool.length - 1
    if (isLineUserUnreachablePush(result.message) && hasAnother) {
      await setLineIdentityStatus(candidate.userId, 'inactive')
      continue
    }
    return { ok: false, message: result.message || 'push_failed', userId: candidate.userId }
  }
  return { ok: false, message: 'push_failed' }
}

/** 회원 LINE 카드·텍스트. ID가 하나면 프로필 조회 없이 보낸다. */
export async function pushLineMessagesToMember(params: {
  memberId: number
  messages: LinePushMessage[]
}): Promise<{ ok: boolean; message?: string; userId?: string }> {
  const candidates = await listMemberLinePushCandidates(params.memberId)
  const active = candidates.filter((row) => row.active)
  const pool = active.length ? active : candidates
  return pushPool(pool, params.messages)
}
