import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { computeCorporateTaxComputation } from '@/lib/corporate-tax'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const userRole = String(searchParams.get('userRole') || '').trim()
  const yearMonth = String(searchParams.get('yearMonth') || '').trim()
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'half_year' || periodTypeRaw === 'annual' ? periodTypeRaw : 'monthly'
  const storeFilter = String(searchParams.get('storeFilter') || 'All').trim()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const taxRateRaw = Number(searchParams.get('taxRate'))

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const data = await computeCorporateTaxComputation({
      yearMonth,
      periodType,
      storeFilter,
      userStore,
      userRole,
      taxRate: Number.isFinite(taxRateRaw) ? taxRateRaw : undefined,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getCorporateTaxComputation:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

