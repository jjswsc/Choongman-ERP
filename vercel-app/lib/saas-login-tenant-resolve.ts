import 'server-only'

import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { deriveTenantIdFromCompany, normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'

export type SaasLoginTenantResolve = {
  tenantId: string
  companyName: string
  /** tenants.is_active — 행 없으면 true(온보딩 폴백). false면 로그인 차단 */
  isActive: boolean
}

type TenantRow = { id?: string; company_name?: string; is_active?: boolean | null }

/** 로그인 폼·loginCheck 연속 호출에서 tenants 전량 스캔 반복 방지 (격리 로직은 동일) */
const TENANTS_LIST_TTL_MS = 60_000
const TENANT_ID_TTL_MS = 60_000
let tenantsListCache: { at: number; withActive: boolean; rows: TenantRow[] } | null = null
const tenantIdCache = new Map<string, { at: number; value: SaasLoginTenantResolve | null }>()

function toResolve(row: TenantRow, fallbackName?: string): SaasLoginTenantResolve {
  const id = normalizeTenantId(row.id)
  return {
    tenantId: id,
    companyName: normalizeCompanyName(row.company_name) || fallbackName || id,
    isActive: row.is_active !== false,
  }
}

async function loadTenantsListCached(withActive: boolean): Promise<TenantRow[]> {
  const now = Date.now()
  if (
    tenantsListCache &&
    now - tenantsListCache.at < TENANTS_LIST_TTL_MS &&
    tenantsListCache.withActive === withActive
  ) {
    return tenantsListCache.rows
  }
  const select = withActive ? 'id,company_name,is_active' : 'id,company_name'
  const rows = (await supabaseSelect('tenants', {
    select,
    limit: 500,
    order: 'company_name.asc',
  })) as TenantRow[]
  tenantsListCache = { at: now, withActive, rows: rows || [] }
  return tenantsListCache.rows
}

async function lookupTenantById(tenantId: string): Promise<SaasLoginTenantResolve | null> {
  const tid = normalizeTenantId(tenantId)
  if (!tid) return null
  const cached = tenantIdCache.get(tid)
  if (cached && Date.now() - cached.at < TENANT_ID_TTL_MS) return cached.value

  const store = (value: SaasLoginTenantResolve | null) => {
    tenantIdCache.set(tid, { at: Date.now(), value })
    return value
  }

  try {
    const rows = (await supabaseSelectFilter('tenants', `id=eq.${encodeURIComponent(tid)}`, {
      select: 'id,company_name,is_active',
      limit: 1,
    })) as TenantRow[]
    const row = rows?.[0]
    if (!row?.id) return store(null)
    return store(toResolve(row))
  } catch {
    /** is_active 컬럼 없으면 활성으로 간주 */
    try {
      const rows = (await supabaseSelectFilter('tenants', `id=eq.${encodeURIComponent(tid)}`, {
        select: 'id,company_name',
        limit: 1,
      })) as TenantRow[]
      const row = rows?.[0]
      if (!row?.id) return store(null)
      return store(toResolve(row))
    } catch {
      return store(null)
    }
  }
}

async function lookupTenantByCompanyName(company: string): Promise<SaasLoginTenantResolve | null> {
  const name = normalizeCompanyName(company)
  if (!name) return null
  try {
    const exact = (await supabaseSelectFilter(
      'tenants',
      `company_name=eq.${encodeURIComponent(name)}`,
      { select: 'id,company_name,is_active', limit: 3 }
    )) as TenantRow[]
    if (exact?.[0]?.id) return toResolve(exact[0], name)
  } catch {
    /* company_name/is_active 없으면 아래 폴백 */
  }

  try {
    const rows = await loadTenantsListCached(true)
    const needle = name.toLowerCase()
    const hit = rows.find((r) => normalizeCompanyName(r.company_name).toLowerCase() === needle)
    if (hit?.id) return toResolve(hit, name)
  } catch {
    try {
      const rows = await loadTenantsListCached(false)
      const needle = name.toLowerCase()
      const hit = rows.find((r) => normalizeCompanyName(r.company_name).toLowerCase() === needle)
      if (hit?.id) return toResolve(hit, name)
    } catch {
      /* ignore */
    }
  }
  return null
}

/** company_name 을 슬러그화한 값이 slug 인 tenants 행 (abc-company ← ABC Company) */
async function lookupTenantByCompanyNameSlug(slug: string): Promise<SaasLoginTenantResolve | null> {
  const needle = normalizeTenantId(slug)
  if (!needle) return null
  try {
    const rows = await loadTenantsListCached(true)
    const hit = rows.find((r) => normalizeTenantId(r.company_name) === needle)
    if (hit?.id) return toResolve(hit)
  } catch {
    try {
      const rows = await loadTenantsListCached(false)
      const hit = rows.find((r) => normalizeTenantId(r.company_name) === needle)
      if (hit?.id) return toResolve(hit)
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Omni 로그인용 테넌트 확정.
 * 1) tenantId → tenants.id
 * 2) orphan 슬러그(abc-company) → company_name 슬러그 매칭 → 실제 id(malatang01)
 * 3) company → tenants.id(slug) / company_name
 * 4) slug 유도 폴백 (requireExistingRow 가 아닐 때만 — JWT에는 쓰지 말 것)
 */
export async function resolveSaasTenantForLogin(params: {
  company?: string | null
  tenantId?: string | null
  /** true 이면 tenants 실행만 반환. 회사명 슬러그(abc-company) 합성 폴백 금지 — 로그인 JWT용 */
  requireExistingRow?: boolean
}): Promise<SaasLoginTenantResolve | null> {
  const fromParam = normalizeTenantId(params.tenantId)
  if (fromParam) {
    const byId = await lookupTenantById(fromParam)
    if (byId) return byId
    const byOrphanSlug = await lookupTenantByCompanyNameSlug(fromParam)
    if (byOrphanSlug) return byOrphanSlug
  }

  const company = normalizeCompanyName(params.company)
  if (!company) return null

  const slug = deriveTenantIdFromCompany(company)
  if (slug) {
    const bySlug = await lookupTenantById(slug)
    if (bySlug) return bySlug
    const byCompanySlug = await lookupTenantByCompanyNameSlug(slug)
    if (byCompanySlug) return byCompanySlug
  }

  const byName = await lookupTenantByCompanyName(company)
  if (byName) return byName

  /** tenants 행이 아직 없어도 직원 company 문자열로 로그인 목록은 좁힐 수 있게 slug 폴백 */
  if (slug && !params.requireExistingRow) {
    return { tenantId: slug, companyName: company, isActive: true }
  }
  return null
}
