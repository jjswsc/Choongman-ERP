import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter, supabaseCountFilter } from '@/lib/supabase-server'

/** 계정과목 삭제 - 사용 중이면 불가 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = Number(body.id)

    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: '계정과목 ID가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${id}`, { limit: 1 })) as { id?: number; code?: string }[]
    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '해당 계정과목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const bankCount = await supabaseCountFilter('bank_transactions', `account_subject_id=eq.${id}`)
    const fixedCount = await supabaseCountFilter('fixed_expenses', `account_subject_id=eq.${id}`)
    const pettyCount = await supabaseCountFilter('petty_cash_transactions', `account_subject_id=eq.${id}`)
    const memoRuleCount = await supabaseCountFilter('bank_memo_mapping_rules', `account_subject_id=eq.${id}`)

    if (bankCount > 0 || fixedCount > 0 || pettyCount > 0 || memoRuleCount > 0) {
      const parts: string[] = []
      if (bankCount > 0) parts.push(`통장거래 ${bankCount}건`)
      if (fixedCount > 0) parts.push(`고정비 ${fixedCount}건`)
      if (pettyCount > 0) parts.push(`패티캐시 ${pettyCount}건`)
      if (memoRuleCount > 0) parts.push(`적요규칙 ${memoRuleCount}건`)
      return NextResponse.json({
        success: false,
        message: `사용 중이라 삭제할 수 없습니다. (${parts.join(', ')})`,
      }, { status: 400, headers })
    }

    await supabaseDeleteByFilter('account_subjects', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteAccountSubject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
