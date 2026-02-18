import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 메뉴 옵션 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id
    const menuId = Number(body?.menuId)
    const name = String(body?.name ?? '').trim()
    const priceModifier = Number(body?.priceModifier) ?? 0
    const sortOrder = Number(body?.sortOrder) ?? 0

    if (!menuId || !name) {
      return NextResponse.json({ success: false, message: 'menuId and name required' }, { headers })
    }

    if (id) {
      await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, {
        name,
        price_modifier: priceModifier,
        sort_order: sortOrder,
      })
    } else {
      await supabaseInsert('pos_menu_options', {
        menu_id: menuId,
        name,
        price_modifier: priceModifier,
        sort_order: sortOrder,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosMenuOption:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
