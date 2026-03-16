import { NextRequest, NextResponse } from 'next/server'
import { computeBalanceSheetReport } from '@/lib/accounting-reports'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)

  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').trim()

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

