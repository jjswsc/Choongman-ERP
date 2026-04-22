import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** 강제출고 수령 완료 처리 - stock_logs의 ForceOutbound 건 delivery_status를 "수령완료"로 업데이트 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const dateStr = String(body?.date || body?.dateStr || '').trim()
    const vendorTarget = String(body?.vendorTarget || body?.target || '').trim()

    if (!dateStr || !vendorTarget) {
      return NextResponse.json(
        { success: false, message: '날짜와 수령처가 필요합니다.' },
        { headers }
      )
    }

    // YYYY-MM-DD 형식 검증
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!dateMatch) {
      return NextResponse.json(
        { success: false, message: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' },
        { headers }
      )
    }

    const startIso = `${dateStr}T00:00:00.000`
    const endIso = `${dateStr}T23:59:59.999`

    const filter = `log_type=eq.ForceOutbound&is_deleted=is.false&vendor_target=eq.${encodeURIComponent(vendorTarget)}&log_date=gte.${startIso}&log_date=lte.${endIso}`
    const rows = (await supabaseSelectFilter('stock_logs', filter, { select: 'id', limit: 1000 })) as { id: number }[]

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '해당 조건의 강제출고 건을 찾을 수 없습니다.' },
        { headers }
      )
    }

    for (const r of rows) {
      await supabaseUpdate('stock_logs', r.id, { delivery_status: '수령완료' })
    }

    return NextResponse.json(
      { success: true, message: `${rows.length}건 수령 완료 처리되었습니다.` },
      { headers }
    )
  } catch (e) {
    console.error('updateForceOutboundReceived:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
