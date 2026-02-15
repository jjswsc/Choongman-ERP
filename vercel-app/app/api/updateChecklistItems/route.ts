import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 점검 항목 설정 업데이트 (HQ only - name, use_flag) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updates = Array.isArray(body.updates) ? body.updates : []
    for (const u of updates) {
      const itemId = String(u?.id ?? '').trim()
      if (!itemId) continue
      await supabaseUpdateByFilter('checklist_items', `item_id=eq.${encodeURIComponent(itemId)}`, {
        name: String(u?.name ?? '').trim(),
        use_flag: u?.use === true || u?.use === 1 || u?.use === '1' || String(u?.use).toLowerCase() === 'y',
      })
    }
    return NextResponse.json({ success: true, msg: '저장됨' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('updateChecklistItems:', msg)
    return NextResponse.json({ success: false, msg: '저장 실패' }, { status: 500 })
  }
}
