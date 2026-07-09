import 'server-only'

import {
  DEFAULT_MEMBER_TIER_DISCOUNT_POLICY,
  MEMBER_TIER_DISCOUNT_POLICY_KEY,
  normalizeMemberTierDiscountPolicy,
  type MemberTierDiscountPolicy,
} from '@/lib/member-tier-discount-policy'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export async function loadMemberTierDiscountPolicy(): Promise<MemberTierDiscountPolicy> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_TIER_DISCOUNT_POLICY_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
    if (raw == null) return { ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY }
    if (typeof raw === 'string') {
      try {
        return normalizeMemberTierDiscountPolicy(JSON.parse(raw))
      } catch {
        return { ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY }
      }
    }
    return normalizeMemberTierDiscountPolicy(raw)
  } catch {
    return { ...DEFAULT_MEMBER_TIER_DISCOUNT_POLICY }
  }
}

export async function saveMemberTierDiscountPolicy(
  raw: unknown
): Promise<MemberTierDiscountPolicy> {
  const next = normalizeMemberTierDiscountPolicy(raw)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: MEMBER_TIER_DISCOUNT_POLICY_KEY,
        value_json: next,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  return next
}
