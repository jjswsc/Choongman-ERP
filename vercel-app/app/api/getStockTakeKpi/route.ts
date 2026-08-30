import { NextRequest, NextResponse } from 'next/server'
import { hasOfficeStaffScope } from '@/lib/permissions'
import { loadStockTakeKpiReport } from '@/lib/stock-take-kpi-report'
import { requireAuth } from '@/lib/verify-auth'

/** 월말 실사 완료 여부 — Adjustment 이력만 집계 (전 매장 이론소진 계산 없음) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const officeScope = hasOfficeStaffScope(userRole, userStore)
  const allowedStores = [
    ...new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    ),
  ]

  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = String(searchParams.get('yearMonth') || '').trim()
    const report = await loadStockTakeKpiReport({
      yearMonth,
      allowedStores,
      officeScope,
    })
    return NextResponse.json(report, { headers })
  } catch (e) {
    console.error('getStockTakeKpi:', e)
    return NextResponse.json(
      {
        yearMonth: '',
        startYmd: '',
        endYmd: '',
        windowStart: '',
        windowEnd: '',
        dueStartYmd: '',
        dueEndYmd: '',
        inDueWindow: false,
        totalStores: 0,
        doneCount: 0,
        missingCount: 0,
        stores: [],
      },
      { status: 500, headers }
    )
  }
}
