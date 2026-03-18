import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** POS 결제 수단 항목 삭제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { id?: string }
    const id = body.id != null ? String(body.id).trim() : ''
    if (!id) {
      return NextResponse.json(
        { success: false, message: '항목 ID가 필요합니다.' },
        { headers }
      )
    }

    const existing = (await supabaseSelectFilter(
      'pos_payment_method_items',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: '존재하지 않는 항목입니다.' },
        { headers }
      )
    }

    await supabaseDeleteByFilter('pos_payment_method_items', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePosPaymentMethodItem:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
