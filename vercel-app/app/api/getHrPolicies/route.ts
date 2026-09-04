import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import {
  filterHrPoliciesForList,
  type HrPolicyListQuery,
} from '@/lib/hr-policy-access'
import { selectHrPoliciesList } from '@/lib/hr-policies-select'
import type { BroadcastTargetAudienceFilter } from '@/lib/broadcast-target-selection'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

export const dynamic = 'force-dynamic'

/**
 * 관리자: 인사 규정 목록 (JWT 권한·매장 범위 반영, 검색·필터)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    const er = authRes.errorResponse
    er.headers.set('Access-Control-Allow-Origin', '*')
    return er
  }
  const auth = authRes.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'hr_policies')) {
    return NextResponse.json({ success: true, items: [], total: 0, scoped: true }, { headers })
  }

  const { searchParams } = new URL(request.url)
  const activeOnly = (searchParams.get('activeOnly') || '0') === '1'
  const q = String(searchParams.get('q') || searchParams.get('keyword') || '').trim()
  const store = String(searchParams.get('store') || '').trim()
  const permissionGroup = String(searchParams.get('permissionGroup') || '').trim()
  const audienceRaw = String(searchParams.get('audience') || 'all').trim()
  const audience = (
    ['all', 'office', 'store', 'individual'].includes(audienceRaw)
      ? audienceRaw
      : 'all'
  ) as BroadcastTargetAudienceFilter

  const userRole = String(auth.role || '').toLowerCase()
  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)

  try {
    const baseFilter = activeOnly ? 'is_active=eq.true' : 'id=gte.0'
    const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'hr_policies')
    let rows: Record<string, unknown>[] = []
    try {
      rows = await selectHrPoliciesList(filter, { order: 'created_at.desc', limit: 500 })
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('hr_policies')
        rows = await selectHrPoliciesList(baseFilter, { order: 'created_at.desc', limit: 500 })
      } else {
        throw e
      }
    }

    let knownStoreNames: string[] = []
    try {
      const empRows = (await supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store',
        limit: 2000,
      })) as { store?: string }[]
      knownStoreNames = Array.from(
        new Set(
          (empRows || [])
            .map((e) => String(e.store || '').trim())
            .filter((s) => s && s !== '매장명' && s !== 'Store')
        )
      ).sort()
    } catch {
      knownStoreNames = []
    }

    const summaryLabels = {
      all: '전체',
      office: '오피스(본사)',
      stores: '매장',
      individuals: '개인',
      countSuffix: '명',
      permissionPrefix: '권한',
    }

    const query: HrPolicyListQuery = { q, store, permissionGroup, audience }
    const items = filterHrPoliciesForList(
      (rows || []) as Parameters<typeof filterHrPoliciesForList>[0],
      auth,
      isOfficeLevel,
      query,
      knownStoreNames,
      summaryLabels
    )

    return NextResponse.json(
      {
        success: true,
        items,
        total: items.length,
        scoped: !isOfficeLevel,
      },
      { headers }
    )
  } catch (e) {
    console.error('getHrPolicies:', e)
    return NextResponse.json(
      { success: false, message: (e as Error).message, items: [] as never[] },
      { status: 500, headers }
    )
  }
}
