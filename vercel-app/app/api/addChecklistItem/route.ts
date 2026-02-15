import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseInsert } from '@/lib/supabase-server'

/** 점검 항목 추가 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const main = String(body.main || body.main_cat || '').trim()
    const sub = String(body.sub || body.sub_cat || '').trim()
    const name = String(body.name || '').trim()

    const rows = (await supabaseSelect('checklist_items', { order: 'item_id.desc', limit: 1 })) as { item_id?: number }[]
    const nextId = rows?.[0]?.item_id != null ? Number(rows[0].item_id) + 1 : 1

    await supabaseInsert('checklist_items', {
      item_id: nextId,
      main_cat: main,
      sub_cat: sub,
      name: name || '항목',
      use_flag: true,
    })
    return NextResponse.json({ success: true, id: nextId, message: '추가되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('addChecklistItem:', msg)
    return NextResponse.json({ success: false, message: '추가 실패: ' + msg }, { status: 500 })
  }
}
