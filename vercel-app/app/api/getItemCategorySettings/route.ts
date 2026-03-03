import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 품목 카테고리 설정 - item_categories 전체 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('item_categories', {
      order: 'sort_order.asc',
      limit: 200,
      select: 'id,name,sort_order',
    })) as { id?: number; name?: string; sort_order?: number }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      sort_order: Number(r.sort_order) || 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItemCategorySettings:', e)
    return NextResponse.json([], { headers })
  }
}
