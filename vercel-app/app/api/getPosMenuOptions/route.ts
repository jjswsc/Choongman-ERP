import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 옵션 목록 (menu_id별) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_menu_options', {
      order: 'menu_id.asc,sort_order.asc,name.asc',
      limit: 2000,
      select: 'id,menu_id,name,price_modifier,sort_order',
    })) as {
      id?: number
      menu_id?: number
      name?: string
      price_modifier?: number
      sort_order?: number
    }[] | null

    const list = (rows || []).map((r) => ({
      id: String(r.id ?? ''),
      menuId: String(r.menu_id ?? ''),
      name: String(r.name ?? ''),
      priceModifier: Number(r.price_modifier) ?? 0,
      sortOrder: Number(r.sort_order) ?? 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuOptions:', e)
    return NextResponse.json([], { headers })
  }
}
