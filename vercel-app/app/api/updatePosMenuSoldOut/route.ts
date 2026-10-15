import { NextRequest, NextResponse } from 'next/server'
import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { canAccessPosOrder } from '@/lib/permissions'
import { stripTenantPrefixedStoreCode } from '@/lib/pos-operating-store-code'
import { normalizePosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'
import { setStoreMenuSoldOut } from '@/lib/pos-menu-store-sold-out-server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/**
 * 메뉴 품절 토글.
 * - storeCode 있음 → 해당 매장만 (pos_menu_store_sold_out). scope=store 면 หน้าร้าน만(배달은 판매)
 * - storeCode 없음 → 전역 pos_menus.sold_out_date (본사 관리자 호환)
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'any')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!
    if (!canAccessPosOrder(auth.role || '')) {
      return NextResponse.json(
        { success: false, message: '메뉴 품절 변경 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const body = await req.json()
    const id = body?.id
    const soldOut = body?.soldOut === true
    const scope = normalizePosMenuSoldOutScope(body?.scope)
    const storeCode = stripTenantPrefixedStoreCode(
      body?.storeCode ?? body?.store_code ?? auth.store ?? ''
    )

    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { headers })
    }

    // 매장 POS·직원: 항상 매장별
    if (storeCode) {
      const result = await setStoreMenuSoldOut({
        menuId: id,
        storeCode,
        soldOut,
        scope,
      })
      if (!result.schemaReady) {
        return NextResponse.json(
          {
            success: false,
            message:
              '매장별 품절 테이블이 없습니다. SQL pos_menu_store_sold_out_01_create.sql 을 먼저 실행해 주세요.',
            code: 'store_sold_out_schema_missing',
          },
          { status: 503, headers }
        )
      }
      if (!result.scopeSchemaReady) {
        return NextResponse.json(
          {
            success: false,
            message:
              '「หน้าร้าน만 품절」 컬럼이 없습니다. SQL pos_menu_store_sold_out_04_scope.sql 을 먼저 실행해 주세요.',
            code: 'store_sold_out_scope_schema_missing',
          },
          { status: 503, headers }
        )
      }
      return NextResponse.json(
        {
          success: true,
          soldOutDate: result.soldOutDate,
          soldOutScope: result.soldOutScope,
          storeCode,
          scope: 'store',
        },
        { headers }
      )
    }

    // 본사 등 매장 미지정: 전역 (레거시)
    const today = bangkokTodayYmd()
    const row = { sold_out_date: soldOut ? today : null }
    await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, row)
    return NextResponse.json(
      { success: true, soldOutDate: soldOut ? today : null, soldOutScope: soldOut ? 'all' : null, scope: 'global' },
      { headers }
    )
  } catch (e) {
    console.error('updatePosMenuSoldOut:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
