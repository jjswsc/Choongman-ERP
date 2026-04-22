import { NextRequest, NextResponse } from 'next/server'
import { computeBalanceSheetReport } from '@/lib/accounting-reports'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)

  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').trim()

  try {
    const data = await computeBalanceSheetReport({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getBalanceSheet:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

