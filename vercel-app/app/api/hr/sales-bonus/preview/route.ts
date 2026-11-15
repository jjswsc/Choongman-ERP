import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { forbidUnlessAdminPayroll } from '@/lib/payroll-admin-gate'
import { resolveSaasTenantScope, isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'
import { calcSalesBonusPreviewForStores } from '@/lib/sales-bonus/calc-store-month-server'

export const dynamic = 'force-dynamic'

/** GET ?month=YYYY-MM&store=CODE (store 생략 시 store 필수 아님 — 단건 권장) */
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
    return NextResponse.json({ success: true, stores: [] }, { headers })
  }

  const sp = new URL(request.url).searchParams
  const month = String(sp.get('month') || '').trim().slice(0, 7)
  const store = String(sp.get('store') || '').trim()
  const storesParam = String(sp.get('stores') || '').trim()
  const storeCodes = store
    ? [store]
    : storesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { success: false, msg: 'month는 YYYY-MM 형식이어야 합니다.' },
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
    const stores = await calcSalesBonusPreviewForStores({
      month,
      storeCodes,
      request,
      tenantScope,
    })
    return NextResponse.json({ success: true, stores }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('hr/sales-bonus/preview GET:', msg)
    return NextResponse.json(
      { success: false, msg: '매출 보너스 미리보기에 실패했습니다.', detail: msg },
      { status: 500, headers }
    )
  }
}
