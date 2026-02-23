import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 통장(계좌) 삭제. 계좌 삭제 시 해당 계좌의 거래 내역은 CASCADE로 함께 삭제됩니다. */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: '계좌 ID가 필요합니다.' }, { status: 400, headers })
    }
    await supabaseDeleteByFilter('bank_accounts', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteBankAccount:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
