import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

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
    const candidates = [
      storeCode,
      storeCode.startsWith('CM ') ? storeCode.slice(3).trim() : `CM ${storeCode}`.trim(),
      storeCode.replace(/^CM\s+/i, '').trim(),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i)

    let rows: { store_code?: string; layout_json?: string | unknown[]; updated_at?: string }[] | null = null
    for (const code of candidates) {
      try {
        rows = (await supabaseSelectFilter(
          'pos_table_layouts',
          `store_code=ilike.${encodeURIComponent(code)}`,
          { limit: 1 }
        )) as typeof rows
        if (rows?.length) break
      } catch {
        continue
      }
    }

    if (!rows?.length) {
      const allRows = (await supabaseSelect('pos_table_layouts', {
        limit: 50,
        select: 'store_code,layout_json,updated_at',
      })) as typeof rows
      const reqLower = storeCode.toLowerCase()
      const match =
        (allRows || []).find(
          (r) =>
            (r.store_code ?? '').toLowerCase() === reqLower ||
            (r.store_code ?? '').toLowerCase().includes(reqLower) ||
            reqLower.includes((r.store_code ?? '').toLowerCase())
        ) ?? (allRows?.length === 1 ? allRows[0] : null)
      if (match) rows = [match]
    }

    const raw = rows?.[0]
    let layout: { id: string; name: string; x: number; y: number; w: number; h: number; floor?: number }[] = []
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
          floor: Math.min(3, Math.max(1, Number(t.floor ?? 1) || 1)),
          shape: String(t.shape ?? 'rect'),
          seats: Number(t.seats ?? 0) || 0,
          rotation: Number(t.rotation ?? 0) || 0,
        }))
        .filter((t) => t.id)
    }

    return NextResponse.json({ layout, storeCode }, { headers })
  } catch (e) {
    console.error('getPosTableLayout:', e)
    return NextResponse.json({ layout: [], storeCode }, { headers })
  }
}
