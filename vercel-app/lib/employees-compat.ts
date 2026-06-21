/**
 * 일부 DB에는 employees.company 가 아직 없음(SaaS 마이그레이션 전).
 * select 목록에 company 를 넣으면 PostgREST 42703 → getLoginData 503.
 */
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'

export function isMissingEmployeesCompanyColumn(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /42703|column\s+employees\.company|\.company\s+does not exist|company.*does not exist/i.test(m)
}

const EMPLOYEES_LOGIN_LIST_WITH_COMPANY =
  'company,store,name,nick,job,role,resign_date' as const
const EMPLOYEES_LOGIN_LIST_NO_COMPANY = 'store,name,nick,job,role,resign_date' as const
/** nick 없는 SaaS 최소 스키마용 */
const EMPLOYEES_LOGIN_LIST_WITH_COMPANY_NO_NICK =
  'company,store,name,job,role,resign_date' as const
const EMPLOYEES_LOGIN_LIST_NO_COMPANY_NO_NICK = 'store,name,job,role,resign_date' as const

function isMissingEmployeesNickColumn(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /42703|column\s+employees\.nick|\.nick\s+does not exist|nick.*does not exist/i.test(m)
}

export async function supabaseSelectEmployeesForLoginList(): Promise<unknown> {
  const legacy = isLegacyChoongmanErpSupabase()
  const attempts = legacy
    ? [
        EMPLOYEES_LOGIN_LIST_NO_COMPANY,
        EMPLOYEES_LOGIN_LIST_NO_COMPANY_NO_NICK,
        EMPLOYEES_LOGIN_LIST_WITH_COMPANY,
        EMPLOYEES_LOGIN_LIST_WITH_COMPANY_NO_NICK,
      ]
    : [
        EMPLOYEES_LOGIN_LIST_WITH_COMPANY,
        EMPLOYEES_LOGIN_LIST_WITH_COMPANY_NO_NICK,
        EMPLOYEES_LOGIN_LIST_NO_COMPANY,
        EMPLOYEES_LOGIN_LIST_NO_COMPANY_NO_NICK,
      ]
  let lastErr: unknown = null
  for (const select of attempts) {
    try {
      return await supabaseSelect('employees', { order: 'id.asc', select })
    } catch (e) {
      lastErr = e
      if (isMissingEmployeesCompanyColumn(e) || isMissingEmployeesNickColumn(e)) continue
      throw e
    }
  }
  throw lastErr
}

function loginCheckSelectAttempts(): { select: string }[] {
  const legacy = isLegacyChoongmanErpSupabase()
  if (legacy) {
    return [
      { select: EMPLOYEES_LOGIN_CHECK_NO_COMPANY_OFFICE_PAYROLL },
      { select: EMPLOYEES_LOGIN_CHECK_NO_COMPANY },
      { select: EMPLOYEES_LOGIN_CHECK_WITH_COMPANY_OFFICE_PAYROLL },
      { select: EMPLOYEES_LOGIN_CHECK_WITH_COMPANY },
    ]
  }
  return [
    { select: EMPLOYEES_LOGIN_CHECK_WITH_COMPANY_OFFICE_PAYROLL },
    { select: EMPLOYEES_LOGIN_CHECK_WITH_COMPANY },
    { select: EMPLOYEES_LOGIN_CHECK_NO_COMPANY_OFFICE_PAYROLL },
    { select: EMPLOYEES_LOGIN_CHECK_NO_COMPANY },
  ]
}

const EMPLOYEES_LOGIN_CHECK_WITH_COMPANY =
  'id,employee_code,company,store,name,password,role,job,resign_date,extra_stores' as const
const EMPLOYEES_LOGIN_CHECK_NO_COMPANY =
  'id,employee_code,store,name,password,role,job,resign_date,extra_stores' as const
const EMPLOYEES_LOGIN_CHECK_WITH_COMPANY_OFFICE_PAYROLL =
  'id,employee_code,company,store,name,password,role,job,resign_date,extra_stores,can_manage_office_payroll' as const
const EMPLOYEES_LOGIN_CHECK_NO_COMPANY_OFFICE_PAYROLL =
  'id,employee_code,store,name,password,role,job,resign_date,extra_stores,can_manage_office_payroll' as const

function isMissingEmployeesOfficePayrollColumn(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /42703|can_manage_office_payroll|column.*does not exist/i.test(m)
}

export async function supabaseSelectFilterEmployeesByNameForLogin(name: string): Promise<unknown> {
  const nameFilter = `name=eq.${encodeURIComponent(name)}`
  const attempts = loginCheckSelectAttempts()
  let lastErr: unknown = null
  for (const { select } of attempts) {
    try {
      return await supabaseSelectFilter('employees', nameFilter, {
        limit: 120,
        select,
      })
    } catch (e) {
      lastErr = e
      if (isMissingEmployeesCompanyColumn(e) || isMissingEmployeesOfficePayrollColumn(e)) continue
      throw e
    }
  }
  throw lastErr
}
