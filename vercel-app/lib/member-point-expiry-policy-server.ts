import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import {
  DEFAULT_MEMBER_POINT_RETENTION_YEARS,
  MEMBER_POINT_RETENTION_YEARS,
  MEMBER_POINT_RETENTION_YEARS_KEY,
  parseMemberPointRetentionYears,
} from '@/lib/member-point-expiry-policy'

export { MEMBER_POINT_RETENTION_YEARS_KEY }

export async function loadMemberPointRetentionYears(): Promise<number> {
  try {
    const rows = (await supabaseSelectFilter('system_settings', `key=eq.${MEMBER_POINT_RETENTION_YEARS_KEY}`, {
      limit: 1,
      select: 'value_json',
    })) as { value_json?: unknown }[]
    const raw = rows?.[0]?.value_json
    if (raw == null) return DEFAULT_MEMBER_POINT_RETENTION_YEARS
    if (typeof raw === 'number') return parseMemberPointRetentionYears(raw)
    if (typeof raw === 'string') return parseMemberPointRetentionYears(raw)
    return parseMemberPointRetentionYears(raw)
  } catch {
    return DEFAULT_MEMBER_POINT_RETENTION_YEARS
  }
}

export async function saveMemberPointRetentionYears(raw: unknown): Promise<number> {
  const years = parseMemberPointRetentionYears(raw)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key: MEMBER_POINT_RETENTION_YEARS_KEY,
        value_json: years,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
  return years
}

/** 동기 상수 폴백(테스트·기본값). 런타임은 loadMemberPointRetentionYears 사용 */
export const MEMBER_POINT_RETENTION_YEARS_DEFAULT = MEMBER_POINT_RETENTION_YEARS
