import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  DEFAULT_POS_MENU_SCREEN_CONFIG,
  normalizePosMenuScreenConfig,
} from '@/lib/pos-menu-screen-config'

/** POS 메뉴화면 구성값 조회 (전역 + 매장 오버라이드) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  try {
    const rows = (await supabaseSelectFilter(
      'pos_menu_screen_configs',
      storeCode
        ? `or(store_code.eq.${encodeURIComponent(storeCode)},store_code.is.null)`
        : 'store_code.is.null',
      {
        limit: 20,
        select: 'store_code,main_category_font_size,category_font_size,menu_tile_font_size,menu_tile_cols,menu_list_font_size,menu_list_page_size,kiosk_group_font_size,updated_at',
      }
    )) as {
      store_code?: string | null
      main_category_font_size?: number
      category_font_size?: number
      menu_tile_font_size?: number
      menu_tile_cols?: number
      menu_list_font_size?: number
      menu_list_page_size?: number
      kiosk_group_font_size?: number
      updated_at?: string
    }[] | null

    const list = Array.isArray(rows) ? rows : []
    const globalRow = list.find((r) => !r.store_code)
    const storeRow = storeCode ? list.find((r) => String(r.store_code || '') === storeCode) : null
    const merged = { ...(globalRow || {}), ...(storeRow || {}) }
    const normalized = normalizePosMenuScreenConfig(
      {
        storeCode: storeCode || null,
        mainCategoryFontSize: merged.main_category_font_size,
        categoryFontSize: merged.category_font_size,
        menuTileFontSize: merged.menu_tile_font_size,
        menuTileCols: merged.menu_tile_cols,
        menuListFontSize: merged.menu_list_font_size,
        menuListPageSize: merged.menu_list_page_size,
        kioskGroupFontSize: merged.kiosk_group_font_size,
      },
      storeCode || null
    )

    return NextResponse.json(
      {
        ...DEFAULT_POS_MENU_SCREEN_CONFIG,
        ...normalized,
        updatedAt: merged.updated_at || null,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosMenuScreenConfig:', e)
    return NextResponse.json(
      {
        ...DEFAULT_POS_MENU_SCREEN_CONFIG,
        storeCode: storeCode || null,
        updatedAt: null,
      },
      { headers }
    )
  }
}
