import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { workflowStoreScopeFromStoreTb } from '@/lib/accounting-ledger-store-filter'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '').trim()
  const requestedStoreFilter = String(searchParams.get('storeFilter') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || 120)
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 120))

  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(String(auth.store || '').trim())
  const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
  let storeFilter = requestedStoreFilter
  if (!isOfficeLevel) {
    if (!requestedStoreFilter || requestedStoreFilter === 'All') {
      storeFilter = String(allowedStores[0] || '').trim()
      if (!storeFilter) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    } else {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
      if (!allowed) {
        return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const storeScope = workflowStoreScopeFromStoreTb(storeFilter || 'All')
    const parts = ['filing_type=eq.sso', 'status=eq.done']
    if (storeScope !== '*') {
      parts.push(`store_scope=eq.${encodeURIComponent(storeScope)}`)
    }
    const rows = (await supabaseSelectFilter('accounting_filing_workflow_status', parts.join('&'), {
      select:
        'id,year_month,period_type,period_key,filing_type,status,note,owner,updated_by,updated_at,store_scope',
      limit,
      order: 'updated_at.desc,year_month.desc,id.desc',
    })) as Record<string, unknown>[] | null

    return NextResponse.json({ rows: rows || [] }, { headers })
  } catch (e) {
    console.error('getSsoSubmissionHistory:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
