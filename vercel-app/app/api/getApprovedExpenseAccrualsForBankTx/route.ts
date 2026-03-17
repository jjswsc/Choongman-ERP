import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type BankTxRow = {
  id?: number
  trans_type?: string
  amount?: number
  trans_date?: string
}

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  expense_date?: string
  due_date?: string
  memo?: string
  account_subject_id?: number
  store_name?: string
  status?: string
  approved_at?: string
  approved_by?: string
}

type PayableTxRow = {
  amount?: number
  expense_accrual_id?: number
  bank_transaction_id?: number | null
}

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  const payeeCode = src.slice(0, idx).trim()
  const withdrawalCategory = src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
  return { payeeCode, withdrawalCategory }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const bankTransactionId = Number(searchParams.get('bankTransactionId') || 0)
    const userRole = String(searchParams.get('userRole') || '').toLowerCase()
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) return NextResponse.json({ success: true, list: [] }, { headers })
    if (!bankTransactionId) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.', list: [] }, { status: 400, headers })
    }

    const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      select: 'id,trans_type,amount,trans_date',
      limit: 1,
    })) as BankTxRow[] | null
    const bankRow = bankRows?.[0]
    if (!bankRow?.id) {
      return NextResponse.json({ success: false, message: '통장 거래를 찾을 수 없습니다.', list: [] }, { status: 404, headers })
    }
    if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
      return NextResponse.json({ success: false, message: '출금 거래만 매칭할 수 있습니다.', list: [] }, { status: 400, headers })
    }

    const linkedRows = (await supabaseSelectFilter(
      'payable_transactions',
      `bank_transaction_id=eq.${bankTransactionId}`,
      { select: 'expense_accrual_id', limit: 1 }
    )) as { expense_accrual_id?: number | null }[] | null
    if ((linkedRows || []).some((r) => Number(r.expense_accrual_id || 0) > 0)) {
      return NextResponse.json({ success: true, list: [], message: '이미 지급예정과 연결된 통장 거래입니다.' }, { headers })
    }

    const bankAmount = Math.abs(Number(bankRow.amount || 0))
    const bankDate = String(bankRow.trans_date || '').slice(0, 10)
    const [accrualRows, payableRows] = await Promise.all([
      supabaseSelectFilter('expense_accruals', 'status=eq.approved', {
        select: 'id,payee_code,payee_name,amount,expense_date,due_date,memo,account_subject_id,store_name,status,approved_at,approved_by',
        order: 'approved_at.asc,id.asc',
        limit: 5000,
      }) as Promise<ExpenseAccrualRow[]>,
      supabaseSelectFilter('payable_transactions', 'id=gt.0', {
        select: 'amount,expense_accrual_id,bank_transaction_id',
        limit: 20000,
      }) as Promise<PayableTxRow[]>,
    ])

    const paidByAccrual = new Map<number, number>()
    for (const tx of payableRows || []) {
      const accrualId = Number(tx.expense_accrual_id || 0)
      if (!accrualId) continue
      const amt = Number(tx.amount || 0)
      if (amt < 0) paidByAccrual.set(accrualId, (paidByAccrual.get(accrualId) || 0) + Math.abs(amt))
    }

    const list = (accrualRows || [])
      .map((r) => {
        const id = Number(r.id || 0)
        const plannedAmount = Math.abs(Number(r.amount || 0))
        const paidAmount = paidByAccrual.get(id) || 0
        const remainingAmount = Math.max(0, plannedAmount - paidAmount)
        const decoded = decodePayeeCode(r.payee_code)
        return {
          id,
          payeeCode: decoded.payeeCode,
          payeeName: r.payee_name || decoded.payeeCode || '',
          withdrawalCategory: decoded.withdrawalCategory,
          plannedAmount,
          paidAmount,
          remainingAmount,
          expenseDate: r.expense_date ? String(r.expense_date).slice(0, 10) : '',
          dueDate: r.due_date ? String(r.due_date).slice(0, 10) : '',
          memo: r.memo || '',
          accountSubjectId: r.account_subject_id || null,
          storeName: r.store_name || '',
          status: String(r.status || '').toLowerCase() || 'approved',
          approvedAt: r.approved_at ? String(r.approved_at) : '',
          approvedBy: r.approved_by || '',
        }
      })
      .filter((r) => {
        const d = String(r.dueDate || r.expenseDate || '').slice(0, 10)
        return d === bankDate
      })
      .filter((r) => {
        if (!storeFilter) return true
        const rowStore = String(r.storeName || '').trim()
        return rowStore.toLowerCase() === storeFilter.toLowerCase()
      })
      .filter((r) => (r.remainingAmount || 0) > 0)

    return NextResponse.json({
      success: true,
      bankTransaction: {
        id: Number(bankRow.id || 0),
        amount: bankAmount,
        transDate: bankDate,
      },
      list,
    }, { headers })
  } catch (e) {
    console.error('getApprovedExpenseAccrualsForBankTx:', e)
    return NextResponse.json(
      { success: false, list: [], message: e instanceof Error ? e.message : '조회 실패' },
      { status: 500, headers }
    )
  }
}

