import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'

/** 은행 적요 키워드 규칙 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const keyword = String(body.keyword || '').trim()
    const transType = String(body.transType || body.trans_type || 'withdraw').toLowerCase()
    const category = String(body.category || '').trim()
    const accountSubjectId = body.accountSubjectId != null ? Number(body.accountSubjectId) : (body.account_subject_id != null ? Number(body.account_subject_id) : null)

    if (!keyword) {
      return NextResponse.json({ success: false, message: '키워드를 입력하세요.' }, { status: 400, headers })
    }
    if (transType !== 'deposit' && transType !== 'withdraw') {
      return NextResponse.json({ success: false, message: '유형은 입금 또는 출금이어야 합니다.' }, { status: 400, headers })
    }
    if (!category) {
      return NextResponse.json({ success: false, message: '용도를 선택하세요.' }, { status: 400, headers })
    }

    const validDepositCats = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'loan', 'advance', 'unclassified', 'correction']
    const validWithdrawCats = ['transfer', 'expense', 'fixed', 'purchase_payment', 'loan', 'advance', 'unclassified', 'correction']
    const validCats = transType === 'deposit' ? validDepositCats : validWithdrawCats
    if (!validCats.includes(category)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 용도입니다.' }, { status: 400, headers })
    }

    if (accountSubjectId != null && !isNaN(accountSubjectId)) {
      const hdr = await assertAccountSubjectNotHeader(accountSubjectId)
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
    }

    if (id && !isNaN(id)) {
      const existing = (await supabaseSelectFilter('bank_memo_rules', `id=eq.${id}`, { limit: 1 })) as { id?: number }[]
      if (existing?.length) {
        await supabaseUpdate('bank_memo_rules', id, {
          keyword,
          trans_type: transType,
          category,
          account_subject_id: accountSubjectId && !isNaN(accountSubjectId) ? accountSubjectId : null,
        })
        return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
      }
    }

    const inserted = (await supabaseInsert('bank_memo_rules', {
      keyword,
      trans_type: transType,
      category,
      account_subject_id: accountSubjectId && !isNaN(accountSubjectId) ? accountSubjectId : null,
    })) as { id?: number }[]
    const newId = inserted?.[0]?.id
    return NextResponse.json({ success: true, id: newId, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveBankMemoRule:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
