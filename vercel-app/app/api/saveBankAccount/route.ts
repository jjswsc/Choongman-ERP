import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장(계좌) 추가 또는 기초잔액 수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id ? Number(body.id) : null
    const name = String(body.name || '').trim()
    const store = String(body.store || '').trim()
    const openingBalance = Number(body.openingBalance ?? body.opening_balance ?? 0)
    const openingBalanceDate = body.openingBalanceDate || body.opening_balance_date
      ? String(body.openingBalanceDate || body.opening_balance_date).slice(0, 10)
      : null

    if (!name) {
      return NextResponse.json({ success: false, message: '계좌명을 입력하세요.' }, { status: 400, headers })
    }

    if (id) {
      await supabaseUpdate('bank_accounts', id, {
        name,
        store: store || null,
        opening_balance: openingBalance,
        opening_balance_date: openingBalanceDate,
      })
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = (await supabaseInsert('bank_accounts', {
      name,
      store: store || null,
      opening_balance: openingBalance,
      opening_balance_date: openingBalanceDate,
    })) as { id?: number }[]
    const newId = Array.isArray(inserted) && inserted[0]?.id != null ? inserted[0].id : null
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveBankAccount:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
