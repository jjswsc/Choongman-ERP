import 'server-only'

import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { isEmployedAsOf } from '@/lib/employee-headcount-utils'
import { isOfficeRole, isManagerRole, isFranchiseeRole } from '@/lib/permissions'
import { OFFICE_STORES } from '@/lib/permissions'

export type WorkLogEmployeeOption = {
  id: number
  name: string
  displayName: string
  store: string
  job: string
}

const OFFICE_STORE_PATTERNS = ['본사', '오피스', 'office', 'hq', 'headquarters', '본점', 'cm office']

export function isOfficeStaffStore(store: string): boolean {
  const s = String(store || '').trim().toLowerCase()
  if (!s || s === '-' || s === 'null') return true
  if (OFFICE_STORES.some((o) => s === o.toLowerCase() || s.includes(o.toLowerCase()))) return true
  return OFFICE_STORE_PATTERNS.some((o) => s.includes(o.toLowerCase()))
}

export function normalizeWorkLogStoreFilter(store: string | null | undefined): string {
  const s = String(store || '').trim()
  return s && s !== 'all' ? s : ''
}

export async function loadEmployedEmployeesForWorkLog(): Promise<
  {
    id?: number
    name?: string
    nick?: string
    job?: string
    store?: string
    join_date?: unknown
    resign_date?: unknown
  }[]
> {
  const todayBkk = getBangkokTodayDateString()
  const list =
    ((await supabaseSelect('employees', {
      order: 'name.asc',
      select: 'id,name,nick,job,store,join_date,resign_date',
      limit: 5000,
    })) || []) as {
      id?: number
      name?: string
      nick?: string
      job?: string
      store?: string
      join_date?: unknown
      resign_date?: unknown
    }[]
  return list.filter((e) =>
    isEmployedAsOf(
      e.join_date != null ? String(e.join_date) : '',
      e.resign_date != null ? String(e.resign_date) : '',
      todayBkk
    )
  )
}

export function buildWorkLogFilterOptions(
  employees: {
    id?: number
    name?: string
    nick?: string
    job?: string
    store?: string
  }[]
): {
  stores: string[]
  depts: string[]
  staff: WorkLogEmployeeOption[]
} {
  const storeSet = new Set<string>()
  const deptSet = new Set<string>()
  const staff: WorkLogEmployeeOption[] = []

  for (const e of employees) {
    const store = String(e.store || '').trim() || '—'
    const job = String(e.job || '').trim()
    const id = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
    const n = String(e.name || '').trim()
    const nick = String(e.nick || '').trim()
    if (store && store !== '—') storeSet.add(store)
    if (job) deptSet.add(job)
    if (id > 0 && n) {
      staff.push({
        id,
        name: n,
        displayName: nick || n,
        store,
        job: job || 'Staff',
      })
    }
  }

  return {
    stores: Array.from(storeSet).sort((a, b) => a.localeCompare(b, 'ko')),
    depts: Array.from(deptSet).sort((a, b) => a.localeCompare(b, 'ko')),
    staff,
  }
}

export function scopeStoresForWorkLogRole(
  role: string,
  authStore: string,
  allowedStores?: string[]
): string[] | null {
  const r = String(role || '').trim()
  if (isOfficeRole(r) || isManagerRole(r) && isOfficeStaffStore(authStore)) return null
  if (isManagerRole(r) || isFranchiseeRole(r)) {
    const base = [String(authStore || '').trim()].filter(Boolean)
    const extra = (allowedStores || []).map((s) => String(s).trim()).filter(Boolean)
    const merged = [...new Set([...base, ...extra])].filter(Boolean)
    return merged.length > 0 ? merged : base
  }
  return null
}

export function employeeMatchesStoreFilter(
  employeeStore: string,
  storeFilter: string,
  scopedStores: string[] | null
): boolean {
  const sf = normalizeWorkLogStoreFilter(storeFilter)
  const es = String(employeeStore || '').trim()
  if (scopedStores && scopedStores.length > 0) {
    const inScope = scopedStores.some(
      (s) => s.toLowerCase() === es.toLowerCase() || es.toLowerCase().includes(s.toLowerCase())
    )
    if (!inScope) return false
  }
  if (!sf) return true
  return es.toLowerCase() === sf.toLowerCase() || es.toLowerCase().includes(sf.toLowerCase())
}

export function workLogStoreFilterClause(storeFilter: string): string | null {
  const sf = normalizeWorkLogStoreFilter(storeFilter)
  if (!sf) return null
  return `store=eq.${encodeURIComponent(sf)}`
}
