import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import {
  normalizePosFloorLabels,
  parsePosTableLayoutJson,
  serializePosTableLayoutJson,
  type PosFloorLabels,
  type PosTableLayoutTableRow,
} from '@/lib/pos-table-layout-payload'
import { clampPosTableFloor } from '@/lib/pos-table-floor-match'
import {
  matchPosTableLayoutRow,
  posTableLayoutStoreCodeCandidates,
  type PosTableLayoutDbRow,
} from '@/lib/pos-table-layout-store-match'

async function findExistingPosTableLayoutRow(storeCode: string): Promise<PosTableLayoutDbRow | null> {
  for (const code of posTableLayoutStoreCodeCandidates(storeCode)) {
    try {
      const result = (await supabaseSelectFilter(
        'pos_table_layouts',
        `store_code=ilike.${encodeURIComponent(code)}`,
        { limit: 1 }
      )) as PosTableLayoutDbRow[] | null
      if (result?.[0]) return result[0]
    } catch {
      continue
    }
  }
  try {
    const allRows = (await supabaseSelect('pos_table_layouts', {
      limit: 50,
      select: 'store_code,layout_json,updated_at',
    })) as PosTableLayoutDbRow[] | null
    return matchPosTableLayoutRow(storeCode, allRows)
  } catch {
    return null
  }
}

/** POS 테이블 배치 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const layout = Array.isArray(body?.layout) ? body.layout : []
    const floorLabelsProvided = body != null && typeof body === 'object' && 'floorLabels' in body

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode required' }, { headers })
    }

    const layoutRows: PosTableLayoutTableRow[] = layout
      .filter((t: unknown) => t && typeof t === 'object' && (t as Record<string, unknown>).id)
      .map((t: Record<string, unknown>) => ({
        id: String(t.id ?? ''),
        name: String(t.name ?? ''),
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        w: Number(t.w) || 80,
        h: Number(t.h) || 60,
        floor: clampPosTableFloor(Number(t.floor ?? 1) || 1),
        shape: String(t.shape ?? 'rect'),
        seats: Number(t.seats ?? 0) || 0,
        rotation: Number(t.rotation ?? 0) || 0,
      }))

    // get과 동일 매칭으로 기존 행을 찾아 UPDATE — 표기만 다른 store_code에 INSERT하면 조회가 옛 1개 레이아웃을 반환할 수 있음
    const existing = await findExistingPosTableLayoutRow(storeCode)
    const persistStoreCode = String(existing?.store_code ?? storeCode).trim() || storeCode

    let floorLabels: PosFloorLabels = {}
    if (floorLabelsProvided) {
      floorLabels = normalizePosFloorLabels(body.floorLabels)
    } else if (existing?.layout_json != null) {
      floorLabels = parsePosTableLayoutJson(existing.layout_json).floorLabels
    }

    const layoutJson = serializePosTableLayoutJson(layoutRows, floorLabels)

    if (existing?.store_code) {
      await supabaseUpdateByFilter(
        'pos_table_layouts',
        `store_code=eq.${encodeURIComponent(persistStoreCode)}`,
        { layout_json: layoutJson, updated_at: new Date().toISOString() }
      )
    } else {
      await supabaseInsert('pos_table_layouts', {
        store_code: persistStoreCode,
        layout_json: layoutJson,
      })
    }

    return NextResponse.json({ success: true, storeCode: persistStoreCode }, { headers })
  } catch (e) {
    console.error('savePosTableLayout:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
