import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 점검 항목 삭제 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = body.id ?? body.item_id
    const itemId = String(id ?? '').trim()
    if (!itemId) {
      return NextResponse.json({ success: false, message: '항목 ID가 없습니다.' }, { status: 400 })
    }
    await supabaseDeleteByFilter('checklist_items', `item_id=eq.${encodeURIComponent(itemId)}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('deleteChecklistItem:', msg)
    return NextResponse.json({ success: false, message: '삭제 실패: ' + msg }, { status: 500 })
  }
}
