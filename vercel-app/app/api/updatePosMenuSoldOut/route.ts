import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 메뉴 당일 품절 토글 (sold_out_date = 오늘 또는 null) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id
    const soldOut = body?.soldOut === true

    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { headers })
    }

    const today = new Date().toISOString().slice(0, 10)
    const row = { sold_out_date: soldOut ? today : null }

    await supabaseUpdateByFilter('pos_menus', `id=eq.${id}`, row)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosMenuSoldOut:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
