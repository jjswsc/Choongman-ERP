import { NextRequest, NextResponse } from 'next/server'
import { grabListOrdersByDate, grabListOrdersByIds } from '@/lib/grab-partner-api'

function parseOrderIds(req: NextRequest): string[] {
  const { searchParams } = new URL(req.url)
  const multi = searchParams.getAll('orderIDs').map((v) => v.trim()).filter(Boolean)
  if (multi.length) return multi
  const csv = String(searchParams.get('orderIDs') || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return csv
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const merchantID = String(searchParams.get('merchantID') || '').trim()
    if (!merchantID) {
      return NextResponse.json({ success: false, message: 'merchantID_required' }, { status: 400, headers })
    }

    const orderIDs = parseOrderIds(req)
    if (orderIDs.length) {
      const data = await grabListOrdersByIds({ merchantID, orderIDs })
      return NextResponse.json({ success: true, data }, { headers })
    }

    const date = String(searchParams.get('date') || '').trim()
    const pageRaw = Number(searchParams.get('page') || 0)
    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.trunc(pageRaw) : 0
    if (!date) {
      return NextResponse.json({ success: false, message: 'date_or_orderIDs_required' }, { status: 400, headers })
    }
    const data = await grabListOrdersByDate({ merchantID, date, page })
    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

