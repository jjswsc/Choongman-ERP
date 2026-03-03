import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 품목 관리 - item_categories 우선, 없으면 items distinct (Packaging→Packing 매핑) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const catRows = (await supabaseSelect('item_categories', {
      order: 'sort_order.asc',
      limit: 500,
      select: 'name',
    })) as { name?: string }[] | null

    if (catRows && catRows.length > 0) {
      const categories = (catRows || [])
        .map((r) => String(r.name || '').trim())
        .filter(Boolean)
      return NextResponse.json({ categories }, { headers })
    }

    const rows = (await supabaseSelect('items', {
      select: 'category',
      limit: 10000,
    })) as { category?: string }[] | null

    const set = new Set<string>(['Store Only'])
    for (const r of rows || []) {
      let c = String(r.category || '').trim()
      if (c) {
        if (c === '매장 전용') c = 'Store Only'
        else if (c === 'Packaging') c = 'Packing'
        set.add(c)
      }
    }
    const categories = Array.from(set).sort()

    return NextResponse.json({ categories }, { headers })
  } catch (e) {
    console.error('getItemCategories:', e)
    return NextResponse.json({ categories: [] }, { headers })
  }
}
