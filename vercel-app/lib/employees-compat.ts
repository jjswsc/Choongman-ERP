/**
 * 일부 DB에는 employees.company 가 아직 없음(SaaS 마이그레이션 전).
 * select 목록에 company 를 넣으면 PostgREST 42703 → getLoginData 503.
 */
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export function isMissingEmployeesCompanyColumn(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err)
  return /42703|column\s+employees\.company|\.company\s+does not exist|company.*does not exist/i.test(m)
}

const EMPLOYEES_LOGIN_LIST_WITH_COMPANY =
  'company,store,name,nick,job,role,resign_date' as const
const EMPLOYEES_LOGIN_LIST_NO_COMPANY = 'store,name,nick,job,role,resign_date' as const

export async function supabaseSelectEmployeesForLoginList(): Promise<unknown> {
  try {
    return await supabaseSelect('employees', {
      order: 'id.asc',
      select: EMPLOYEES_LOGIN_LIST_WITH_COMPANY,
    })
  } catch (e) {
    if (isMissingEmployeesCompanyColumn(e)) {
      return await supabaseSelect('employees', {
        order: 'id.asc',
        select: EMPLOYEES_LOGIN_LIST_NO_COMPANY,
      })
    }
    throw e
  }
}

const EMPLOYEES_LOGIN_CHECK_WITH_COMPANY =
  'id,employee_code,company,store,name,password,role,job,resign_date,extra_stores' as const
const EMPLOYEES_LOGIN_CHECK_NO_COMPANY =
  'id,employee_code,store,name,password,role,job,resign_date,extra_stores' as const

export async function supabaseSelectFilterEmployeesByNameForLogin(name: string): Promise<unknown> {
  const nameFilter = `name=eq.${encodeURIComponent(name)}`
  try {
    return await supabaseSelectFilter('employees', nameFilter, {
      limit: 120,
      select: EMPLOYEES_LOGIN_CHECK_WITH_COMPANY,
    })
  } catch (e) {
    if (isMissingEmployeesCompanyColumn(e)) {
      return await supabaseSelectFilter('employees', nameFilter, {
        limit: 120,
        select: EMPLOYEES_LOGIN_CHECK_NO_COMPANY,
      })
    }
    throw e
  }
}
