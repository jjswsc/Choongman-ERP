import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 통장 거래 ID → 실제 계좌. 미수금 화면에서 다른 매장 통장으로 열리지 않게 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'private, no-store')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'bank_transactions')) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers })
  }

  const id = Number(new URL(request.url).searchParams.get('id') || 0)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400, headers })
  }

  try {
    const filter = appendSaasTenantFilter(`id=eq.${Math.floor(id)}`, tenantScope, 'bank_transactions')
    const rows = (await supabaseSelectFilter('bank_transactions', filter, {
      select: 'id,account_id,trans_date,store_name',
      limit: 1,
    })) as { id?: number; account_id?: number; trans_date?: string; store_name?: string }[] | null
    const row = rows?.[0]
    const accountId = Number(row?.account_id || 0)
    if (!row || accountId <= 0) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404, headers })
    }
    return NextResponse.json(
      {
        id: Number(row.id) || Math.floor(id),
        accountId,
        transDate: String(row.trans_date || '').slice(0, 10) || undefined,
        storeName: row.store_name ? String(row.store_name) : undefined,
      },
      { headers }
    )
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('bank_transactions')
    console.error('lookupBankTransaction:', e)
    return NextResponse.json({ error: 'FAILED' }, { status: 500, headers })
  }
}
