import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

/** 시재(카운터 현금) 입출금 등록 - pos_till_transactions */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const storeCode = String(body.storeCode || body.store || '').trim()
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'deposit').toLowerCase()
    const amount = Math.abs(Number(body.amount) || 0)
    const memo = String(body.memo || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()
    const userStore = String(body.userStore || body.user_store || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()

    if (!storeCode) {
      return NextResponse.json({ success: false, message: '매장을 선택하세요.' }, { status: 400, headers })
    }
    if (!transDate) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount === 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }

    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice && userStore && storeCode !== userStore) {
      return NextResponse.json({ success: false, message: '해당 매장만 등록할 수 있습니다.' }, { status: 403, headers })
    }

    const amt = transType === 'withdrawal' ? -amount : amount

    await supabaseInsert('pos_till_transactions', {
      store_code: storeCode,
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo: memo || null,
      user_name: userName || null,
    })

    return NextResponse.json({ success: true, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addTillTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
