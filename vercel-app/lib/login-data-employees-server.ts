import 'server-only'

import { supabaseSelectEmployeesForLoginList } from '@/lib/employees-compat'
import { supabaseRpc } from '@/lib/supabase-server'

export type LoginEmployeeRow = {
  company?: string | null
  store?: string
  name?: string
  nick?: string
  job?: string
  role?: string
  resign_date?: string | null
}

function parseLoginEmployeeRpcPayload(raw: unknown): LoginEmployeeRow[] | null {
  if (Array.isArray(raw)) return raw as LoginEmployeeRow[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed as LoginEmployeeRow[]
    } catch {
      /* invalid json */
    }
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: LoginEmployeeRow[] }).data
  }
  return null
}

/** RPC(get_employees_for_login) 우선 — 미배포·오류 시 REST fallback */
export async function fetchEmployeesForLoginList(): Promise<LoginEmployeeRow[]> {
  try {
    const raw = await supabaseRpc<unknown>('get_employees_for_login', {})
    const parsed = parseLoginEmployeeRpcPayload(raw)
    if (parsed) return parsed
  } catch {
    /* RPC 미배포 또는 일시 오류 — REST */
  }

  const rows = (await supabaseSelectEmployeesForLoginList()) as LoginEmployeeRow[] | null
  return Array.isArray(rows) ? rows : []
}
