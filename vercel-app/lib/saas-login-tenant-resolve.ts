import 'server-only'

import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { deriveTenantIdFromCompany, normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'

export type SaasLoginTenantResolve = {
  tenantId: string
  companyName: string
  /** tenants.is_active — 행 없으면 true(온보딩 폴백). false면 로그인 차단 */
  isActive: boolean
}

async function lookupTenantById(tenantId: string): Promise<SaasLoginTenantResolve | null> {
  const tid = normalizeTenantId(tenantId)
  if (!tid) return null
  try {
    const rows = (await supabaseSelectFilter('tenants', `id=eq.${encodeURIComponent(tid)}`, {
      select: 'id,company_name,is_active',
      limit: 1,
    })) as { id?: string; company_name?: string; is_active?: boolean | null }[]
    const row = rows?.[0]
    if (!row?.id) return null
    return {
      tenantId: normalizeTenantId(row.id),
      companyName: normalizeCompanyName(row.company_name) || normalizeTenantId(row.id),
      isActive: row.is_active !== false,
    }
  } catch {
    /** is_active 컬럼 없으면 활성으로 간주 */
    try {
      const rows = (await supabaseSelectFilter('tenants', `id=eq.${encodeURIComponent(tid)}`, {
        select: 'id,company_name',
        limit: 1,
      })) as { id?: string; company_name?: string }[]
      const row = rows?.[0]
      if (!row?.id) return null
      return {
        tenantId: normalizeTenantId(row.id),
        companyName: normalizeCompanyName(row.company_name) || normalizeTenantId(row.id),
        isActive: true,
      }
    } catch {
      return null
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
    )) as { id?: string; company_name?: string; is_active?: boolean | null }[]
    if (exact?.[0]?.id) {
      return {
        tenantId: normalizeTenantId(exact[0].id),
        companyName: normalizeCompanyName(exact[0].company_name) || name,
        isActive: exact[0].is_active !== false,
      }
    }
  } catch {
    /* company_name/is_active 없으면 아래 폴백 */
  }

  try {
    const rows = (await supabaseSelect('tenants', {
      select: 'id,company_name,is_active',
      limit: 500,
      order: 'company_name.asc',
    })) as { id?: string; company_name?: string; is_active?: boolean | null }[]
    const needle = name.toLowerCase()
    const hit = (rows || []).find((r) => normalizeCompanyName(r.company_name).toLowerCase() === needle)
    if (hit?.id) {
      return {
        tenantId: normalizeTenantId(hit.id),
        companyName: normalizeCompanyName(hit.company_name) || name,
        isActive: hit.is_active !== false,
      }
    }
  } catch {
    try {
      const rows = (await supabaseSelect('tenants', {
        select: 'id,company_name',
        limit: 500,
        order: 'company_name.asc',
      })) as { id?: string; company_name?: string }[]
      const needle = name.toLowerCase()
      const hit = (rows || []).find((r) => normalizeCompanyName(r.company_name).toLowerCase() === needle)
      if (hit?.id) {
        return {
          tenantId: normalizeTenantId(hit.id),
          companyName: normalizeCompanyName(hit.company_name) || name,
          isActive: true,
        }
      }
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
    const rows = (await supabaseSelect('tenants', {
      select: 'id,company_name,is_active',
      limit: 500,
      order: 'company_name.asc',
    })) as { id?: string; company_name?: string; is_active?: boolean | null }[]
    const hit = (rows || []).find((r) => normalizeTenantId(r.company_name) === needle)
    if (hit?.id) {
      return {
        tenantId: normalizeTenantId(hit.id),
        companyName: normalizeCompanyName(hit.company_name) || normalizeTenantId(hit.id),
        isActive: hit.is_active !== false,
      }
    }
  } catch {
    try {
      const rows = (await supabaseSelect('tenants', {
        select: 'id,company_name',
        limit: 500,
        order: 'company_name.asc',
      })) as { id?: string; company_name?: string }[]
      const hit = (rows || []).find((r) => normalizeTenantId(r.company_name) === needle)
      if (hit?.id) {
        return {
          tenantId: normalizeTenantId(hit.id),
          companyName: normalizeCompanyName(hit.company_name) || normalizeTenantId(hit.id),
          isActive: true,
        }
      }
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
 * 4) slug 유도 폴백
 */
export async function resolveSaasTenantForLogin(params: {
  company?: string | null
  tenantId?: string | null
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
  if (slug) {
    return { tenantId: slug, companyName: company, isActive: true }
  }
  return null
}
