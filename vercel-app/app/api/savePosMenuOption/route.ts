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
    const priceModifierPackaging = body?.priceModifierPackaging != null ? Number(body.priceModifierPackaging) : null
    const sortOrder = Number(body?.sortOrder) ?? 0
    const optionType = (body?.optionType || 'substitution') as string
    const itemCode = body?.itemCode ? String(body.itemCode).trim() : null
    const quantity = Math.max(0.001, Number(body?.quantity) ?? 1)
    const optionStepValues = body?.optionStepValues && typeof body.optionStepValues === 'object' && !Array.isArray(body.optionStepValues)
      ? (body.optionStepValues as Record<string, string>)
      : null
    const sellHall = body?.sellHall != null ? !!body.sellHall : true
    const sellDelivery = body?.sellDelivery != null ? !!body.sellDelivery : true
    const sellPackaging = body?.sellPackaging != null ? !!body.sellPackaging : true

    if (!menuId || !name) {
      return NextResponse.json({ success: false, message: 'menuId and name required' }, { headers })
    }

    const rowFull: Record<string, unknown> = {
      name,
      price_modifier: priceModifier,
      price_modifier_delivery: priceModifierDelivery,
      price_modifier_packaging: priceModifierPackaging,
      sort_order: sortOrder,
      option_type: optionType === 'additive' ? 'additive' : 'substitution',
      item_code: optionType === 'additive' && itemCode ? itemCode : null,
      quantity: optionType === 'additive' ? quantity : 1,
      sell_hall: sellHall,
      sell_delivery: sellDelivery,
      sell_packaging: sellPackaging,
    }
    if (optionStepValues) rowFull.option_step_values = optionStepValues

    const rowMinimal: Record<string, unknown> = {
      name,
      price_modifier: priceModifier,
      sort_order: sortOrder,
    }

    const doSave = async (row: Record<string, unknown>) => {
      if (id) {
        await supabaseUpdateByFilter('pos_menu_options', `id=eq.${id}`, row)
      } else {
        await supabaseInsert('pos_menu_options', { menu_id: menuId, ...row })
      }
    }

    try {
      await doSave(rowFull)
    } catch (err1) {
      const errStr = String(err1)
      const rowWithoutNew = { ...rowFull }
      delete rowWithoutNew.option_step_values
      delete rowWithoutNew.price_modifier_packaging
      delete rowWithoutNew.sell_hall
      delete rowWithoutNew.sell_delivery
      delete rowWithoutNew.sell_packaging
      delete rowWithoutNew.option_type
      delete rowWithoutNew.item_code
      delete rowWithoutNew.quantity
      if (priceModifierDelivery != null) (rowWithoutNew as Record<string, unknown>).price_modifier_delivery = priceModifierDelivery
      try {
        await doSave(rowWithoutNew)
      } catch (err2) {
        await doSave(rowMinimal)
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
