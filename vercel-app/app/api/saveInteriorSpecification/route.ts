import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 사양서 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const projectId = Number(body.projectId ?? body.project_id)
    const description = String(body.description ?? '').trim()
    const code = String(body.code ?? '').trim()
    const size = String(body.size ?? '').trim()
    const supplierCode = String((body.supplierCode ?? body.supplier_code) || '').trim()
    const location = String(body.location ?? '').trim()

    if (!projectId || isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!description) {
      return NextResponse.json({ success: false, message: '내용을 입력하세요.' }, { status: 400, headers })
    }

    const row = {
      project_id: projectId,
      description,
      code: code || null,
      size: size || null,
      supplier_code: supplierCode || null,
      location: location || null,
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('interior_specifications', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert('interior_specifications', row)
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorSpecification:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
