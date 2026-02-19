import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 프로모션 구성 메뉴 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const promoId = searchParams.get('promoId')?.trim()

  if (!promoId) {
    return NextResponse.json([], { headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_promo_items',
      `promo_id=eq.${encodeURIComponent(promoId)}`,
      { order: 'sort_order.asc,id.asc', limit: 100, select: 'id,promo_id,menu_id,option_id,quantity,sort_order' }
    )) as {
      id?: number
      promo_id?: number
      menu_id?: number
      option_id?: number | null
      quantity?: number
      sort_order?: number
    }[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      promoId: String(row.promo_id ?? ''),
      menuId: String(row.menu_id ?? ''),
      optionId: row.option_id != null ? String(row.option_id) : null,
      quantity: Number(row.quantity) ?? 1,
      sortOrder: Number(row.sort_order) ?? 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosPromoItems:', e)
    return NextResponse.json([], { headers })
  }
}
