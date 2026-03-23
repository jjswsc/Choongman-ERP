import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { deactivateMirrorMenuByPromoId } from '@/lib/pos-promo-mirror-menu'

/** POS 프로모션 비활성화(소프트 삭제) — 과거 주문·미러 메뉴 참조 유지 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { id?: string }
    const id = body?.id
    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { headers })
    }
    await supabaseUpdateByFilter('pos_promos', `id=eq.${encodeURIComponent(id)}`, { is_active: false })
    await deactivateMirrorMenuByPromoId(id)
    return NextResponse.json({ success: true, message: '비활성 처리되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePosPromo:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
