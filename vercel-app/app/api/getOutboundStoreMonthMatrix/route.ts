import { NextRequest, NextResponse } from 'next/server'
import {
  buildOutboundStoreMonthMatrix,
  parseOutboundMatrixMonth,
  parseOutboundMatrixYear,
} from '@/lib/outbound-store-month-matrix'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

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
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getOutboundStoreMonthMatrix:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
