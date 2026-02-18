import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 메뉴 재료(BOM) 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id
    const menuId = Number(body?.menuId)
    const itemCode = String(body?.itemCode ?? '').trim()
    const quantity = Math.max(0.001, Number(body?.quantity) ?? 1)

    if (!menuId || !itemCode) {
      return NextResponse.json({ success: false, message: 'menuId and itemCode required' }, { headers })
    }

    if (id) {
      await supabaseUpdateByFilter('pos_menu_ingredients', `id=eq.${id}`, {
        item_code: itemCode,
        quantity,
      })
    } else {
      await supabaseInsert('pos_menu_ingredients', {
        menu_id: menuId,
        item_code: itemCode,
        quantity,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosMenuIngredient:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
