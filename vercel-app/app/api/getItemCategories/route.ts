import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 품목 관리 - items 테이블의 distinct category 목록 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows =
      (await supabaseSelect('items', {
        select: 'category',
        limit: 10000,
      })) as { category?: string }[] | null

    const set = new Set<string>()
    for (const r of rows || []) {
      const c = String(r.category || '').trim()
      if (c) set.add(c)
    }
    const categories = Array.from(set).sort()

    return NextResponse.json({ categories }, { headers })
  } catch (e) {
    console.error('getItemCategories:', e)
    return NextResponse.json({ categories: [] }, { headers })
  }
}
