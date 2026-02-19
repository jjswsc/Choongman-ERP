import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 프로모션 목록 + 구성 메뉴 (재고 차감용) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const promos = (await supabaseSelect('pos_promos', {
      order: 'sort_order.asc,name.asc',
      limit: 500,
      select: 'id,code,name,category,price,price_delivery,vat_included,is_active,sort_order',
    })) as {
      id?: number
      code?: string
      name?: string
      category?: string
      price?: number
      price_delivery?: number | null
      is_active?: boolean
    }[] | null

    const promoList = (promos || []).map((p) => ({
      id: String(p.id ?? ''),
      code: String(p.code ?? ''),
      name: String(p.name ?? ''),
      category: String(p.category ?? ''),
      price: Number(p.price) ?? 0,
      priceDelivery: p.price_delivery != null ? Number(p.price_delivery) : null,
      isActive: p.is_active !== false,
    }))

    const itemsByPromo: Record<string, { menuId: string; optionId: string | null; quantity: number }[]> = {}
    for (const p of promoList) {
      const rows = (await supabaseSelectFilter(
        'pos_promo_items',
        `promo_id=eq.${p.id}`,
        { order: 'sort_order.asc', limit: 50, select: 'menu_id,option_id,quantity' }
      )) as { menu_id?: number; option_id?: number | null; quantity?: number }[] | null
      itemsByPromo[p.id] = (rows || []).map((r) => ({
        menuId: String(r.menu_id ?? ''),
        optionId: r.option_id != null ? String(r.option_id) : null,
        quantity: Number(r.quantity) ?? 1,
      }))
    }

    return NextResponse.json(
      promoList.map((p) => ({ ...p, items: itemsByPromo[p.id] || [] })),
      { headers }
    )
  } catch (e) {
    console.error('getPosPromosWithItems:', e)
    return NextResponse.json([], { headers })
  }
}
