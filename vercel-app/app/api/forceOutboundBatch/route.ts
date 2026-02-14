import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany } from '@/lib/supabase-server'

/** 강제 출고 - 본사 재고 차감 + 매장 재고 증가 (ForcePush + ForceOutbound) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const list = Array.isArray(body) ? body : (body?.list || []) as {
      date?: string
      deliveryDate?: string
      store: string
      code: string
      name?: string
      spec?: string
      qty: number | string
    }[]

    if (!list.length) {
      return NextResponse.json(
        { success: false, message: '출고할 목록이 없습니다.' },
        { headers }
      )
    }

    const rows: Record<string, unknown>[] = []
    for (const d of list) {
      const qty = parseFloat(String(d.qty || 0).replace(/,/g, '')) || 0
      if (qty <= 0) continue
      const store = String(d.store || '').trim()
      const code = String(d.code || '').trim()
      if (!store || !code) continue

      const dateObj = d.date ? new Date(d.date) : new Date()
      const dateIso = dateObj.toISOString()
      const deliveryDate = (d.deliveryDate && String(d.deliveryDate).trim()) || null

      rows.push({
        location: store,
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty,
        log_date: dateIso,
        vendor_target: 'HQ',
        log_type: 'ForcePush',
        delivery_status: deliveryDate,
      })
      rows.push({
        location: '본사',
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty: -qty,
        log_date: dateIso,
        vendor_target: store,
        log_type: 'ForceOutbound',
        delivery_status: deliveryDate,
      })
    }

    if (!rows.length) {
      return NextResponse.json(
        { success: false, message: '유효한 출고 항목이 없습니다.' },
        { headers }
      )
    }

    await supabaseInsertMany('stock_logs', rows)
    const count = Math.floor(rows.length / 2)
    return NextResponse.json(
      { success: true, message: `✅ ${count}건의 강제 출고 및 매장 재고 반영이 완료되었습니다.` },
      { headers }
    )
  } catch (e) {
    console.error('forceOutboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '출고 처리 실패' },
      { headers }
    )
  }
}
