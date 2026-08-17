/**
 * 오피스(본사) 급여 확정 시 지출관리에는 직원별 행 대신 매장·월 합산 1건만 동기화.
 * 개인 명세는 급여 관리(오피스 급여 담당/Director)에서만 조회.
 */
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postExpenseAccrualJournal,
} from '@/lib/accounting-posting'
import { isOfficeStore } from '@/lib/permissions'
import { payrollPayYmdFromAttributionMonth } from '@/lib/payroll-utils'
import { normalizeMachineCode } from '@/lib/vendor-code-policy'
import {
  aggregateOfficeNetPayByStore,
  buildOfficePayrollAggregatePayeeCode,
  isOfficePayrollAggregatePayeeCode,
  payrollExpensePayeePrefix,
  type PayrollOfficeNetRow,
} from '@/lib/payroll-office-expense-sync-calc'

export type PayrollOfficeExpenseSyncResult = {
  created: number
  updated: number
  skippedPaid: number
  deleted: number
  stores: { store: string; totalBaht: number; employeeCount: number }[]
}

type AccountSubjectPick = { id: number | null; code: string; name: string }

type AccrualRow = {
  id?: number
  payee_code?: string
  status?: string
  expense_date?: string
  store_name?: string | null
  amount?: number | null
}

function toMonthDate(monthStr: string, useLastDay: boolean): string {
  const base = new Date(`${monthStr}-01T12:00:00`)
  if (Number.isNaN(base.getTime())) return `${monthStr}-01`
  if (!useLastDay) return `${monthStr}-01`
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return last.toISOString().slice(0, 10)
}

async function deletePlannedPayrollAccrual(expenseAccrualId: number): Promise<void> {
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
    select: 'id,status,expense_date',
    limit: 1,
  })) as AccrualRow[] | null
  const row = rows?.[0]
  if (!row?.id) return
  const status = String(row.status || '').toLowerCase()
  if (status === 'paid') return
  await assertAccountingDateOpen(String(row.expense_date || '').slice(0, 10))
  await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
  await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`)
  await supabaseDeleteByFilter('expense_accruals', `id=eq.${expenseAccrualId}`)
}

async function upsertOfficeAggregateAccrual(params: {
  monthStr: string
  store: string
  totalBaht: number
  employeeCount: number
  expenseSubject: AccountSubjectPick
  existing?: AccrualRow | null
  postedBy?: string
}): Promise<'created' | 'updated' | 'skipped_paid'> {
  const { monthStr, store, totalBaht, employeeCount, expenseSubject, existing, postedBy } = params
  if (totalBaht <= 0) return 'skipped_paid'

  if (expenseSubject.id != null) {
    const hdr = await assertAccountSubjectNotHeader(expenseSubject.id)
    if (!hdr.ok) throw new Error(hdr.message)
  }

  const expenseDate = toMonthDate(monthStr, false)
  const dueDate = payrollPayYmdFromAttributionMonth(monthStr) || toMonthDate(monthStr, true)
  const payeeCode = buildOfficePayrollAggregatePayeeCode(monthStr, store)
  const payeeName = `Payroll — ${store}`.slice(0, 200)
  const memo =
    `[PAYROLL] ${monthStr} ${store} · 합산 ${employeeCount}명`.slice(0, 480)
  const vendorCode = normalizeMachineCode(`PAYROLL:${store}`) || 'PAYROLL:OFFICE'

  const existingId = Number(existing?.id || 0)
  const existingStatus = String(existing?.status || '').toLowerCase()
  if (existingId > 0 && existingStatus === 'paid') return 'skipped_paid'

  if (existingId > 0) {
    await assertAccountingDateOpen(expenseDate)
    await supabaseUpdate('expense_accruals', existingId, {
      payee_code: payeeCode,
      payee_name: payeeName,
      amount: totalBaht,
      expense_date: expenseDate,
      due_date: dueDate,
      memo,
      store_name: store,
      account_subject_id: expenseSubject.id,
      status: existingStatus === 'approved' ? 'approved' : 'planned',
      updated_at: new Date().toISOString(),
    })
    const payRows = (await supabaseSelectFilter(
      'payable_transactions',
      `expense_accrual_id=eq.${existingId}&ref_type=eq.Expense`,
      { order: 'id.asc', limit: 30, select: 'id' }
    )) as { id?: number }[]
    if (payRows?.length) {
      const keep = payRows[0].id
      if (keep) {
        await supabaseUpdate('payable_transactions', keep, {
          amount: totalBaht,
          trans_date: expenseDate,
          memo: `급여 발생(합산) ${monthStr} ${store}`.slice(0, 200),
          vendor_code: vendorCode,
          account_subject_id: expenseSubject.id,
          expense_date: expenseDate,
          due_date: dueDate,
        })
      }
      for (const p of payRows.slice(1)) {
        if (p.id) await supabaseDeleteByFilter('payable_transactions', `id=eq.${p.id}`)
      }
    }
    await deleteJournalEntriesBySource('expense_accrual', existingId)
    await postExpenseAccrualJournal({
      expenseAccrualId: existingId,
      accountingDate: expenseDate,
      amountAbs: totalBaht,
      expenseAccountCode: expenseSubject.code,
      expenseAccountName: expenseSubject.name,
      expenseAccountSubjectId: expenseSubject.id,
      memo,
      storeName: store,
      postedBy,
    })
    return 'updated'
  }

  const inserted = (await supabaseInsert('expense_accruals', {
    payee_code: payeeCode,
    payee_name: payeeName,
    amount: totalBaht,
    expense_date: expenseDate,
    due_date: dueDate,
    memo,
    store_name: store,
    account_subject_id: expenseSubject.id,
    created_by: postedBy || null,
    status: 'planned',
  })) as { id?: number }[]
  const expenseAccrualId = Number(inserted?.[0]?.id || 0)
  if (!expenseAccrualId) throw new Error('Office payroll expense accrual insert failed')

  await supabaseInsert('payable_transactions', {
    vendor_code: vendorCode,
    amount: totalBaht,
    ref_type: 'Expense',
    ref_id: null,
    trans_date: expenseDate,
    memo: `급여 발생(합산) ${monthStr} ${store}`.slice(0, 200),
    expense_accrual_id: expenseAccrualId,
    account_subject_id: expenseSubject.id,
    expense_date: expenseDate,
    due_date: dueDate,
  })

  await postExpenseAccrualJournal({
    expenseAccrualId,
    accountingDate: expenseDate,
    amountAbs: totalBaht,
    expenseAccountCode: expenseSubject.code,
    expenseAccountName: expenseSubject.name,
    expenseAccountSubjectId: expenseSubject.id,
    memo,
    storeName: store,
    postedBy,
  })
  return 'created'
}

/**
 * 오피스 매장 급여만 합산 1건으로 동기화하고, 직원별 planned/approved 급여 지출 행은 제거.
 * 이미 paid 된 직원별 행이 있으면(레거시) 해당 매장은 합산을 건너뛰고 paid 행은 유지.
 */
export async function syncOfficePayrollExpenseAccruals(params: {
  month: string
  payrollRows: PayrollOfficeNetRow[]
  expenseSubject: AccountSubjectPick
  postedBy?: string
}): Promise<PayrollOfficeExpenseSyncResult> {
  const monthStr = String(params.month || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return { created: 0, updated: 0, skippedPaid: 0, deleted: 0, stores: [] }
  }

  const byStore = aggregateOfficeNetPayByStore(params.payrollRows || [], isOfficeStore)
  if (byStore.size === 0) {
    return { created: 0, updated: 0, skippedPaid: 0, deleted: 0, stores: [] }
  }

  const prefix = payrollExpensePayeePrefix(monthStr)
  const existingRows = (await supabaseSelectFilter(
    'expense_accruals',
    `payee_code=ilike.${encodeURIComponent(`${prefix}%::wm::expense`)}`,
    { select: 'id,payee_code,status,expense_date,store_name,amount', limit: 5000 }
  )) as AccrualRow[] | null

  const officeExisting = (existingRows || []).filter((r) =>
    isOfficeStore(String(r.store_name || ''))
  )

  let created = 0
  let updated = 0
  let skippedPaid = 0
  let deleted = 0
  const storeTotals: PayrollOfficeExpenseSyncResult['stores'] = []

  for (const [store, agg] of byStore.entries()) {
    storeTotals.push({
      store,
      totalBaht: agg.totalBaht,
      employeeCount: agg.employeeCount,
    })

    const forStore = officeExisting.filter(
      (r) => String(r.store_name || '').trim().toLowerCase() === store.trim().toLowerCase()
    )
    const paidIndividuals = forStore.filter((r) => {
      const code = String(r.payee_code || '')
      if (isOfficePayrollAggregatePayeeCode(code)) return false
      return String(r.status || '').toLowerCase() === 'paid'
    })
    if (paidIndividuals.length > 0) {
      // 이미 개인별로 지급된 레거시 월 — 합산 행을 추가하면 이중 계상
      skippedPaid += 1
      continue
    }

    const existingAgg =
      forStore.find((r) => isOfficePayrollAggregatePayeeCode(String(r.payee_code || ''))) || null

    const result = await upsertOfficeAggregateAccrual({
      monthStr,
      store,
      totalBaht: agg.totalBaht,
      employeeCount: agg.employeeCount,
      expenseSubject: params.expenseSubject,
      existing: existingAgg,
      postedBy: params.postedBy,
    })
    if (result === 'created') created += 1
    else if (result === 'updated') updated += 1
    else skippedPaid += 1

    for (const row of forStore) {
      const code = String(row.payee_code || '')
      if (isOfficePayrollAggregatePayeeCode(code)) continue
      const id = Number(row.id || 0)
      if (id <= 0) continue
      if (String(row.status || '').toLowerCase() === 'paid') continue
      await deletePlannedPayrollAccrual(id)
      deleted += 1
    }
  }

  return { created, updated, skippedPaid, deleted, stores: storeTotals }
}
