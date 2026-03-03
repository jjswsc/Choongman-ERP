import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

/** 인테리어 프로젝트 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const location = String(body.location || '').trim()
    const status = String(body.status || 'active').trim()
    const budgetTotal = Number(body.budgetTotal ?? body.budget_total) || 0
    const startDate = body.startDate ?? body.start_date
    const endDate = body.endDate ?? body.end_date

    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 프로젝트명을 입력하세요.' }, { status: 400, headers })
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_projects', id, {
        code,
        name,
        location: location || null,
        status: status || 'active',
        budget_total: budgetTotal,
        start_date: startDate ? String(startDate).slice(0, 10) : null,
        end_date: endDate ? String(endDate).slice(0, 10) : null,
      })
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilter(
      'interior_projects',
      `code=eq.${encodeURIComponent(code)}`,
      { limit: 1 }
    )) as { id?: number }[]
    if (existing?.length) {
      return NextResponse.json({ success: false, message: '이미 존재하는 프로젝트 코드입니다.' }, { status: 400, headers })
    }

    const inserted = await supabaseInsert('interior_projects', {
      code,
      name,
      location: location || null,
      status: status || 'active',
      budget_total: budgetTotal,
      start_date: startDate ? String(startDate).slice(0, 10) : null,
      end_date: endDate ? String(endDate).slice(0, 10) : null,
    })

    const row = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (row as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorProject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
