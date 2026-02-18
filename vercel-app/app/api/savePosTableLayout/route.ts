import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 테이블 배치 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const layout = Array.isArray(body?.layout) ? body.layout : []

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const layoutRows = layout
      .filter((t: unknown) => t && typeof t === 'object' && (t as Record<string, unknown>).id)
      .map((t: Record<string, unknown>) => ({
        id: String(t.id ?? ''),
        name: String(t.name ?? ''),
        x: Number(t.x) ?? 0,
        y: Number(t.y) ?? 0,
        w: Number(t.w) ?? 80,
        h: Number(t.h) ?? 60,
      }))

    const existing = (await supabaseSelectFilter(
      'pos_table_layouts',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 1 }
    )) as { store_code?: string }[] | null

    if (existing?.length) {
      await supabaseUpdateByFilter(
        'pos_table_layouts',
        `store_code=eq.${encodeURIComponent(storeCode)}`,
        { layout_json: layoutRows, updated_at: new Date().toISOString() }
      )
    } else {
      await supabaseInsert('pos_table_layouts', {
        store_code: storeCode,
        layout_json: layoutRows,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosTableLayout:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
