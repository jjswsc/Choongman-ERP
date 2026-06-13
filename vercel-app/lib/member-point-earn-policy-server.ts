import 'server-only'

import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY,
  MEMBER_POINT_EARN_BONUS_POLICY_KEY,
  normalizeMemberPointEarnBonusPolicy,
  type MemberPointEarnBonusPolicy,
} from '@/lib/member-point-earn-policy'

export async function loadMemberPointEarnBonusPolicy(): Promise<MemberPointEarnBonusPolicy> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_POINT_EARN_BONUS_POLICY_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
    if (raw == null) return { ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY }
    if (typeof raw === 'string') {
      try {
        return normalizeMemberPointEarnBonusPolicy(JSON.parse(raw))
      } catch {
        return { ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY }
      }
    }
    return normalizeMemberPointEarnBonusPolicy(raw)
  } catch {
    return { ...DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY }
  }
}

export async function saveMemberPointEarnBonusPolicy(
  raw: unknown
): Promise<MemberPointEarnBonusPolicy> {
  const next = normalizeMemberPointEarnBonusPolicy(raw)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: MEMBER_POINT_EARN_BONUS_POLICY_KEY,
        value_json: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  return next
}
