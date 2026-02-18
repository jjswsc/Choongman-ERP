import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 목록 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_menus', {
      order: 'sort_order.asc,name.asc',
      limit: 1000,
      select: 'id,code,name,category,price,image,vat_included,is_active,sort_order,sold_out_date',
    })) as {
      id?: number
      code?: string
      name?: string
      category?: string
      price?: number
      image?: string
      vat_included?: boolean
      is_active?: boolean
      sort_order?: number
      sold_out_date?: string | null
    }[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      code: String(row.code ?? ''),
      name: String(row.name ?? ''),
      category: String(row.category ?? ''),
      price: Number(row.price) ?? 0,
      imageUrl: String(row.image ?? ''),
      vatIncluded: !!row.vat_included,
      isActive: row.is_active !== false,
      sortOrder: Number(row.sort_order) ?? 0,
      soldOutDate: row.sold_out_date ? String(row.sold_out_date).slice(0, 10) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenus:', e)
    return NextResponse.json([], { headers })
  }
}
