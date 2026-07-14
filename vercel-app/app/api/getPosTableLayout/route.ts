import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { parsePosTableLayoutJson } from '@/lib/pos-table-layout-payload'

/** POS 테이블 배치 조회 (매장별). 관리자 테이블 구성과 동일한 DB(pos_table_layouts) 사용. */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!storeCode) {
    return NextResponse.json({ layout: [], floorLabels: {}, occupiedTables: [] }, { headers })
  }

  try {
    // 매장 코드 변형 후보 (하이픈/공백, CM 접두사 등 — DB store_code와 형식이 달라도 매칭되도록)
    const candidates = [
      storeCode,
      storeCode.startsWith('CM ') ? storeCode.slice(3).trim() : `CM ${storeCode}`.trim(),
      storeCode.replace(/^CM\s+/i, '').trim(),
      storeCode.replace(/-/g, ' ').trim(),
      storeCode.replace(/\s+/g, '-').trim(),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i)

    type Row = { store_code?: string; layout_json?: string | unknown[] | Record<string, unknown>; updated_at?: string }
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

    // 후보로 못 찾으면 전체 조회 후 정규화해서 비교 (예: cm-asoke ↔ CM Asoke)
    if (!rows?.length) {
      let allRows: Row[] | null = null
      try {
        allRows = (await supabaseSelect('pos_table_layouts', {
          limit: 50,
          select: 'store_code,layout_json,updated_at',
        })) as Row[] | null
      } catch {
        // RLS 등으로 SELECT 실패 시 빈 배열 반환
      }
      const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/-/g, ' ')
      const reqNorm = normalize(storeCode)
      const match =
        (allRows || []).find(
          (r) => {
            const dbNorm = normalize(String(r.store_code ?? ''))
            return dbNorm === reqNorm || dbNorm.includes(reqNorm) || reqNorm.includes(dbNorm)
          }
        ) ?? (allRows?.length === 1 ? allRows[0] : null)
      if (match) rows = [match]
    }

    const raw = rows?.[0]
    const parsed = parsePosTableLayoutJson(raw?.layout_json)

    // 관리자 테이블 구성과 POS 터미널이 항상 동일한 데이터를 보이도록, DB에 없으면 빈 배열만 반환.
    return NextResponse.json(
      { layout: parsed.tables, floorLabels: parsed.floorLabels, storeCode },
      { headers }
    )
  } catch (e) {
    console.error('getPosTableLayout:', e)
    return NextResponse.json({ layout: [], floorLabels: {}, storeCode }, { headers })
  }
}
