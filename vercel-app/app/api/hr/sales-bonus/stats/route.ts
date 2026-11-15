import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { forbidUnlessAdminPayroll } from '@/lib/payroll-admin-gate'
import { resolveSaasTenantScope, isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'
import { calcSalesBonusStatsForStores } from '@/lib/sales-bonus/calc-stats-server'

export const dynamic = 'force-dynamic'

/** GET ?from=YYYY-MM&to=YYYY-MM&store=CODE | stores=a,b */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const gate = forbidUnlessAdminPayroll(authRes.auth, headers)
  if (gate) return gate

  const tenantScope = await resolveSaasTenantScope({ auth: authRes.auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'employees')) {
    return NextResponse.json(
      {
        success: true,
        fromMonth: '',
        toMonth: '',
        months: [],
        stores: [],
        totals: { salesTotal: 0, bonusTotal: 0, penaltyTotal: 0, storeCount: 0, monthCount: 0 },
      },
      { headers }
    )
  }

  const sp = new URL(request.url).searchParams
  const fromMonth = String(sp.get('from') || sp.get('fromMonth') || '').trim().slice(0, 7)
  const toMonth = String(sp.get('to') || sp.get('toMonth') || '').trim().slice(0, 7)
  const store = String(sp.get('store') || '').trim()
  const storesParam = String(sp.get('stores') || '').trim()
  const storeCodes = store
    ? [store]
    : storesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
    return NextResponse.json(
      { success: false, msg: 'from·to는 YYYY-MM 형식이어야 합니다.' },
      { status: 400, headers }
    )
  }
  if (storeCodes.length === 0) {
    return NextResponse.json(
      { success: false, msg: 'store 또는 stores가 필요합니다.' },
      { status: 400, headers }
    )
  }

  try {
    const result = await calcSalesBonusStatsForStores({
      fromMonth,
      toMonth,
      storeCodes,
      request,
      tenantScope,
    })
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('hr/sales-bonus/stats GET:', msg)
    return NextResponse.json(
      { success: false, msg: '매출 보너스 통계에 실패했습니다.', detail: msg },
      { status: 500, headers }
    )
  }
}
