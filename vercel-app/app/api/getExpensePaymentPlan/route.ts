import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

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
  created_at?: string
  approved_by?: string
  approved_at?: string
  approval_note?: string
  rejected_by?: string
  rejected_at?: string
  rejection_note?: string
}

type PayableTxRow = {
  id?: number
  vendor_code?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  expense_accrual_id?: number
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

function inRange(dateStr: string | undefined, startStr: string, endStr: string): boolean {
  const d = String(dateStr || '').slice(0, 10)
  if (!d) return false
  return (!startStr || d >= startStr) && (!endStr || d <= endStr)
}

function isPurchaseWithdrawalCategory(cat: string | undefined): boolean {
  const c = String(cat || '').trim().toLowerCase()
  return c === 'purchase_payment' || c === 'purchase_advance'
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)
    const payeeFilter = String(searchParams.get('payeeFilter') || '').trim().toLowerCase()
    const vendorFilter = String(searchParams.get('vendorFilter') || '').trim().toLowerCase()
    const userRole = String(searchParams.get('userRole') || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) return NextResponse.json({ success: true, expensePlans: [], purchasePlans: [], totals: { expensePlanned: 0, expenseRemaining: 0, logisticsRemaining: 0 }, logisticsPlans: [] }, { headers })

    const [accrualRows, payableRows] = await Promise.all([
      supabaseSelectFilter('expense_accruals', 'id=gt.0', {
        select: 'id,payee_code,payee_name,amount,expense_date,due_date,memo,account_subject_id,store_name,status,created_at,approved_by,approved_at,approval_note,rejected_by,rejected_at,rejection_note',
        order: 'due_date.asc',
        limit: 5000,
      }) as Promise<ExpenseAccrualRow[]>,
      supabaseSelectFilter('payable_transactions', 'id=gt.0', {
        select: 'id,vendor_code,amount,ref_type,ref_id,trans_date,memo,expense_accrual_id',
        order: 'trans_date.desc',
        limit: 10000,
      }) as Promise<PayableTxRow[]>,
    ])

    const paymentByAccrual = new Map<number, number>()
    for (const tx of payableRows || []) {
      const accrualId = Number(tx.expense_accrual_id || 0)
      if (!accrualId) continue
      const amt = Number(tx.amount || 0)
      if (amt < 0) paymentByAccrual.set(accrualId, (paymentByAccrual.get(accrualId) || 0) + Math.abs(amt))
    }

    const mappedAccrualPlans = (accrualRows || [])
      .filter((r) => {
        const decoded = decodePayeeCode(r.payee_code)
        const dateBase = r.due_date || r.expense_date
        if ((startStr || endStr) && !inRange(dateBase, startStr, endStr)) return false
        if (payeeFilter) {
          const target = `${decoded.payeeCode || ''} ${r.payee_name || ''} ${decoded.withdrawalCategory}`.toLowerCase()
          if (!target.includes(payeeFilter)) return false
        }
        return true
      })
      .map((r) => {
        const decoded = decodePayeeCode(r.payee_code)
        const id = Number(r.id || 0)
        const planned = Math.abs(Number(r.amount || 0))
        const paid = paymentByAccrual.get(id) || 0
        const remaining = Math.max(0, planned - paid)
        return {
          id,
          payeeCode: decoded.payeeCode || '',
          payeeName: r.payee_name || r.payee_code || '',
          withdrawalCategory: decoded.withdrawalCategory,
          plannedAmount: planned,
          paidAmount: paid,
          remainingAmount: remaining,
          expenseDate: r.expense_date || '',
          dueDate: r.due_date || '',
          memo: r.memo || '',
          accountSubjectId: r.account_subject_id || null,
          status: (() => {
            const status = (() => {
              const raw = String(r.status || '').toLowerCase()
              if (raw === 'done') return 'paid'
              if (raw === 'partial') return 'approved'
              if (['planned', 'approved', 'paid', 'rejected'].includes(raw)) return raw
              return 'planned'
            })()
            if (status === 'rejected') return 'rejected'
            if (remaining <= 0) return 'paid'
            return status === 'approved' ? 'approved' : 'planned'
          })(),
          approvedBy: r.approved_by || null,
          approvedAt: r.approved_at || null,
          approvalNote: r.approval_note || null,
          rejectedBy: r.rejected_by || null,
          rejectedAt: r.rejected_at || null,
          rejectionNote: r.rejection_note || null,
          storeName: r.store_name || '',
        }
      })
      .sort((a, b) => (a.dueDate || a.expenseDate).localeCompare(b.dueDate || b.expenseDate))

    // purchase_* = 지출 등록에서 등록한 물류 지급예정만. payable_transactions(입고/PO)는 미수금 관리에서 확인
    const expensePlans = mappedAccrualPlans.filter((r) => !isPurchaseWithdrawalCategory(r.withdrawalCategory))
    const purchasePlans = mappedAccrualPlans.filter((r) => isPurchaseWithdrawalCategory(r.withdrawalCategory))

    const purchaseRemaining = purchasePlans.reduce((s, r) => s + r.remainingAmount, 0)
    const totals = {
      expensePlanned: expensePlans.reduce((s, r) => s + r.plannedAmount, 0),
      expenseRemaining: expensePlans.reduce((s, r) => s + r.remainingAmount, 0),
      logisticsRemaining: purchaseRemaining,
    }

    return NextResponse.json(
      { success: true, expensePlans, purchasePlans, totals, logisticsPlans: [] },
      { headers }
    )
  } catch (e) {
    console.error('getExpensePaymentPlan:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '조회 실패' },
      { status: 500, headers }
    )
  }
}
