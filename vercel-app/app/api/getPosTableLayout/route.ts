import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 테이블 배치 조회 (매장별) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!storeCode) {
    return NextResponse.json({ layout: [], occupiedTables: [] }, { headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'pos_table_layouts',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { store_code?: string; layout_json?: string | unknown[]; updated_at?: string }[] | null

    const raw = rows?.[0]
    let layout: { id: string; name: string; x: number; y: number; w: number; h: number }[] = []
    if (raw?.layout_json) {
      const arr = Array.isArray(raw.layout_json) ? raw.layout_json : []
      layout = arr
        .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object' && t !== null))
        .map((t) => ({
          id: String(t.id ?? ''),
          name: String(t.name ?? ''),
          x: Number(t.x) ?? 0,
          y: Number(t.y) ?? 0,
          w: Number(t.w) ?? 80,
          h: Number(t.h) ?? 60,
        }))
        .filter((t) => t.id)
    }

    return NextResponse.json({ layout, storeCode }, { headers })
  } catch (e) {
    console.error('getPosTableLayout:', e)
    return NextResponse.json({ layout: [], storeCode }, { headers })
  }
}
