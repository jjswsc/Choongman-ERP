import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { isSyntheticPosPaymentMethodId } from '@/lib/pos-payment-settings-resolve'

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
    if (isSyntheticPosPaymentMethodId(id)) {
      return NextResponse.json(
        {
          success: false,
          message:
            '기본(폴백) 항목은 DB에 없어 삭제할 수 없습니다. 목록을 바꾸려면 저장으로 매장 항목을 추가하거나, Supabase에 pos_payment_method_items를 등록하세요.',
        },
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
