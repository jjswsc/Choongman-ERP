import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  resolvePosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'
import { findPosMenuDeleteBlockReason } from '@/lib/pos-menu-delete-guard-server'

/** POS 메뉴 삭제 — 주문·세트·반반 등 참조가 있으면 거부 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { id?: string }
    const id = body.id ? String(body.id).trim() : ''
    if (!id) {
      return NextResponse.json(
        { success: false, message: '메뉴 ID가 필요합니다.' },
        { headers }
      )
    }

    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    const writeBlock = assertPosCatalogTenantWritable(catalogScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { headers })
    }

    const filter = appendPosCatalogTenantFilter(`id=eq.${encodeURIComponent(id)}`, catalogScope)
    const existing = (await supabaseSelectFilter(
      'pos_menus',
      filter,
      { limit: 1, select: 'id,promo_id,name,code' }
    )) as { id?: number; promo_id?: number | null; name?: string; code?: string }[] | null
    if (!existing || existing.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: catalogScope.enforce
            ? '메뉴를 찾을 수 없거나 다른 회사 메뉴입니다.'
            : '존재하지 않는 메뉴입니다.',
        },
        { headers }
      )
    }

    const row = existing[0]
    const blocked = await findPosMenuDeleteBlockReason({
      menuId: String(row.id ?? id),
      promoId: row.promo_id,
    })
    if (blocked) {
      return NextResponse.json(
        { success: false, message: blocked.message, code: `menu_delete_blocked_${blocked.reason}` },
        { headers }
      )
    }

    await supabaseDeleteByFilter('pos_menus', filter)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
