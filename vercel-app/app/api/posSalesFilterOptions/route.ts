/**
 * 매출 필터 옵션 (매장/포스 목록). importId 기준.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const importId = searchParams.get('importId')?.trim()

    if (!importId) {
      return NextResponse.json({ posOptions: [] }, { headers })
    }

    const rows = (await supabaseSelectFilter(
      'pos_sales_details',
      `import_id=eq.${encodeURIComponent(importId)}`,
      { limit: 5000, select: 'pos' }
    )) as { pos?: string }[]

    const posSet = new Set<string>()
    for (const r of rows) {
      const p = String(r.pos || '').trim()
      if (p) posSet.add(p)
    }
    const posOptions = Array.from(posSet).sort()

    return NextResponse.json({ posOptions }, { headers })
  } catch (e) {
    console.error('posSalesFilterOptions:', e)
    return NextResponse.json({ posOptions: [] }, { headers })
  }
}
