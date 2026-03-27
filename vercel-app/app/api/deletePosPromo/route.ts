import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'
import { deleteMirrorMenusByPromoId } from '@/lib/pos-promo-mirror-menu'

/**
 * POS 프로모션 완전 삭제: 미러 메뉴(pos_menus.promo_id) → 프로모 마스터(pos_promos).
 * pos_promo_items 는 FK CASCADE 로 함께 제거됩니다. 복구 불가.
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { id?: string }
    const id = body?.id
    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { headers })
    }
    const enc = encodeURIComponent(id)
    try {
      await deleteMirrorMenusByPromoId(id)
    } catch (mirrorErr) {
      console.warn('deletePosPromo: mirror menu delete skipped', mirrorErr)
    }
    await supabaseDeleteByFilter('pos_promos', `id=eq.${enc}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePosPromo:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
