import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseDeleteByFilter } from '@/lib/supabase-server'

function toDateStr(v: string | null | undefined): string {
  if (!v) return ''
  const s = String(v).trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const action = String(body.action || '').trim().toLowerCase()
    const year = parseInt(String(body.year || ''), 10)
    const dateStr = toDateStr(body.date)
    const name = String(body.name || '').trim()

    if (action === 'add') {
      if (!year || isNaN(year) || !dateStr) {
        return NextResponse.json({ success: false, msg: '연도와 날짜를 입력해주세요.' }, { status: 400, headers })
      }
      await supabaseInsert('public_holidays', { year, date: dateStr, name: name || '-' })
      return NextResponse.json({ success: true, msg: '추가되었습니다.' }, { headers })
    }

    if (action === 'update') {
      const id = body.id
      if (id == null) {
        return NextResponse.json({ success: false, msg: 'id가 필요합니다.' }, { status: 400, headers })
      }
      const patch: Record<string, unknown> = {}
      if (year && !isNaN(year)) patch.year = year
      if (dateStr) patch.date = dateStr
      if (name !== undefined) patch.name = name
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ success: false, msg: '수정할 항목이 없습니다.' }, { status: 400, headers })
      }
      await supabaseUpdate('public_holidays', id, patch)
      return NextResponse.json({ success: true, msg: '수정되었습니다.' }, { headers })
    }

    if (action === 'delete') {
      const id = body.id
      if (id == null) {
        return NextResponse.json({ success: false, msg: 'id가 필요합니다.' }, { status: 400, headers })
      }
      await supabaseDeleteByFilter('public_holidays', `id=eq.${id}`)
      return NextResponse.json({ success: true, msg: '삭제되었습니다.' }, { headers })
    }

    return NextResponse.json({ success: false, msg: 'action을 지정해주세요. (add/update/delete)' }, { status: 400, headers })
  } catch (e) {
    console.error('savePublicHoliday:', e)
    return NextResponse.json(
      { success: false, msg: (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
