import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

const EDITABLE_STATUSES = ['pending', 'paid']

/** POS 주문 수정 (항목·메모·할인 등) - pending/paid 상태만 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = Number(body?.id)
    const items = Array.isArray(body?.items) ? body.items : []
    const tableName = String(body?.tableName ?? '').trim()
    const memo = String(body?.memo ?? '').trim()
    const discountAmt = Math.max(0, Number(body?.discountAmt ?? 0))
    const discountReason = String(body?.discountReason ?? '').trim()

    if (!id || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'id and items required' },
        { headers }
      )
    }

    const existing = (await supabaseSelectFilter(
      'pos_orders',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id?: number; status?: string }[] | null

    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }

    const status = String(existing[0]?.status ?? '')
    if (!EDITABLE_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, message: '대기/결제완료 상태만 수정할 수 있습니다.' },
        { headers }
      )
    }

    let subtotal = 0
    for (const it of items) {
      const price = Number(it.price ?? 0)
      const qty = Number(it.qty ?? 1)
      subtotal += price * qty
    }
    const afterDiscount = Math.max(0, subtotal - discountAmt)
    const vat = Math.round(afterDiscount * (7 / 107) * 100) / 100
    const total = afterDiscount

    const patch: Record<string, unknown> = {
      table_name: tableName,
      memo,
      discount_amt: discountAmt,
      discount_reason: discountReason,
      items_json: JSON.stringify(items),
      subtotal,
      vat,
      total,
    }

    await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, patch)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosOrder:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
