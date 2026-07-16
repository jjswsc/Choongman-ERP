/**
 * Omni SaaS: 회원 포털 tenant 스코프.
 * 가입 매장·로그인 회원·요청 힌트(쿼리/헤더)·단일 활성 테넌트 순으로 resolve.
 */
import type { NextRequest } from 'next/server'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { normalizeTenantId } from '@/lib/tenant-context'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  LEGACY_MEMBERS_TENANT_SCOPE,
  type MembersTenantScope,
} from '@/lib/members-tenant-scope'

const SINGLE_TENANT_CACHE_MS = 60_000
let singleTenantCache: { at: number; tenantId: string } | null = null

export function readTenantIdFromPortalRequest(request?: NextRequest): string {
  if (!request) return ''
  const url = new URL(request.url)
  const fromQuery = normalizeTenantId(
    url.searchParams.get('tenantId') || url.searchParams.get('tenant') || ''
  )
  if (fromQuery) return fromQuery
  return normalizeTenantId(request.headers.get('x-tenant-id') || '') || ''
}

async function resolveSingleActiveTenantFallback(): Promise<string> {
  const hit = singleTenantCache
  if (hit && Date.now() - hit.at < SINGLE_TENANT_CACHE_MS) return hit.tenantId

  try {
    const rows = (await supabaseSelect('tenants', {
      select: 'id,is_active',
      limit: 20,
      order: 'created_at.asc',
    })) as { id?: string; is_active?: boolean }[] | null
    const active = (rows || []).filter((r) => r.is_active !== false && normalizeTenantId(r.id))
    if (active.length === 1) {
      const tenantId = normalizeTenantId(active[0]!.id)
      singleTenantCache = { at: Date.now(), tenantId }
      return tenantId
    }
  } catch {
    /* tenants 없음 */
  }
  singleTenantCache = { at: Date.now(), tenantId: '' }
  return ''
}

export async function loadMemberTenantId(memberId: number): Promise<string> {
  const id = Number(memberId || 0)
  if (!id) return ''
  try {
    const rows = (await supabaseSelectFilter('members', `id=eq.${id}`, {
      limit: 1,
      select: 'tenant_id',
    })) as { tenant_id?: string | null }[] | null
    return normalizeTenantId(rows?.[0]?.tenant_id) || ''
  } catch {
    return ''
  }
}

export async function resolveMemberPortalTenantScope(params: {
  request?: NextRequest
  joinStoreCode?: string | null
  memberId?: number | null
}): Promise<MembersTenantScope> {
  if (isLegacyChoongmanErpSupabase()) {
    return LEGACY_MEMBERS_TENANT_SCOPE
  }

  let tenantId = ''

  const memberId = Number(params.memberId || 0)
  if (memberId) {
    tenantId = await loadMemberTenantId(memberId)
  }

  if (!tenantId) {
    const storeCode = String(params.joinStoreCode || '').trim()
    if (storeCode) {
      tenantId =
        normalizeTenantId((await resolveTenantIdForStoreCode(storeCode)) || '') || ''
    }
  }

  if (!tenantId && params.request) {
    tenantId = readTenantIdFromPortalRequest(params.request) || ''
  }

  if (!tenantId) {
    tenantId = await resolveSingleActiveTenantFallback()
  }

  return { enforce: true, tenantId }
}
