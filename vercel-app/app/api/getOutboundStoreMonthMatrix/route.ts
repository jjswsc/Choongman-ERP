import { NextRequest, NextResponse } from 'next/server'
import {
  buildOutboundStoreMonthMatrix,
  parseOutboundMatrixMonth,
  parseOutboundMatrixYear,
} from '@/lib/outbound-store-month-matrix'
import { requireAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'
/** 연간·다매장 stock_logs + 매출 RPC — 기본 한도보다 길 수 있음 */
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  const { searchParams } = new URL(request.url)
  const year = parseOutboundMatrixYear(searchParams.get('year'))
  if (!year) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400, headers })
  }

  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim() || null
  const month = parseOutboundMatrixMonth(searchParams.get('month'))
  const knownRaw = String(searchParams.get('knownStores') || '').trim()
  const knownStores = knownRaw
    ? knownRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  try {
    const data = await buildOutboundStoreMonthMatrix({
      year,
      month,
      storeFilter,
      knownStores,
      tenantId: auth.tenantId,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getOutboundStoreMonthMatrix:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
