import { NextRequest, NextResponse } from 'next/server'
import { bangkokTodayYmd } from '@/lib/bangkok-date'
import { canAccessPosOrder } from '@/lib/permissions'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/**
 * POS 메뉴 품절 토글.
 * sold_out_date = 방콕 오늘(품절 처리일 기록) 또는 null(판매 재개).
 * 비어 있지 않으면 수동 해제 전까지 품절 유지(날짜가 지나도 자동 해제 없음).
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

    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { headers })
    }

    const today = bangkokTodayYmd()
    const row = { sold_out_date: soldOut ? today : null }

    await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, row)

    return NextResponse.json({ success: true, soldOutDate: soldOut ? today : null }, { headers })
  } catch (e) {
    console.error('updatePosMenuSoldOut:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
