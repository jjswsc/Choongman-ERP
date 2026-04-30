import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

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
      choiceGroup?: string | null
      choicePickCount?: number | null
    }

    const promoId = Number(body.promoId)
    const menuId = Number(body.menuId)
    const editingId = body.id ? String(body.id).trim() : null

    if (!promoId || !menuId) {
      return NextResponse.json({ success: false, message: 'promoId와 menuId가 필요합니다.' }, { headers })
    }

    const optionId = body.optionId != null ? Number(body.optionId) : null
    const choiceGroup = String(body.choiceGroup ?? '').trim() || null
    const choicePickCountRaw = body.choicePickCount
    const choicePickCount =
      choicePickCountRaw == null || String(choicePickCountRaw).trim() === ''
        ? null
        : Math.max(1, Math.floor(Number(choicePickCountRaw) || 1))
    const row = {
      promo_id: promoId,
      menu_id: menuId,
      option_id: optionId,
      quantity: Number(body.quantity) ?? 1,
      sort_order: Number(body.sortOrder) ?? 0,
      choice_group: choiceGroup,
      choice_pick_count: choiceGroup ? choicePickCount ?? 1 : null,
    }

    if (editingId) {
      try {
        await supabaseUpdateByFilter('pos_promo_items', `id=eq.${editingId}`, row)
      } catch {
        await supabaseUpdateByFilter('pos_promo_items', `id=eq.${editingId}`, {
          promo_id: promoId,
          menu_id: menuId,
          option_id: optionId,
          quantity: Number(body.quantity) ?? 1,
          sort_order: Number(body.sortOrder) ?? 0,
        })
      }
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    const dupFilter =
      optionId == null
        ? `promo_id=eq.${promoId}&menu_id=eq.${menuId}&option_id=is.null`
        : `promo_id=eq.${promoId}&menu_id=eq.${menuId}&option_id=eq.${optionId}`
    const dup = (await supabaseSelectFilter('pos_promo_items', dupFilter, {
      select: 'id,quantity',
      limit: 1,
    })) as { id?: number; quantity?: number }[] | null

    if (dup?.[0]?.id) {
      await supabaseUpdateByFilter('pos_promo_items', `id=eq.${dup[0].id}`, {
        quantity: Number(dup[0].quantity || 0) + (Number(body.quantity) || 1),
        sort_order: Number(body.sortOrder) ?? 0,
      })
      return NextResponse.json({ success: true, message: '기존 구성에 수량을 합산했습니다.' }, { headers })
    }

    try {
      await supabaseInsert('pos_promo_items', row)
    } catch {
      await supabaseInsert('pos_promo_items', {
        promo_id: promoId,
        menu_id: menuId,
        option_id: optionId,
        quantity: Number(body.quantity) ?? 1,
        sort_order: Number(body.sortOrder) ?? 0,
      })
    }
    return NextResponse.json({ success: true, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('savePosPromoItem:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
