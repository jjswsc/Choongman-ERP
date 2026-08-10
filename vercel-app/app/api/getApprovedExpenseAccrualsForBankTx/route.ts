import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { evaluatePayeeBankMemoMatch, type PayeeMemoMatchQuality } from '@/lib/expense-accrual-bank-memo-match'
import { isSettledExpensePayment } from '@/lib/expense-accrual-settlement'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { roundMoney2 } from '@/lib/invoice-vat-total'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'
import { requireAuth } from '@/lib/verify-auth'

type BankTxRow = {
  id?: number
  trans_type?: string
  amount?: number
  trans_date?: string
  memo?: string
  note?: string
}

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  withholding_tax_amount?: number | null
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
  petty_cash_transaction_id?: number | null
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

const MEMO_MATCH_ORDER: Record<PayeeMemoMatchQuality, number> = {
  ok: 0,
  uncertain: 1,
  trivial: 2,
  mismatch: 3,
}

/** paid/done 포함 — 통장·패티 미정산(고아 paid)도 잔액이 있으면 연결 후보 */
const LINKABLE_ACCRUAL_STATUSES = ['planned', 'approved', 'partial', 'paid', 'done'] as const

function accrualMatchesStore(rowStore: string, storeFilter: string): boolean {
  const row = String(rowStore || '').trim()
  const filter = String(storeFilter || '').trim()
  if (!filter) return true
  if (!row) return true
  return storesMatchForGradeLookup(row, filter)
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const { searchParams } = new URL(request.url)
    const bankTransactionId = Number(searchParams.get('bankTransactionId') || 0)
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    if (!bankTransactionId) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.', list: [] }, { status: 400, headers })
    }

    const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
      select: 'id,trans_type,amount,trans_date,memo,note',
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

    const bankAmount = parseMoneyAmount(bankRow.amount)
    const bankDate = String(bankRow.trans_date || '').slice(0, 10)
    const bankMemo = String(bankRow.memo || '')
    const bankNote = String(bankRow.note || '')
    const [accrualRows, payableRows] = await Promise.all([
      supabaseSelectFilter('expense_accruals', 'status=in.(planned,approved,partial,paid,done)', {
        select: 'id,payee_code,payee_name,amount,withholding_tax_amount,expense_date,due_date,memo,account_subject_id,store_name,status,approved_at,approved_by',
        order: 'expense_date.asc,id.asc',
        limit: 5000,
      }) as Promise<ExpenseAccrualRow[]>,
      supabaseSelectFilter('payable_transactions', 'id=gt.0', {
        select: 'amount,expense_accrual_id,bank_transaction_id,petty_cash_transaction_id',
        limit: 20000,
      }) as Promise<PayableTxRow[]>,
    ])

    const paidByAccrual = new Map<number, number>()
    for (const tx of payableRows || []) {
      const accrualId = Number(tx.expense_accrual_id || 0)
      if (!accrualId) continue
      // 통장·패티 미연결 Payment(고아)는 잔액 차감에서 제외 → 재연결 가능
      if (!isSettledExpensePayment(tx)) continue
      const amt = Number(tx.amount || 0)
      paidByAccrual.set(accrualId, (paidByAccrual.get(accrualId) || 0) + Math.abs(amt))
    }

    const rawList = (accrualRows || [])
      .map((r) => {
        const id = Number(r.id || 0)
        const wht = Math.max(0, Math.abs(Number(r.withholding_tax_amount ?? 0) || 0))
        const plannedAmount = expenseAccrualNetPayable(parseMoneyAmount(r.amount), wht)
        const paidAmount = paidByAccrual.get(id) || 0
        const remainingAmount = Math.max(0, roundMoney2(plannedAmount - paidAmount))
        const decoded = decodePayeeCode(r.payee_code)
        const rawStatus = String(r.status || '').toLowerCase() || 'approved'
        // UI/선택용: 고아 paid 는 approved 로 노출해 연결 가능하게 함
        const status =
          (rawStatus === 'paid' || rawStatus === 'done') && paidAmount <= 0.009 ? 'approved' : rawStatus
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
          status,
          approvedAt: r.approved_at ? String(r.approved_at) : '',
          approvedBy: r.approved_by || '',
        }
      })
      .filter((r) => {
        // due_date 우선이면 발생일과 통장일이 같아도 누락됨 → 둘 중 하나 일치면 허용
        const due = String(r.dueDate || '').slice(0, 10)
        const exp = String(r.expenseDate || '').slice(0, 10)
        return due === bankDate || exp === bankDate
      })
      .filter((r) => LINKABLE_ACCRUAL_STATUSES.includes(String(r.status || '').toLowerCase() as (typeof LINKABLE_ACCRUAL_STATUSES)[number]))
      .filter((r) => (r.remainingAmount || 0) > 0)

    let storeScopedList = rawList
    if (storeFilter) {
      const matched = rawList.filter((r) => accrualMatchesStore(r.storeName, storeFilter))
      storeScopedList = matched.length > 0 ? matched : rawList
    }

    const codesForVendor = new Set(
      storeScopedList
        .map((r) => String(r.payeeCode || '').trim().toLowerCase())
        .filter((c) => c && !c.startsWith('auto_'))
    )
    const vendorNameByCode: Record<string, { name: string; gps: string }> = {}
    if (codesForVendor.size > 0) {
      const vrows = (await supabaseSelect('vendors', {
        select: 'code,name,gps_name',
        limit: 5000,
      })) as { code?: string; name?: string; gps_name?: string }[] | null
      for (const v of vrows || []) {
        const c = String(v.code || '')
          .trim()
          .toLowerCase()
        if (!c || !codesForVendor.has(c)) continue
        vendorNameByCode[c] = {
          name: String(v.name || '').trim(),
          gps: String((v as { gps_name?: string }).gps_name || '').trim(),
        }
      }
    }

    const list = storeScopedList
      .map((r) => {
        const c = String(r.payeeCode || '')
          .trim()
          .toLowerCase()
        const vn = c ? vendorNameByCode[c] : undefined
        const ev = evaluatePayeeBankMemoMatch({
          bankMemo,
          bankNote,
          payeeName: r.payeeName,
          payeeCode: r.payeeCode,
          vendorName: vn?.name,
          vendorGpsName: vn?.gps,
        })
        const amountMatch = moneyEqual(r.remainingAmount, bankAmount)
        return {
          ...r,
          payeeMemoMatchQuality: ev.quality,
          payeeMemoMatchDetail: ev.detail,
          amountMatch,
        }
      })
      .sort((a, b) => {
        const amountDiff = Number(b.amountMatch ? 1 : 0) - Number(a.amountMatch ? 1 : 0)
        if (amountDiff !== 0) return amountDiff
        const statusOrder = (s: string) => (s === 'approved' || s === 'partial' ? 0 : 1)
        const sd = statusOrder(String(a.status || '')) - statusOrder(String(b.status || ''))
        if (sd !== 0) return sd
        const qd =
          (MEMO_MATCH_ORDER[a.payeeMemoMatchQuality] ?? 9) -
          (MEMO_MATCH_ORDER[b.payeeMemoMatchQuality] ?? 9)
        if (qd !== 0) return qd
        return a.id - b.id
      })

    return NextResponse.json({
      success: true,
      bankTransaction: {
        id: Number(bankRow.id || 0),
        amount: bankAmount,
        transDate: bankDate,
        memo: bankMemo,
        note: bankNote,
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

