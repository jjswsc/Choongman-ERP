import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { resolveTaxScopeStoreCodes } from '@/lib/tax-entity-scope'
import { loadPp30ChannelSalesFromSalesManagement } from '@/lib/pp30-channel-sales-from-sales-management'

function emptyTotals() {
  return { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0, count: 0 }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const url = new URL(request.url)
    const taxMonth = String(url.searchParams.get('taxMonth') || '').trim().slice(0, 7)
    const storeFilter = String(url.searchParams.get('store') || '').trim()
    if (!taxMonth || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_PARAMS' }, { status: 400, headers })
    }

    const startDate = `${taxMonth}-01`
    const [y, m] = taxMonth.split('-').map(Number)
    const endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const scope = await resolveTaxScopeStoreCodes(storeFilter || 'All', authResult.auth.tenantId)

    if (scope.storeCodes && scope.storeCodes.length === 0) {
      return NextResponse.json(
        { success: true, dailySales: [], totals: emptyTotals(), netSalesTotal: 0, source: 'empty_scope' },
        { headers }
      )
    }

    const result = await loadPp30ChannelSalesFromSalesManagement({
      startStr: startDate,
      endStr: endDate,
      storeCodes: scope.storeCodes,
      tenantId: authResult.auth.tenantId || null,
    })

    return NextResponse.json(
      {
        success: true,
        dailySales: result.dailySales,
        totals: result.totals,
        netSalesTotal: result.netSalesTotal,
        source: result.source,
      },
      { headers }
    )
  } catch (err) {
    console.error('[getPp30ChannelSales]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'UNKNOWN' },
      { status: 500, headers }
    )
  }
}
