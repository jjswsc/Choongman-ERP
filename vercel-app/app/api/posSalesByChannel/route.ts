/**
 * 채널 상세 매출 (Table 4, Lineman 1 등). 결제 금액 기준. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const importId = searchParams.get('importId')?.trim()
    const pos = searchParams.get('pos')?.trim()

    if (!importId) {
      return NextResponse.json({ success: false, message: 'importId 필요' }, { headers })
    }

    let filter = `import_id=eq.${encodeURIComponent(importId)}&payment_amount=gt.0`
    if (pos) filter += `&pos=eq.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_sales_details', filter, {
      limit: 50000,
      select: 'channel,payment_amount',
    })) as { channel?: string; payment_amount?: number }[]

    const byChannel: Record<string, number> = {}
    for (const r of rows) {
      const ch = String(r.channel || '').trim() || '(없음)'
      const amt = Number(r.payment_amount) || 0
      byChannel[ch] = (byChannel[ch] || 0) + amt
    }

    const result = Object.entries(byChannel)
      .map(([label, sales]) => ({ label, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByChannel:', e)
    return NextResponse.json([], { headers })
  }
}
