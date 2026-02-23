/**
 * 배달앱별 매출 (Grab/Line Man/Shopee/매장/포장 등). 결제 금액 기준. pos 필터 지원.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function getDeliveryAppCategory(channel: string): string {
  const c = String(channel || '').trim()
  if (/^Grab\s/i.test(c)) return 'Grab'
  if (/^Lineman\s/i.test(c)) return 'Line Man'
  if (/^Shopee\s/i.test(c)) return 'Shopee'
  if (/^Robinhood\s/i.test(c)) return 'Robinhood'
  if (/^Table\s/i.test(c)) return '매장'
  if (/^Packing\s/i.test(c)) return '포장'
  return '기타'
}

const ORDER = ['Grab', 'Line Man', 'Shopee', 'Robinhood', '매장', '포장', '기타']

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

    const byApp: Record<string, number> = {}
    for (const r of rows) {
      const app = getDeliveryAppCategory(r.channel || '')
      const amt = Number(r.payment_amount) || 0
      byApp[app] = (byApp[app] || 0) + amt
    }

    const total = Object.values(byApp).reduce((a, b) => a + b, 0)
    const result = ORDER.filter((k) => byApp[k] != null).map((label) => ({
      label,
      sales: byApp[label] || 0,
      pct: total > 0 ? ((byApp[label] || 0) / total) * 100 : 0,
    }))

    return NextResponse.json({ items: result, total }, { headers })
  } catch (e) {
    console.error('posSalesByDeliveryApp:', e)
    return NextResponse.json({ items: [], total: 0 }, { headers })
  }
}
