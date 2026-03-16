import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementReport } from '@/lib/accounting-reports'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  const includeDebug = ['1', 'true', 'yes'].includes(String(searchParams.get('includeDebug') || '').toLowerCase())

  try {
    const data = await computeIncomeStatementReport({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      includeDebug,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getIncomeStatement:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
