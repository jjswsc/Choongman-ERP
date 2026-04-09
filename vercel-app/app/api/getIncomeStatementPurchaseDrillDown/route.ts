import { NextRequest, NextResponse } from 'next/server'
import { computeIncomeStatementPurchaseDrillDown } from '@/lib/accounting-reports'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const yearMonth = String(searchParams.get('yearMonth') || searchParams.get('month') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  const vendorKey = String(searchParams.get('vendorKey') || '').trim()

  if (!vendorKey) {
    return NextResponse.json({ error: 'vendorKey required' }, { status: 400, headers })
  }

  try {
    const data = await computeIncomeStatementPurchaseDrillDown({
      yearMonth,
      storeFilter,
      userStore,
      userRole,
      vendorKey,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getIncomeStatementPurchaseDrillDown:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
