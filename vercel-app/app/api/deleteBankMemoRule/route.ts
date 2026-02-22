import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 은행 적요 키워드 규칙 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = Number(body.id ?? body.ruleId)
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '규칙 ID가 필요합니다.' }, { status: 400, headers })
    }
    await supabaseDeleteByFilter('bank_memo_rules', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteBankMemoRule:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
