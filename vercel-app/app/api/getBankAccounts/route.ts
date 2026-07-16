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

/** 통장(계좌) 목록 조회 */
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
  if (isSaasTenantQueryBlocked(tenantScope, 'bank_accounts')) {
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
  const effectiveStore = isOffice ? storeFilter : storeFilter

  try {
    let rows: { id?: number; name?: string; store?: string; bank_name?: string; opening_balance?: number; opening_balance_date?: string; sort_order?: number }[] = []
    if (effectiveStore && effectiveStore !== 'All') {
      const filter = appendSaasTenantFilter(
        `store=ilike.${encodeURIComponent(effectiveStore)}`,
        tenantScope,
        'bank_accounts'
      )
      rows = (await supabaseSelectFilter('bank_accounts', filter, {
        order: 'sort_order.asc,id.asc',
        limit: 100,
      })) as typeof rows
    } else {
      rows = (await supabaseSelectFilter('bank_accounts', appendSaasTenantFilter('id=gt.0', tenantScope, 'bank_accounts'), {
        order: 'sort_order.asc,id.asc',
        limit: 100,
      })) as typeof rows
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      store: String(r.store || '').trim(),
      bankName: String(r.bank_name || '').trim(),
      openingBalance: Number(r.opening_balance) ?? 0,
      openingBalanceDate: r.opening_balance_date ? String(r.opening_balance_date).slice(0, 10) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getBankAccounts:', e)
    if (tenantScope.enforce && isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('bank_accounts')
    }
    return NextResponse.json([], { headers })
  }
}
