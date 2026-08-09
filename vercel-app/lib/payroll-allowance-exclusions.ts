import 'server-only'

import { supabaseSelectFilter } from '@/lib/supabase-server'

export type PayrollAllowanceExclusionRow = {
  payroll_month: string
  employee_id?: number | null
  store: string
  name: string
  reason?: string
  notice_ids?: unknown
  missed_count?: number
  period_start?: string | null
  period_end?: string | null
  created_by?: string | null
}

const empKey = (store: string, name: string) => `${String(store).trim()}|${String(name).trim()}`

/** 급여월(YYYY-MM) 제외 대상 → store|name Set */
export async function loadAllowanceExclusionKeysForMonth(
  payrollMonth: string
): Promise<Set<string>> {
  const month = String(payrollMonth || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return new Set()
  try {
    const rows = (await supabaseSelectFilter(
      'payroll_allowance_exclusions',
      `payroll_month=eq.${encodeURIComponent(month)}`,
      { limit: 5000, select: 'store,name' }
    )) as { store?: string; name?: string }[]
    const set = new Set<string>()
    for (const r of rows || []) {
      const s = String(r.store || '').trim()
      const n = String(r.name || '').trim()
      if (s && n) set.add(empKey(s, n))
    }
    return set
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/does not exist|relation|PGRST/i.test(msg)) {
      console.warn('payroll_allowance_exclusions missing — skip allowance exclusion')
      return new Set()
    }
    throw e
  }
}

export function hasAllowanceExclusion(
  keys: Set<string>,
  store: string,
  name: string
): boolean {
  return keys.has(empKey(store, name))
}
