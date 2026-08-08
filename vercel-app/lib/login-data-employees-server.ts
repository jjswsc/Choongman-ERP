import 'server-only'

import { supabaseSelectEmployeesForLoginList } from '@/lib/employees-compat'
import { supabaseSelectFilter, supabaseRpc } from '@/lib/supabase-server'
import { normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'

export type LoginEmployeeRow = {
  company?: string | null
  store?: string
  name?: string
  nick?: string
  job?: string
  role?: string
  resign_date?: string | null
  employment_status?: string | null
  deleted_at?: string | null
  tenant_id?: string | null
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

function isMissingColumnError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /42703|PGRST204|column|does not exist/i.test(m)
}

async function selectEmployeesByFilter(filter: string): Promise<LoginEmployeeRow[]> {
  const selects = [
    'company,store,name,nick,job,role,resign_date,employment_status,deleted_at,tenant_id',
    'company,store,name,job,role,resign_date,employment_status,deleted_at,tenant_id',
    'company,store,name,nick,job,role,resign_date,tenant_id',
    'company,store,name,job,role,resign_date,tenant_id',
    'company,store,name,nick,job,role,resign_date',
    'company,store,name,job,role,resign_date',
    'store,name,nick,job,role,resign_date,employment_status,deleted_at',
    'store,name,job,role,resign_date,employment_status,deleted_at',
    'store,name,nick,job,role,resign_date',
    'store,name,job,role,resign_date',
  ] as const
  let lastErr: unknown = null
  for (const select of selects) {
    try {
      const rows = (await supabaseSelectFilter('employees', filter, {
        order: 'id.asc',
        select,
        limit: 20000,
      })) as LoginEmployeeRow[] | null
      return Array.isArray(rows) ? rows : []
    } catch (e) {
      lastErr = e
      if (isMissingColumnError(e)) continue
      throw e
    }
  }
  if (lastErr) throw lastErr
  return []
}

function employeeMatchesScope(
  row: LoginEmployeeRow,
  opts: { tenantId?: string; company?: string }
): boolean {
  const tid = normalizeTenantId(opts.tenantId)
  const company = normalizeCompanyName(opts.company)
  const rowTid = normalizeTenantId(row.tenant_id)
  const rowCompany = normalizeCompanyName(row.company)
  if (tid && rowTid && rowTid === tid) return true
  if (company && rowCompany && rowCompany.toLowerCase() === company.toLowerCase()) return true
  return false
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

/** Omni 로그인 — tenant/company 스코프만 (전역 목록 금지) */
export async function fetchEmployeesForLoginListScoped(opts: {
  tenantId?: string
  company?: string
}): Promise<LoginEmployeeRow[]> {
  const tenantId = normalizeTenantId(opts.tenantId)
  const company = normalizeCompanyName(opts.company)
  if (!tenantId && !company) return []

  const byKey = new Map<string, LoginEmployeeRow>()
  const addRows = (rows: LoginEmployeeRow[]) => {
    for (const row of rows) {
      if (!employeeMatchesScope(row, { tenantId, company })) continue
      const key = [
        normalizeCompanyName(row.company).toLowerCase(),
        String(row.store || '').trim().toLowerCase(),
        String(row.name || '').trim().toLowerCase(),
      ].join('\0')
      if (!byKey.has(key)) byKey.set(key, row)
    }
  }

  if (tenantId) {
    try {
      addRows(await selectEmployeesByFilter(`tenant_id=eq.${encodeURIComponent(tenantId)}`))
    } catch (e) {
      if (!isMissingColumnError(e)) throw e
    }
  }
  if (company) {
    try {
      addRows(await selectEmployeesByFilter(`company=eq.${encodeURIComponent(company)}`))
    } catch (e) {
      if (!isMissingColumnError(e)) throw e
    }
  }

  if (byKey.size > 0) return Array.from(byKey.values())

  /** RPC/전량 로드 후 메모리 필터 — 컬럼 필터 실패·대소문자 불일치 대비 */
  const all = await fetchEmployeesForLoginList()
  return all.filter((row) => employeeMatchesScope(row, { tenantId, company }))
}
