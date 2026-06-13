import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/** 견적 파일 메타(금액·연결 비용) 수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const body = (await request.json()) as {
      id?: number
      quoteAmount?: number | null
      linkedExpenseId?: number | null
    }
    const id = Number(body.id)
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const row: Record<string, unknown> = {}
    if (body.quoteAmount != null) {
      row.quote_amount = Math.max(0, Number(body.quoteAmount) || 0)
    }
    if (body.linkedExpenseId !== undefined) {
      const linked = body.linkedExpenseId
      row.linked_expense_id =
        linked != null && Number.isFinite(Number(linked)) && Number(linked) > 0
          ? Math.floor(Number(linked))
          : null
    }

    if (!Object.keys(row).length) {
      return NextResponse.json({ success: false, message: '수정할 항목이 없습니다.' }, { status: 400, headers })
    }

    await supabaseUpdate('interior_project_files', id, row)
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorProjectFile:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
