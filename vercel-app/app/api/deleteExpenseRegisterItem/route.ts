import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'

type LinkedPayableRow = {
  id?: number
  expense_accrual_id?: number | null
}

type BankTransactionRow = {
  id?: number
  trans_date?: string
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 삭제할 수 있습니다.' }, { status: 403, headers })
    }

    const bankTransactionId = Number(body.bankTransactionId || body.bank_transaction_id || 0)
    if (!bankTransactionId) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const [linkedPayables, linkedInbound, linkedCards] = await Promise.all([
      supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, {
        select: 'id,expense_accrual_id',
        limit: 100,
      }) as Promise<LinkedPayableRow[]>,
      supabaseSelectFilter('bank_transaction_inbound_links', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
      supabaseSelectFilter('card_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
    ])
    const txRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      select: 'id,trans_date',
      limit: 1,
    })) as BankTransactionRow[] | null
    if (!txRows?.[0]?.id) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }
    await assertAccountingDateOpen(String(txRows[0].trans_date || '').slice(0, 10))

    if ((linkedPayables || []).some((r) => Number(r.expense_accrual_id || 0) > 0)) {
      return NextResponse.json(
        { success: false, message: '지급예정과 연결된 거래는 삭제할 수 없습니다. 지급예정 탭에서 처리해 주세요.' },
        { status: 400, headers }
      )
    }
    if ((linkedInbound || []).length > 0) {
      return NextResponse.json(
        { success: false, message: '입고 연동된 거래는 삭제할 수 없습니다. 연동 해제 후 다시 시도해 주세요.' },
        { status: 400, headers }
      )
    }
    if ((linkedCards || []).length > 0) {
      return NextResponse.json(
        { success: false, message: '카드 충전과 연결된 거래는 삭제할 수 없습니다.' },
        { status: 400, headers }
      )
    }

    await supabaseDeleteByFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`)
    await deleteJournalEntriesBySource('bank_transaction', bankTransactionId, {
      memoIncludes: ['통장 거래 자동분개'],
    })
    await supabaseDeleteByFilter('bank_transactions', `id=eq.${bankTransactionId}`)

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteExpenseRegisterItem:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { status: 500, headers }
    )
  }
}

