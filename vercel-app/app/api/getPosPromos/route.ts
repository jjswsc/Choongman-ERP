import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 프로모션 목록 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_promos', {
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
      vat_included?: boolean
      is_active?: boolean
      sort_order?: number
    }[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      category: String(row.category ?? ''),
      price: Number(row.price) ?? 0,
      priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
      vatIncluded: !!row.vat_included,
      isActive: row.is_active !== false,
      sortOrder: Number(row.sort_order) ?? 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosPromos:', e)
    return NextResponse.json([], { headers })
  }
}
