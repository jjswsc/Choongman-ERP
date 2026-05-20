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
    if (optionId != null && Number.isFinite(optionId) && optionId > 0) {
      const optRows = (await supabaseSelectFilter(
        'pos_menu_options',
        `id=eq.${encodeURIComponent(String(optionId))}`,
        { limit: 1, select: 'id,menu_id' }
      )) as { id?: number; menu_id?: number }[] | null
      const opt = optRows?.[0]
      const optMenuId = Number(opt?.menu_id ?? 0)
      if (!opt?.id || !optMenuId) {
        return NextResponse.json({ success: false, message: '선택 옵션을 찾을 수 없습니다.' }, { headers })
      }
      if (optMenuId !== menuId) {
        return NextResponse.json(
          {
            success: false,
            message: '프로모 구성의 옵션이 선택 메뉴와 일치하지 않습니다. 메뉴/옵션을 다시 선택해 주세요.',
          },
          { headers }
        )
      }
    }
    const choiceGroup = String(body.choiceGroup ?? '').trim() || null
    const choicePickCountRaw = body.choicePickCount
    const choicePickCount =
      choicePickCountRaw == null || String(choicePickCountRaw).trim() === ''
        ? null
        : Math.max(1, Math.floor(Number(choicePickCountRaw) || 1))
    const rowWithChoice = {
      promo_id: promoId,
      menu_id: menuId,
      option_id: optionId,
      quantity: Number(body.quantity) ?? 1,
      sort_order: Number(body.sortOrder) ?? 0,
      choice_group: choiceGroup,
      choice_pick_count: choiceGroup ? choicePickCount ?? 1 : null,
    }
    const rowBase = {
      promo_id: promoId,
      menu_id: menuId,
      option_id: optionId,
      quantity: Number(body.quantity) ?? 1,
      sort_order: Number(body.sortOrder) ?? 0,
    }

    const writeRow = async (idFilter: string, withChoice: boolean) => {
      const payload = withChoice ? rowWithChoice : rowBase
      try {
        await supabaseUpdateByFilter('pos_promo_items', idFilter, payload)
      } catch (e) {
        if (!withChoice) throw e
        await supabaseUpdateByFilter('pos_promo_items', idFilter, rowBase)
      }
    }

    if (editingId) {
      await writeRow(`id=eq.${editingId}`, true)
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
      const mergePayload = {
        quantity: Number(dup[0].quantity || 0) + (Number(body.quantity) || 1),
        sort_order: Number(body.sortOrder) ?? 0,
      }
      try {
        await supabaseUpdateByFilter('pos_promo_items', `id=eq.${dup[0].id}`, {
          ...mergePayload,
          choice_group: rowWithChoice.choice_group,
          choice_pick_count: rowWithChoice.choice_pick_count,
        })
      } catch {
        await supabaseUpdateByFilter('pos_promo_items', `id=eq.${dup[0].id}`, mergePayload)
      }
      return NextResponse.json({ success: true, message: '기존 구성에 수량을 합산했습니다.' }, { headers })
    }

    try {
      await supabaseInsert('pos_promo_items', rowWithChoice)
    } catch {
      await supabaseInsert('pos_promo_items', rowBase)
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
