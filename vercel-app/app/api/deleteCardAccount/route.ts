import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 카드 계정 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = Number(body.id ?? body.cardAccountId ?? 0)
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '카드 ID가 필요합니다.' }, { status: 400, headers })
    }
    await supabaseDeleteByFilter('card_transactions', `card_account_id=eq.${id}`)
    await supabaseDeleteByFilter('card_accounts', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteCardAccount:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
