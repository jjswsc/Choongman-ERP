import { NextRequest, NextResponse } from 'next/server'
import { fetchUsageHistoryRows } from '@/lib/stock-logs-history-rpc'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()

  if (!store || !startStr || !endStr) {
    return NextResponse.json([], { headers })
  }

  try {
    const list = await fetchUsageHistoryRows({ store, startStr, endStr })
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getMyUsageHistory:', e)
    return NextResponse.json([], { headers })
  }
}
