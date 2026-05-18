import { NextRequest, NextResponse } from 'next/server'
import { assertCanWriteAccountingCompliance } from '@/lib/accounting-auth'
import { syncPayrollSsoExpenseAccruals } from '@/lib/payroll-sso-expense-sync'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(auth.role || '').trim()
    assertCanWriteAccountingCompliance(userRole)
    const yearMonth = String(body.yearMonth || body.month || '').trim().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
    }
    let storeFilter = body.storeFilter != null ? String(body.storeFilter).trim() : ''
    const isOfficeLevel = isOfficeRole(userRole) || isAccountingRole(userRole)
    if (!isOfficeLevel) {
      const allowed = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(String(auth.store || '').trim())
      if (!storeFilter || storeFilter === 'All') {
        storeFilter = allowed[0] || ''
      } else if (!allowed.some((s) => storesMatchForGradeLookup(s, storeFilter))) {
        return NextResponse.json({ success: false, error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
      }
    }
    const sync = await syncPayrollSsoExpenseAccruals({
      month: yearMonth,
      storeFilter: storeFilter && storeFilter !== 'All' ? storeFilter : undefined,
      postedBy: String(body.postedBy || auth.name || '').trim() || undefined,
    })
    return NextResponse.json({ success: true, sync }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, error: msg }, { status: 500, headers })
  }
}
