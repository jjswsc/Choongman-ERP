import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  DEFAULT_POS_MENU_SCREEN_CONFIG,
  buildPosMenuScreenConfigStoreKey,
  normalizePosMenuScreenConfig,
  normalizePosMenuScreenConfigScope,
} from '@/lib/pos-menu-screen-config'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** POS 메뉴화면 구성값 조회 (전역 + 매장 오버라이드) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const scope = normalizePosMenuScreenConfigScope(searchParams.get('scope'))

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode,
    })

    const storeScopedKey = buildPosMenuScreenConfigStoreKey(storeCode || null, scope)
    const globalScopedKey = buildPosMenuScreenConfigStoreKey(null, scope)
    const baseFilter = storeCode
      ? `or(store_code.eq.${encodeURIComponent(storeScopedKey)},store_code.eq.${encodeURIComponent(storeCode)},store_code.eq.${encodeURIComponent(globalScopedKey)},store_code.is.null)`
      : `or(store_code.eq.${encodeURIComponent(globalScopedKey)},store_code.is.null)`
    const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'pos_menu_screen_configs')
    const rows = (await supabaseSelectFilter('pos_menu_screen_configs', filter, {
      limit: 20,
      select:
        'store_code,main_category_font_size,category_font_size,menu_tile_font_size,menu_tile_cols,menu_list_font_size,menu_list_page_size,kiosk_group_font_size,updated_at',
    })) as {
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
    const globalRow =
      list.find((r) => String(r.store_code || '') === globalScopedKey) ||
      list.find((r) => !r.store_code)
    const storeRow = storeCode
      ? list.find((r) => String(r.store_code || '') === storeScopedKey) ||
        list.find((r) => String(r.store_code || '') === storeCode)
      : null
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
        scope,
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
        scope,
        updatedAt: null,
      },
      { headers }
    )
  }
}
