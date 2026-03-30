import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** POST: 배합 삭제 (CASCADE로 sauce_ingredients도 삭제) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    if (id == null) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400, headers })
    }
    await supabaseDeleteByFilter('sauce_ingredients', `sauce_id=eq.${id}`)
    await supabaseDeleteByFilter('sauces', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deleteSauce:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
