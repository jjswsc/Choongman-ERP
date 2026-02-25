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
    const priceModifierDelivery = body?.priceModifierDelivery != null ? Number(body.priceModifierDelivery) : null
    const sortOrder = Number(body?.sortOrder) ?? 0
    const optionType = (body?.optionType || 'substitution') as string
    const itemCode = body?.itemCode ? String(body.itemCode).trim() : null
    const quantity = Math.max(0.001, Number(body?.quantity) ?? 1)

    if (!menuId || !name) {
      return NextResponse.json({ success: false, message: 'menuId and name required' }, { headers })
    }

    const rowFull = {
      name,
      price_modifier: priceModifier,
      price_modifier_delivery: priceModifierDelivery,
      sort_order: sortOrder,
      option_type: optionType === 'additive' ? 'additive' : 'substitution',
      item_code: optionType === 'additive' && itemCode ? itemCode : null,
      quantity: optionType === 'additive' ? quantity : 1,
    }
    const rowBasic = { name, price_modifier: priceModifier, price_modifier_delivery: priceModifierDelivery, sort_order: sortOrder }

    try {
      if (id) {
        await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, rowFull)
      } else {
        await supabaseInsert('pos_menu_options', { menu_id: menuId, ...rowFull })
      }
    } catch {
      if (id) {
        await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, rowBasic)
      } else {
        await supabaseInsert('pos_menu_options', { menu_id: menuId, ...rowBasic })
      }
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
