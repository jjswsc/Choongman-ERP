import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  HR_POLICY_LIST_COLS,
  HR_POLICY_LIST_COLS_LEGACY,
  HR_POLICY_LIST_COLS_MINIMAL,
} from '@/lib/postgrest-narrow-select'

const LIST_SELECT_FALLBACKS = [
  HR_POLICY_LIST_COLS,
  HR_POLICY_LIST_COLS_LEGACY,
  HR_POLICY_LIST_COLS_MINIMAL,
] as const

export function isMissingHrPolicyListColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  if (!msg) return false
  if (/tenant_id/i.test(msg)) return false
  if (!/42703|PGRST204|does not exist|could not find/i.test(msg)) return false
  return /target_permission_group|content_version|effective_at|updated_at|attachments|sender|is_active|column/i.test(
    msg
  )
}

/**
 * hr_policies 목록 조회. 구 DB에 선택 컬럼이 없으면 공지와 같이 축소 select로 재시도.
 */
export async function selectHrPoliciesList(
  filter: string,
  opts: { order?: string; limit: number }
): Promise<Record<string, unknown>[]> {
  let lastErr: unknown
  for (const select of LIST_SELECT_FALLBACKS) {
    try {
      return (await supabaseSelectFilter('hr_policies', filter, {
        order: opts.order,
        limit: opts.limit,
        select,
      })) as Record<string, unknown>[]
    } catch (e) {
      lastErr = e
      if (!isMissingHrPolicyListColumnError(e)) throw e
    }
  }
  throw lastErr
}
