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
      const updateData: { name: string; use_flag: boolean; sort_order?: number } = {
        name: String(u?.name ?? '').trim(),
        use_flag: u?.use === true || u?.use === 1 || u?.use === '1' || String(u?.use).toLowerCase() === 'y',
      }
      if (u?.sort_order != null) updateData.sort_order = Number(u.sort_order) || 0
      await supabaseUpdateByFilter('checklist_items', `item_id=eq.${encodeURIComponent(itemId)}`, updateData)
    }
    return NextResponse.json({ success: true, msg: '저장됨' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('updateChecklistItems:', msg)
    return NextResponse.json({ success: false, msg: '저장 실패' }, { status: 500 })
  }
}
