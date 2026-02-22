import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 고정비 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const name = String(body.name || '').trim()
    const monthlyAmount = Number(body.monthlyAmount ?? body.monthly_amount) || 0
    const store = String(body.store || '').trim()
    const startYearMonth = body.startYearMonth ?? body.start_year_month
    const endYearMonth = body.endYearMonth ?? body.end_year_month
    const memo = String(body.memo || '').trim()
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id

    if (!name) {
      return NextResponse.json({ success: false, message: '항목명을 입력하세요.' }, { status: 400, headers })
    }

    if (id && !isNaN(id)) {
      const patch: Record<string, unknown> = {
        name,
        monthly_amount: monthlyAmount,
        store: store || null,
        start_year_month: startYearMonth ? String(startYearMonth).trim() || null : null,
        end_year_month: endYearMonth ? String(endYearMonth).trim() || null : null,
        memo: memo || null,
      }
      if (accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        patch.account_subject_id = isNaN(asid) ? null : asid
      }
      await supabaseUpdate('fixed_expenses', id, patch)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const insertRow: Record<string, unknown> = {
      name,
      monthly_amount: monthlyAmount,
      store: store || null,
      start_year_month: startYearMonth ? String(startYearMonth).trim() || null : null,
      end_year_month: endYearMonth ? String(endYearMonth).trim() || null : null,
      memo: memo || null,
    }
    if (accountSubjectId != null) {
      const asid = Number(accountSubjectId)
      if (!isNaN(asid)) insertRow.account_subject_id = asid
    }
    const inserted = await supabaseInsert('fixed_expenses', insertRow)

    const row = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (row as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveFixedExpense:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
