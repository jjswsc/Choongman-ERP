import { NextRequest, NextResponse } from 'next/server'
import { computeTrialBalanceReport } from '@/lib/trial-balance-report'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()

  try {
    const data = await computeTrialBalanceReport({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getTrialBalance:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
