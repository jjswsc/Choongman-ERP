import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 고정비 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'fixed_expenses')) {
    return NextResponse.json([], { headers })
  }
  const { searchParams } = new URL(request.url)
  let storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
  if (!isOffice) {
    if (!storeFilter || storeFilter === 'All') {
      const fallbackStore = String(allowedStores[0] || '').trim()
      if (!fallbackStore) return NextResponse.json([], { status: 403, headers })
      storeFilter = fallbackStore
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeFilter))
      if (!allowed) return NextResponse.json([], { status: 403, headers })
    }
  }
  const effectiveStore = storeFilter

  try {
    type Row = { id?: number; name?: string; monthly_amount?: number; store?: string; start_year_month?: string; end_year_month?: string; memo?: string; account_subject_id?: number }
    let rows: Row[] = []
    if (effectiveStore && effectiveStore !== 'All') {
      rows = (await supabaseSelectFilter('fixed_expenses', appendSaasTenantFilter(`store=ilike.${encodeURIComponent(effectiveStore)}`, tenantScope, 'fixed_expenses'), {
        order: 'store.asc,name.asc',
        limit: 200,
      })) as Row[]
    } else {
      rows = (await supabaseSelectFilter('fixed_expenses', appendSaasTenantFilter('id=gt.0', tenantScope, 'fixed_expenses'), {
        order: 'store.asc,name.asc',
        limit: 200,
      })) as Row[]
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      monthlyAmount: Number(r.monthly_amount) ?? 0,
      store: String(r.store || '').trim(),
      startYearMonth: r.start_year_month ? String(r.start_year_month).trim() : null,
      endYearMonth: r.end_year_month ? String(r.end_year_month).trim() : null,
      memo: String(r.memo || '').trim() || null,
      accountSubjectId: r.account_subject_id ?? null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getFixedExpenses:', e)
    if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('fixed_expenses')
    }
    return NextResponse.json([], { headers })
  }
}
