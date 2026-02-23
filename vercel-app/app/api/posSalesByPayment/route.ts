/**
 * 결제수단별 매출. 영수증 첫 행의 결제수단 컬럼 합산. pos 필터 지원.
 * 현금/카드/Line Delivery 등
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

    let filter = `import_id=eq.${encodeURIComponent(importId)}`
    if (pos) filter += `&pos=eq.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_sales_details', filter, {
      limit: 100000,
      select: 'receipt_no,payment_amount,cash,card,line_delivery',
    })) as {
      receipt_no?: string
      payment_amount?: number
      cash?: number
      card?: number
      line_delivery?: number
    }[]

    const byMethod: Record<string, number> = {
      현금: 0,
      카드: 0,
      'Line Delivery': 0,
      기타: 0,
    }

    const seenReceipts = new Set<string>()
    for (const r of rows) {
      const receiptNo = String(r.receipt_no || '')
      if (!receiptNo || seenReceipts.has(receiptNo)) continue
      seenReceipts.add(receiptNo)

      const cash = Number(r.cash) || 0
      const card = Number(r.card) || 0
      const line = Number(r.line_delivery) || 0
      const total = Number(r.payment_amount) || 0

      byMethod['현금'] += cash
      byMethod['카드'] += card
      byMethod['Line Delivery'] += line
      const covered = cash + card + line
      byMethod['기타'] += Math.max(0, total - covered)
    }

    const result = Object.entries(byMethod)
      .filter(([, v]) => v > 0)
      .map(([label, sales]) => ({ label, sales }))
      .sort((a, b) => b.sales - a.sales)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPayment:', e)
    return NextResponse.json([], { headers })
  }
}
