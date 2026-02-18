import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** POS 메뉴 삭제 */
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

    const existing = (await supabaseSelectFilter(
      'pos_menus',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id?: number }[] | null
    if (!existing || existing.length === 0) {
      return NextResponse.json(
        { success: false, message: '존재하지 않는 메뉴입니다.' },
        { headers }
      )
    }

    await supabaseDeleteByFilter('pos_menus', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deletePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
