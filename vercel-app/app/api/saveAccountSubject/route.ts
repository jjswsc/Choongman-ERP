import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 계정과목 저장 (추가/수정) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const code = String(body.code || '').trim().toUpperCase()
    const name = String(body.name || '').trim()
    const nameEn = body.nameEn != null ? String(body.nameEn).trim() || null : null
    const type = String(body.type || 'expense').toLowerCase()
    const pAndLSection = body.pAndLSection != null ? String(body.pAndLSection).trim() || null : null
    const sortOrder = Number(body.sortOrder) ?? 0

    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 과목명을 입력하세요.' }, { status: 400, headers })
    }

    const validTypes = ['expense', 'revenue', 'asset', 'transfer']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ success: false, message: '유형은 expense, revenue, asset, transfer 중 하나여야 합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('account_subjects', `code=eq.${encodeURIComponent(code)}`, { limit: 2 })) as { id?: number }[]
    const existingRow = existing?.[0]

    if (id) {
      if (!existingRow || existingRow.id !== id) {
        const byId = (await supabaseSelectFilter('account_subjects', `id=eq.${id}`, { limit: 1 })) as { id?: number; code?: string }[]
        if (!byId?.[0]) {
          return NextResponse.json({ success: false, message: '해당 계정과목을 찾을 수 없습니다.' }, { status: 404, headers })
        }
      }
      await supabaseUpdate('account_subjects', id, {
        code,
        name,
        name_en: nameEn,
        type,
        p_and_l_section: pAndLSection,
        sort_order: sortOrder,
      })
      return NextResponse.json({ success: true, message: '수정되었습니다.', id }, { headers })
    }

    if (existingRow) {
      return NextResponse.json({ success: false, message: `코드 "${code}"가 이미 존재합니다.` }, { status: 400, headers })
    }

    const inserted = (await supabaseInsert('account_subjects', {
      code,
      name,
      name_en: nameEn,
      type,
      p_and_l_section: pAndLSection,
      sort_order: sortOrder,
    })) as { id?: number }[]
    const newId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as { id?: number })?.id
    return NextResponse.json({ success: true, message: '등록되었습니다.', id: newId }, { headers })
  } catch (e) {
    console.error('saveAccountSubject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
