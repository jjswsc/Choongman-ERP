import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany } from '@/lib/supabase-server'

/** 입고 등록 저장 - stock_logs (location=입고등록, log_type=Inbound) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const list = Array.isArray(body) ? body : (body?.list || []) as {
      date?: string
      vendor?: string
      code?: string
      name?: string
      spec?: string
      qty?: number | string
    }[]

    if (!list.length) {
      return NextResponse.json(
        { success: false, message: '저장할 목록이 없습니다.' },
        { headers }
      )
    }

    const rows = list.map((item) => {
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
      const dateObj = item.date ? new Date(item.date) : new Date()
      return {
        location: '입고등록',
        item_code: String(item.code || '').trim(),
        item_name: String(item.name || '').trim(),
        spec: String(item.spec || '').trim() || '-',
        qty,
        log_date: dateObj.toISOString(),
        vendor_target: String(item.vendor || '').trim(),
        log_type: 'Inbound',
      }
    })

    const validRows = rows.filter((r) => r.item_code)
    if (!validRows.length) {
      return NextResponse.json(
        { success: false, message: '유효한 품목이 없습니다.' },
        { headers }
      )
    }

    await supabaseInsertMany('stock_logs', validRows)
    return NextResponse.json(
      { success: true, message: `✅ ${validRows.length}건 입고 완료!` },
      { headers }
    )
  } catch (e) {
    console.error('registerInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '입고 저장 실패' },
      { headers }
    )
  }
}
