import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { parsePosTableLayoutJson } from '@/lib/pos-table-layout-payload'
import {
  matchPosTableLayoutRow,
  posTableLayoutStoreCodeCandidates,
  type PosTableLayoutDbRow,
} from '@/lib/pos-table-layout-store-match'

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
    let rows: PosTableLayoutDbRow[] | null = null
    for (const code of posTableLayoutStoreCodeCandidates(storeCode)) {
      try {
        const result = (await supabaseSelectFilter(
          'pos_table_layouts',
          `store_code=ilike.${encodeURIComponent(code)}`,
          { limit: 1 }
        )) as PosTableLayoutDbRow[] | null
        rows = result
        if (result?.length) break
      } catch {
        continue
      }
    }

    // 후보로 못 찾으면 전체 조회 후 정규화 비교 (예: cm-asoke ↔ CM Asoke)
    // ※ 행이 1개여도 store_code가 다르면 반환하지 않음 — 다른 매장/시드 레이아웃(테이블 1개) 오염 방지
    if (!rows?.length) {
      let allRows: PosTableLayoutDbRow[] | null = null
      try {
        allRows = (await supabaseSelect('pos_table_layouts', {
          limit: 50,
          select: 'store_code,layout_json,updated_at',
        })) as PosTableLayoutDbRow[] | null
      } catch {
        // RLS 등으로 SELECT 실패 시 빈 배열 반환
      }
      const match = matchPosTableLayoutRow(storeCode, allRows)
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
