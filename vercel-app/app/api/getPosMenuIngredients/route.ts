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
    const rows = (await supabaseSelectFilter(
      'pos_menu_ingredients',
      `menu_id=eq.${encodeURIComponent(menuId)}`,
      { order: 'id.asc', limit: 200 }
    )) as { id?: number; menu_id?: number; item_code?: string; quantity?: number }[] | null

    const list = (rows || []).map((r) => ({
      id: String(r.id ?? ''),
      menuId: String(r.menu_id ?? ''),
      itemCode: String(r.item_code ?? ''),
      quantity: Number(r.quantity) ?? 1,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuIngredients:', e)
    return NextResponse.json([], { headers })
  }
}
