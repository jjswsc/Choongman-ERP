import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 점검 이력 삭제 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body?.id || '').trim()
    if (!id) {
      return NextResponse.json({ success: false, msg: 'id가 필요합니다.' }, { status: 400 })
    }
    await supabaseDeleteByFilter('check_results', `id=eq.${encodeURIComponent(id)}`)
    return NextResponse.json({ success: true, result: 'DELETED' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('0 rows') || msg.includes('JWT')) {
      return NextResponse.json({ success: false, msg: '데이터를 찾을 수 없습니다.' }, { status: 404 })
    }
    console.error('deleteCheckHistory:', msg)
    return NextResponse.json({ success: false, msg: '삭제 실패' }, { status: 500 })
  }
}
