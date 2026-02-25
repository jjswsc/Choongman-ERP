import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 메뉴 재료(BOM) 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()

  if (!menuId) {
    return NextResponse.json([], { headers })
  }

  try {
    const optionId = searchParams.get('optionId')?.trim()
    let filter = `menu_id=eq.${encodeURIComponent(menuId)}`

    let rows: { id?: number; menu_id?: number; item_code?: string; quantity?: number; loss_rate?: number; option_id?: number | null }[] | null
    try {
      if (!optionId || optionId === 'null') {
        filter += '&option_id=is.null'
      } else {
        filter += `&option_id=eq.${encodeURIComponent(optionId)}`
      }
      rows = (await supabaseSelectFilter('pos_menu_ingredients', filter, { order: 'id.asc', limit: 200 })) as typeof rows
    } catch {
      rows = (await supabaseSelectFilter('pos_menu_ingredients', `menu_id=eq.${encodeURIComponent(menuId)}`, { order: 'id.asc', limit: 200 })) as typeof rows
    }

    const list = (rows || []).map((r) => ({
      id: String(r.id ?? ''),
      menuId: String(r.menu_id ?? ''),
      itemCode: String(r.item_code ?? ''),
      quantity: Number(r.quantity) ?? 1,
      lossRate: Number(r.loss_rate) ?? 0,
      optionId: r.option_id != null ? String(r.option_id) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuIngredients:', e)
    return NextResponse.json([], { headers })
  }
}
