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
    const quantity = Math.max(0, Number(body?.quantity) ?? 1)
    if (quantity <= 0) {
      return NextResponse.json({ success: false, message: 'quantity must be greater than 0' }, { headers })
    }
    const lossRate = Math.max(0, Math.min(100, Number(body?.lossRate) ?? 0))
    const optionId = body?.optionId != null ? Number(body.optionId) : null
    const ingredientType = (body?.ingredientType ?? 'food') === 'packaging' ? 'packaging' : 'food'

    if (!menuId || !itemCode) {
      return NextResponse.json({ success: false, message: 'menuId and itemCode required' }, { headers })
    }

    const ingredientRow = {
      item_code: itemCode,
      quantity,
      loss_rate: lossRate,
      ingredient_type: ingredientType,
      option_id: optionId,
    }

    if (id) {
      await supabaseUpdateByFilter('pos_menu_ingredients', `id=eq.${id}`, ingredientRow)
    } else {
      await supabaseInsert('pos_menu_ingredients', {
        menu_id: menuId,
        ...ingredientRow,
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
