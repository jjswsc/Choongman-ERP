import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { assertAccountingDateOpen, deleteJournalEntriesBySource } from '@/lib/accounting-posting'
import { deleteReceivableFromBankReceive } from '@/lib/receivable-payable'
import { deleteBorrowingFromBankTransaction } from '@/lib/borrowing-ledger'
import { requireAuth } from '@/lib/verify-auth'

type LinkedPayableRow = {
  id?: number
  expense_accrual_id?: number | null
  ref_type?: string | null
  bank_transaction_id?: number | null
  petty_cash_transaction_id?: number | null
}

type BankTransactionRow = {
  id?: number
  trans_date?: string
  trans_type?: string
  amount?: number
  memo?: string | null
  store_name?: string | null
}

type ExpenseAccrualRow = {
  id?: number
  status?: string | null
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const body = await request.json()

    const bankTransactionId = Number(body.bankTransactionId || body.bank_transaction_id || 0)
    if (!bankTransactionId) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const [linkedPayables, linkedInbound, linkedCards] = await Promise.all([
      supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, {
        select: 'id,expense_accrual_id,ref_type,bank_transaction_id,petty_cash_transaction_id',
        limit: 100,
      }) as Promise<LinkedPayableRow[]>,
      supabaseSelectFilter('bank_transaction_inbound_links', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
      supabaseSelectFilter('card_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1 }).catch(() => []),
    ])
    const txRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      select: 'id,trans_date,trans_type,amount,memo,store_name',
      limit: 1,
    })) as BankTransactionRow[] | null
    if (!txRows?.[0]?.id) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }
    const transTypeLower = String(txRows[0].trans_type || '').toLowerCase()
    if (!['deposit', 'withdraw'].includes(transTypeLower)) {
      return NextResponse.json({ success: false, message: '입금·출금 거래만 삭제할 수 있습니다.' }, { status: 400, headers })
    }

    const linkedAccrualIds = [...new Set(
      (linkedPayables || [])
        .map((r) => Number(r.expense_accrual_id || 0))
        .filter((id) => id > 0)
    )]
    let deletableLinkedAccrualIds: number[] = []
    if (linkedAccrualIds.length > 0) {
      const accrualRows = (await supabaseSelectFilter(
        'expense_accruals',
        `id=in.(${linkedAccrualIds.join(',')})`,
        { select: 'id,status', limit: 200 }
      )) as ExpenseAccrualRow[] | null
      const statusByAccrualId = new Map<number, string>()
      for (const row of accrualRows || []) {
        const id = Number(row.id || 0)
        if (id > 0) statusByAccrualId.set(id, String(row.status || '').toLowerCase())
      }

      const allRowsByAccrual = (await supabaseSelectFilter(
        'payable_transactions',
        `expense_accrual_id=in.(${linkedAccrualIds.join(',')})`,
        { select: 'id,expense_accrual_id,ref_type,bank_transaction_id,petty_cash_transaction_id', limit: 1000 }
      )) as LinkedPayableRow[] | null
      const payableRowsByAccrualId = new Map<number, LinkedPayableRow[]>()
      for (const row of allRowsByAccrual || []) {
        const id = Number(row.expense_accrual_id || 0)
        if (id <= 0) continue
        const list = payableRowsByAccrualId.get(id) || []
        list.push(row)
        payableRowsByAccrualId.set(id, list)
      }

      const isAutoLinkedSingleBankPaymentAccrual = (accrualId: number): boolean => {
        const accrualStatus = statusByAccrualId.get(accrualId) || ''
        if (!['done', 'paid'].includes(accrualStatus)) return false
        const rows = payableRowsByAccrualId.get(accrualId) || []
        if (rows.length === 0) return false
        const paymentRows = rows.filter((row) => String(row.ref_type || '') === 'Payment')
        if (paymentRows.length !== 1) return false
        const targetPayment = paymentRows[0]
        if (!targetPayment) return false
        const targetPaymentBankId = Number(targetPayment.bank_transaction_id || 0)
        const targetPaymentPettyId = Number(targetPayment.petty_cash_transaction_id || 0)
        if (targetPaymentPettyId > 0) return false
        if (targetPaymentBankId !== bankTransactionId) return false

        let hasExpenseRow = false
        for (const row of rows) {
          const refType = String(row.ref_type || '')
          const rowBankId = Number(row.bank_transaction_id || 0)
          const rowPettyId = Number(row.petty_cash_transaction_id || 0)
          if (refType === 'Expense') {
            if (rowBankId > 0 || rowPettyId > 0) return false
            hasExpenseRow = true
            continue
          }
          if (refType === 'Payment') {
            if (row.id !== targetPayment.id) return false
            continue
          }
          return false
        }
        return hasExpenseRow
      }

      const blockedAccrual = linkedAccrualIds.some((id) => !isAutoLinkedSingleBankPaymentAccrual(id))
      if (blockedAccrual) {
        return NextResponse.json(
          { success: false, message: '지급예정과 연결된 거래는 삭제할 수 없습니다. 지급예정 탭에서 처리해 주세요.' },
          { status: 400, headers }
        )
      }
      deletableLinkedAccrualIds = linkedAccrualIds
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

    if (transTypeLower === 'deposit') {
      const recvRows = (await supabaseSelectFilter('receivable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, {
        limit: 20,
        select: 'id,ref_type,ref_id',
      })) as { id?: number; ref_type?: string | null; ref_id?: number | null }[] | null
      const blockedRecv = (recvRows || []).some((row) => {
        const rid = Number(row.ref_id || 0)
        if (rid > 0) return true
        if (String(row.ref_type || '') === 'Order') return true
        return false
      })
      if (blockedRecv) {
        return NextResponse.json(
          { success: false, message: '주문·기타 원장과 연결된 미수금 입금은 삭제할 수 없습니다.' },
          { status: 400, headers }
        )
      }
    }

    await assertAccountingDateOpen(
      String(txRows[0].trans_date || '').slice(0, 10),
      String(txRows[0].store_name || '').trim() || null
    )

    if (deletableLinkedAccrualIds.length > 0) {
      await supabaseDeleteByFilter(
        'payable_transactions',
        `expense_accrual_id=in.(${deletableLinkedAccrualIds.join(',')})`
      )
      for (const accrualId of deletableLinkedAccrualIds) {
        await deleteJournalEntriesBySource('expense_accrual', accrualId)
      }
      await supabaseDeleteByFilter(
        'expense_accruals',
        `id=in.(${deletableLinkedAccrualIds.join(',')})`
      )
    }
    await supabaseDeleteByFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}&expense_accrual_id=is.null`)
    if (transTypeLower === 'deposit') {
      const tx = txRows[0]
      const memo = String(tx.memo || '').trim()
      await deleteReceivableFromBankReceive({
        bankTransactionId,
        storeName: String(tx.store_name || '').trim() || null,
        amountAbs: Math.abs(Number(tx.amount) || 0),
        transDate: String(tx.trans_date || '').slice(0, 10),
        memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
      })
    }
    try {
      await deleteBorrowingFromBankTransaction(bankTransactionId)
    } catch (e) {
      console.warn('deleteExpenseRegisterItem borrowing ledger:', e)
    }
    await deleteJournalEntriesBySource('bank_transaction', bankTransactionId, {
      memoIncludes: ['통장 거래 자동분개'],
    })
    await supabaseDeleteByFilter('bank_transactions', `id=eq.${bankTransactionId}`)

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteExpenseRegisterItem:', e)
    const raw = e instanceof Error ? e.message : '삭제 실패'
    const message =
      raw === 'ACCOUNTING_PERIOD_CLOSED' ? '마감된 회계기간의 거래는 삭제할 수 없습니다.' : raw
    return NextResponse.json({ success: false, message }, { status: raw === 'ACCOUNTING_PERIOD_CLOSED' ? 409 : 500, headers })
  }
}

