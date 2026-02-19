import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 매장 발주 내역 필터용: items 테이블의 distinct category, vendor 목록 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('items', {
      select: 'category,vendor',
      limit: 10000,
    })) as { category?: string; vendor?: string }[] | null

    const categorySet = new Set<string>()
    const vendorSet = new Set<string>()
    for (const r of rows || []) {
      const c = String(r.category || '').trim()
      const v = String(r.vendor || '').trim()
      if (c) categorySet.add(c)
      if (v) vendorSet.add(v)
    }

    return NextResponse.json(
      {
        categories: Array.from(categorySet).sort(),
        vendors: Array.from(vendorSet).sort(),
      },
      { headers }
    )
  } catch (e) {
    console.error('getOrderFilterOptions:', e)
    return NextResponse.json({ categories: [], vendors: [] }, { headers })
  }
}
