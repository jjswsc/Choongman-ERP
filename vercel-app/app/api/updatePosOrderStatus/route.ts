import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { processPosStockDeduction } from '@/lib/pos-stock-deduction'

const ALLOWED_STATUSES = ['pending', 'paid', 'cooking', 'ready', 'completed', 'cancelled']

/** POS 주문 상태 변경 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body.id != null ? Number(body.id) : NaN
    const status = String(body.status ?? '').trim()

    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '주문 ID가 필요합니다.' }, { headers })
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
      limit: 1,
      select: 'id,store_code',
    })) as { id?: number; store_code?: string }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }

    await supabaseUpdate('pos_orders', id, { status })

    if (status === 'completed') {
      const storeCode = String(existing[0]?.store_code ?? '').trim()
      if (storeCode) {
        try {
          const settings = (await supabaseSelectFilter(
            'pos_printer_settings',
            `store_code=eq.${encodeURIComponent(storeCode)}`,
            { limit: 1, select: 'auto_stock_deduction' }
          )) as { auto_stock_deduction?: boolean }[] | null
          if (settings?.[0]?.auto_stock_deduction) {
            await processPosStockDeduction(id)
          }
        } catch (e) {
          console.error('processPosStockDeduction:', e)
        }
      }
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosOrderStatus:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
