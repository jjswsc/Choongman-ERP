import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 카드 계정 생성/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const name = String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ success: false, message: '카드명을 입력해 주세요.' }, { status: 400, headers })
    }
    const store = (body.store || '').toString().trim() || null
    const memo = (body.memo || '').toString().trim() || null
    const cardNumber = (body.cardNumber || body.card_number || '').toString().trim() || null
    const holderName = (body.holderName || body.holder_name || '').toString().trim() || null
    const cardCompany = (body.cardCompany || body.card_company || '').toString().trim() || null

    if (id && !isNaN(id)) {
      await supabaseUpdate('card_accounts', id, { name, store, memo, card_number: cardNumber, holder_name: holderName, card_company: cardCompany, updated_at: new Date().toISOString() })
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }
    const inserted = (await supabaseInsert('card_accounts', {
      name,
      store,
      memo,
      card_number: cardNumber,
      holder_name: holderName,
      card_company: cardCompany,
      updated_at: new Date().toISOString(),
    })) as { id?: number }[]
    const newId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined
    return NextResponse.json({ success: true, id: newId, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCardAccount:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
