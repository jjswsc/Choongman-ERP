import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []
    const storeName = String(body.storeName || body.store || '').trim()

    if (!storeName) {
      return NextResponse.json(
        { success: false, message: '❌ 매장 정보가 없습니다.' },
        { headers }
      )
    }
    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 사용 품목이 없습니다.' },
        { headers }
      )
    }

    const userName = String(body.userName || body.user_name || '').trim()
    const now = new Date().toISOString()
    const rows = items
      .filter((k: { code?: string; qty?: number }) => k && (k.code || (k as { name?: string }).name) && Number((k as { qty?: number }).qty) > 0)
      .map((k: { code?: string; name?: string; qty?: number }) => {
        const r: Record<string, unknown> = {
          location: storeName,
          item_code: String((k as { code?: string }).code || '').trim(),
          item_name: String((k as { name?: string }).name || '').trim(),
          spec: 'Usage',
          qty: -Math.abs(Number((k as { qty?: number }).qty) || 0),
          log_date: now,
          vendor_target: 'Store',
          log_type: 'Usage',
        }
        if (userName) r.user_name = userName
        return r
      })
      .filter((r: { qty: number }) => r.qty !== 0)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 유효한 품목이 없습니다.' },
        { headers }
      )
    }

    await supabaseInsertMany('stock_logs', rows)
    return NextResponse.json({ success: true, message: '✅ 사용 확정 완료' }, { headers })
  } catch (e) {
    console.error('processUsage:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
