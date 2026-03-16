import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 카드 거래 생성/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const cardAccountId = Number(body.cardAccountId ?? body.card_account_id)
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'expense').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = (body.memo || '').toString().trim() || null

    if (!cardAccountId || isNaN(cardAccountId)) {
      return NextResponse.json({ success: false, message: '카드를 선택해 주세요.' }, { status: 400, headers })
    }
    if (!transDate || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '날짜를 입력해 주세요.' }, { status: 400, headers })
    }
    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
    }
    if (!['charge', 'expense'].includes(transType)) {
      return NextResponse.json({ success: false, message: '유형을 선택해 주세요.' }, { status: 400, headers })
    }

    const bankTransactionId = transType === 'charge' && body.bankTransactionId != null ? Number(body.bankTransactionId) : null
    const vendorCode = transType === 'expense' && body.vendorCode != null ? String(body.vendorCode || '').trim() || null : null
    const accountSubjectId = transType === 'expense' && body.accountSubjectId != null ? Number(body.accountSubjectId) : null
    const note = transType === 'expense' && body.note != null ? String(body.note || '').trim() || null : null

    const row: Record<string, unknown> = {
      card_account_id: cardAccountId,
      trans_date: transDate,
      trans_type: transType,
      amount,
      memo,
      bank_transaction_id: transType === 'charge' ? bankTransactionId : null,
      vendor_code: transType === 'expense' ? vendorCode : null,
      account_subject_id: transType === 'expense' ? accountSubjectId : null,
      note: transType === 'expense' ? note : null,
      updated_at: new Date().toISOString(),
    }

    if (id && !isNaN(id)) {
      await supabaseUpdate('card_transactions', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }
    const inserted = (await supabaseInsert('card_transactions', { ...row, created_at: new Date().toISOString() })) as { id?: number }[]
    const newId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined
    return NextResponse.json({ success: true, id: newId, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCardTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
