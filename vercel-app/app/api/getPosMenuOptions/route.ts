import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 메뉴 옵션 목록 조회 (menu_id별 필터 가능) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const menuId = searchParams.get('menuId')?.trim()

  try {
    const selectCols = 'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,option_type,item_code,quantity'
    let rows: { id?: number; menu_id?: number; name?: string; price_modifier?: number; price_modifier_delivery?: number | null; sort_order?: number; option_type?: string; item_code?: string | null; quantity?: number }[] | null
    try {
      if (menuId) {
        rows = (await supabaseSelectFilter(
          'pos_menu_options',
          `menu_id=eq.${encodeURIComponent(menuId)}`,
          { order: 'sort_order.asc,name.asc', limit: 200, select: selectCols }
        )) as typeof rows
      } else {
        rows = (await supabaseSelect('pos_menu_options', {
          order: 'menu_id.asc,sort_order.asc,name.asc',
          limit: 1000,
          select: selectCols,
        })) as typeof rows
      }
    } catch {
      const basicCols = 'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order'
      if (menuId) {
        rows = (await supabaseSelectFilter('pos_menu_options', `menu_id=eq.${encodeURIComponent(menuId)}`, { order: 'sort_order.asc,name.asc', limit: 200, select: basicCols })) as typeof rows
      } else {
        rows = (await supabaseSelect('pos_menu_options', { order: 'menu_id.asc,sort_order.asc,name.asc', limit: 1000, select: basicCols })) as typeof rows
      }
    }

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      menuId: String(row.menu_id ?? ''),
      name: String(row.name ?? ''),
      priceModifier: Number(row.price_modifier) ?? 0,
      priceModifierDelivery: row.price_modifier_delivery != null ? Number(row.price_modifier_delivery) : null,
      sortOrder: Number(row.sort_order) ?? 0,
      optionType: (row.option_type || 'substitution') as 'substitution' | 'additive',
      itemCode: row.item_code ? String(row.item_code).trim() : null,
      quantity: Number(row.quantity) ?? 1,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuOptions:', e)
    return NextResponse.json([], { headers })
  }
}
