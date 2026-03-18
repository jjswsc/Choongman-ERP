import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 메뉴판 구성 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || '').trim()
  const boardType = String(searchParams.get('boardType') || '').trim()

  try {
    const filters: string[] = []
    if (storeCode) filters.push(`store_code=eq.${encodeURIComponent(storeCode)}`)
    if (boardType) filters.push(`board_type=eq.${encodeURIComponent(boardType)}`)
    const filter = filters.join('&')
    const rows = (await supabaseSelectFilter('pos_menu_boards', filter || 'id=gt.0', {
      limit: 5000,
      order: 'store_code.asc,board_type.asc,board_name.asc',
      select: 'id,store_code,board_type,board_name,group_grid_cols,group_grid_rows,menu_grid_cols,menu_grid_rows,resolution_width,resolution_height,group_count,menu_count,is_active,created_at,updated_at',
    })) as {
      id?: number
      store_code?: string
      board_type?: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
      board_name?: string
      group_grid_cols?: number
      group_grid_rows?: number
      menu_grid_cols?: number
      menu_grid_rows?: number
      resolution_width?: number
      resolution_height?: number
      group_count?: number
      menu_count?: number
      is_active?: boolean
      created_at?: string
      updated_at?: string
    }[] | null
    const list = (rows || []).map((r) => ({
      id: Number(r.id) || 0,
      storeCode: String(r.store_code || ''),
      boardType: r.board_type || 'dine_in',
      boardName: String(r.board_name || ''),
      groupGridCols: Number(r.group_grid_cols) || 5,
      groupGridRows: Number(r.group_grid_rows) || 2,
      menuGridCols: Number(r.menu_grid_cols) || 5,
      menuGridRows: Number(r.menu_grid_rows) || 5,
      resolutionWidth: Number(r.resolution_width) || 1024,
      resolutionHeight: Number(r.resolution_height) || 768,
      groupCount: Number(r.group_count) || 0,
      menuCount: Number(r.menu_count) || 0,
      isActive: r.is_active !== false,
      createdAt: r.created_at || '',
      updatedAt: r.updated_at || '',
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosMenuBoards:', e)
    return NextResponse.json([], { headers })
  }
}
