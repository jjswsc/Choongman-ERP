import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** POS 메뉴 재료(BOM) 삭제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const id = body?.id

    if (!id) {
      return NextResponse.json({ success: false, message: 'id required' }, { headers })
    }

    await supabaseDeleteByFilter('pos_menu_ingredients', `id=eq.${id}`)

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deletePosMenuIngredient:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
