import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import {
  buildPosMenuScreenConfigStoreKey,
  normalizePosMenuScreenConfig,
  normalizePosMenuScreenConfigScope,
} from '@/lib/pos-menu-screen-config'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
  stampSaasTenantIdForUniqueKey,
} from '@/lib/saas-tenant-scope'

/** POS 메뉴화면 구성값 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const storeCode = String(body?.storeCode ?? '').trim() || null
    const scope = normalizePosMenuScreenConfigScope(body?.scope)
    const rowStoreKey = buildPosMenuScreenConfigStoreKey(storeCode, scope)
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode,
    })
    const writeErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'pos_menu_screen_configs',
      label: '메뉴화면 설정',
    })
    if (writeErr) {
      return NextResponse.json({ success: false, message: writeErr }, { status: 403, headers })
    }

    const normalized = normalizePosMenuScreenConfig(body || null, storeCode)
    const row = stampSaasTenantIdForUniqueKey(
      {
        store_code: rowStoreKey,
        main_category_font_size: normalized.mainCategoryFontSize,
        category_font_size: normalized.categoryFontSize,
        menu_tile_font_size: normalized.menuTileFontSize,
        menu_tile_cols: normalized.menuTileCols,
        menu_list_font_size: normalized.menuListFontSize,
        menu_list_page_size: normalized.menuListPageSize,
        kiosk_group_font_size: normalized.kioskGroupFontSize,
        updated_at: new Date().toISOString(),
      },
      tenantScope
    )

    const filter = appendSaasTenantFilter(
      `store_code=eq.${encodeURIComponent(rowStoreKey)}`,
      tenantScope,
      'pos_menu_screen_configs'
    )
    const existing = (await supabaseSelectFilter('pos_menu_screen_configs', filter, {
      limit: 1,
      select: 'id',
    })) as { id?: number }[] | null

    if (existing?.length) {
      await supabaseUpdateByFilter('pos_menu_screen_configs', filter, row)
    } else {
      await supabaseInsert('pos_menu_screen_configs', row)
    }

    return NextResponse.json({ success: true, config: { ...normalized, scope } }, { headers })
  } catch (e) {
    console.error('savePosMenuScreenConfig:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
