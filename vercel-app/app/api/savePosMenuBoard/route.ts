import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

const intOr = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

/** POS 메뉴판 구성 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : null
    const storeCode = String(body?.storeCode || '').trim()
    const boardType = String(body?.boardType || 'dine_in').trim()
    const boardName = String(body?.boardName || '').trim()
    if (!storeCode || !boardName) {
      return NextResponse.json({ success: false, message: 'storeCode/boardName이 필요합니다.' }, { headers })
    }

    const row = {
      store_code: storeCode,
      board_type: boardType,
      board_name: boardName,
      group_grid_cols: Math.max(1, intOr(body?.groupGridCols, 5)),
      group_grid_rows: Math.max(1, intOr(body?.groupGridRows, 2)),
      menu_grid_cols: Math.max(1, intOr(body?.menuGridCols, 5)),
      menu_grid_rows: Math.max(1, intOr(body?.menuGridRows, 5)),
      resolution_width: Math.max(320, intOr(body?.resolutionWidth, 1024)),
      resolution_height: Math.max(240, intOr(body?.resolutionHeight, 768)),
      group_count: Math.max(0, intOr(body?.groupCount, 0)),
      menu_count: Math.max(0, intOr(body?.menuCount, 0)),
      is_active: body?.isActive !== false,
      updated_at: new Date().toISOString(),
    }

    if (id && id > 0) {
      await supabaseUpdateByFilter('pos_menu_boards', `id=eq.${id}`, row)
      return NextResponse.json({ success: true }, { headers })
    }

    const filter = `store_code=eq.${encodeURIComponent(storeCode)}&board_type=eq.${encodeURIComponent(boardType)}&board_name=eq.${encodeURIComponent(boardName)}`
    const existing = (await supabaseSelectFilter('pos_menu_boards', filter, { limit: 1, select: 'id' })) as { id?: number }[] | null
    if (existing?.length) {
      await supabaseUpdateByFilter('pos_menu_boards', filter, row)
    } else {
      await supabaseInsert('pos_menu_boards', { ...row, created_at: new Date().toISOString() })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosMenuBoard:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
