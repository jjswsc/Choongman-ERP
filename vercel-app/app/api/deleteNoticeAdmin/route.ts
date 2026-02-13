import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: 'Invalid notice ID' },
        { headers }
      )
    }

    const readRows = (await supabaseSelectFilter(
      'notice_reads',
      `notice_id=eq.${id}`,
      { limit: 1000 }
    )) as { id: number }[] || []

    for (const r of readRows) {
      await supabaseDeleteByFilter('notice_reads', `id=eq.${r.id}`)
    }

    await supabaseDeleteByFilter('notices', `id=eq.${id}`)

    return NextResponse.json(
      { success: true, message: '공지가 삭제되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('deleteNoticeAdmin:', e)
    return NextResponse.json(
      { success: false, message: '삭제 실패' },
      { headers }
    )
  }
}
