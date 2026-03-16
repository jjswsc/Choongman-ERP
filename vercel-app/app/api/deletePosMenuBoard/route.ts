import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** POS 메뉴판 구성 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const id = Number(body?.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { headers })
    }
    await supabaseDeleteByFilter('pos_menu_boards', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deletePosMenuBoard:', e)
    return NextResponse.json({ success: false, message: String(e) }, { headers })
  }
}
