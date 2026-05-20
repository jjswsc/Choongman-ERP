import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementExpenseDrillDown } from '@/lib/accounting-reports'
import { PL_EXPENSE_UNCLASSIFIED_SUBJECT } from '@/lib/income-statement-purchase-drill-nav'
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
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  let accountSubjectKey = String(
    searchParams.get('accountSubjectKey') || searchParams.get('accountSubjectId') || ''
  ).trim()
  if (searchParams.get('unclassified') === '1') {
    accountSubjectKey = PL_EXPENSE_UNCLASSIFIED_SUBJECT
  }

  if (!accountSubjectKey) {
    return NextResponse.json({ error: 'accountSubjectKey required' }, { status: 400, headers })
  }

  try {
    const data = await computeIncomeStatementExpenseDrillDown({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      accountSubjectKey,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getIncomeStatementExpenseDrillDown:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
