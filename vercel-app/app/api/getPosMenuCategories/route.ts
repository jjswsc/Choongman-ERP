import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 카테고리 목록 (distinct) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_menus', {
      select: 'category',
      limit: 5000,
    })) as { category?: string }[] | null

    const set = new Set<string>()
    for (const r of rows || []) {
      const c = String(r.category || '').trim()
      if (c) set.add(c)
    }
    const categories = Array.from(set).sort()

    return NextResponse.json({ categories }, { headers })
  } catch (e) {
    console.error('getPosMenuCategories:', e)
    return NextResponse.json({ categories: [] }, { headers })
  }
}
