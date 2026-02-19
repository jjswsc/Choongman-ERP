import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 프로모션 구성 메뉴 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      promoId: number
      menuId: number
      optionId?: number | null
      quantity?: number
      sortOrder?: number
    }

    const promoId = Number(body.promoId)
    const menuId = Number(body.menuId)
    const editingId = body.id ? String(body.id).trim() : null

    if (!promoId || !menuId) {
      return NextResponse.json({ success: false, message: 'promoId와 menuId가 필요합니다.' }, { headers })
    }

    const row = {
      promo_id: promoId,
      menu_id: menuId,
      option_id: body.optionId != null ? Number(body.optionId) : null,
      quantity: Number(body.quantity) ?? 1,
      sort_order: Number(body.sortOrder) ?? 0,
    }

    if (editingId) {
      await supabaseUpdateByFilter('pos_promo_items', `id=eq.${editingId}`, row)
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    await supabaseInsert('pos_promo_items', row)
    return NextResponse.json({ success: true, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('savePosPromoItem:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
