import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { loadBorrowingLedger } from '@/lib/borrowing-ledger'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const { searchParams } = new URL(request.url)
    const endStr = String(searchParams.get('endStr') || getBangkokTodayDateString()).slice(0, 10)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const partyCode = String(searchParams.get('partyCode') || '').trim()
    const data = await loadBorrowingLedger({
      endStr,
      startStr: /^\d{4}-\d{2}-\d{2}$/.test(startStr) ? startStr : undefined,
      partyCode: partyCode || undefined,
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getBorrowingLedger:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
