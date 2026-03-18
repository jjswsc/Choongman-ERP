import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 메뉴 카테고리 목록 (distinct) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let rows: { category?: string; category_main?: string }[] | null = null
    try {
      rows = (await supabaseSelect('pos_menus', {
        select: 'category,category_main',
        limit: 20000,
      })) as { category?: string; category_main?: string }[] | null
    } catch {
      rows = (await supabaseSelect('pos_menus', {
        select: 'category',
        limit: 20000,
      })) as { category?: string }[] | null
    }

    const catSet = new Set<string>()
    const mainSet = new Set<string>()
    for (const r of rows || []) {
      const c = String(r.category || '').trim()
      if (c) catSet.add(c)
      const m = String((r as { category_main?: string }).category_main || '').trim()
      if (m) mainSet.add(m)
    }
    const categories = Array.from(catSet).sort()
    let mainCategories = Array.from(mainSet).sort()
    if (mainCategories.length === 0 && categories.length > 0) {
      mainCategories = categories
    }

    return NextResponse.json({ categories, mainCategories }, { headers })
  } catch (e) {
    console.error('getPosMenuCategories:', e)
    return NextResponse.json({ categories: [], mainCategories: [] }, { headers })
  }
}
