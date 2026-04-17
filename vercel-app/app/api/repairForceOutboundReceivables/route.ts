/**
 * 기존 강제출고(stock_logs ForceOutbound) 미수금 일괄 반영 — 본사 권한
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { repairForceOutboundReceivablesRecentDays } from '@/lib/force-outbound-receivable'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }

    const body = (await request.json().catch(() => ({}))) as { days?: number }
    const days = body?.days != null ? Number(body.days) : 120
    const { processed, errors } = await repairForceOutboundReceivablesRecentDays(
      Number.isFinite(days) ? days : 120
    )
    return NextResponse.json(
      { success: true, message: `처리 ${processed}건 (오류 ${errors})`, processed, errors },
      { headers }
    )
  } catch (e) {
    console.error('repairForceOutboundReceivables:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '실패' },
      { status: 500, headers }
    )
  }
}
