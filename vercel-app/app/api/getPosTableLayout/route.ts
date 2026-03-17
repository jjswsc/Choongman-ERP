import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const FLOOR_W = 720
const FLOOR_H = 480

/** DB 초기화 시 복원용 기본 테이블 배치 (1F 6개) */
function getDefaultTableLayout(): { id: string; name: string; x: number; y: number; w: number; h: number; floor: number; shape: string; seats: number; rotation: number }[] {
  return [
    { id: 't1f1', name: '1F-1', x: 48, y: 48, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
    { id: 't1f2', name: '1F-2', x: 156, y: 48, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
    { id: 't1f3', name: '1F-3', x: 264, y: 48, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
    { id: 't1f4', name: '1F-4', x: 48, y: 180, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
    { id: 't1f5', name: '1F-5', x: 156, y: 180, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
    { id: 't1f6', name: '1F-6', x: 264, y: 180, w: 80, h: 60, floor: 1, shape: 'rect', seats: 4, rotation: 0 },
  ]
}

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

    type Row = { store_code?: string; layout_json?: string | unknown[]; updated_at?: string }
    let rows: Row[] | null = null
    for (const code of candidates) {
      try {
        const result = (await supabaseSelectFilter(
          'pos_table_layouts',
          `store_code=ilike.${encodeURIComponent(code)}`,
          { limit: 1 }
        )) as Row[] | null
        rows = result
        if (result?.length) break
      } catch {
        continue
      }
    }

    if (!rows?.length) {
      const allRows = (await supabaseSelect('pos_table_layouts', {
        limit: 50,
        select: 'store_code,layout_json,updated_at',
      })) as Row[] | null
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
    let layout: { id: string; name: string; x: number; y: number; w: number; h: number; floor?: number; shape?: string; seats?: number; rotation?: number }[] = []
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

    // DB에 데이터가 없을 때 로컬/개발 환경에서 기본 예시 레이아웃 제공 (복원용)
    let isFallback = false
    const isDev = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'development'
    if (layout.length === 0 && isDev && storeCode) {
      layout = getDefaultTableLayout()
      isFallback = true
    }

    return NextResponse.json({ layout, storeCode, isFallback }, { headers })
  } catch (e) {
    console.error('getPosTableLayout:', e)
    return NextResponse.json({ layout: [], storeCode }, { headers })
  }
}
