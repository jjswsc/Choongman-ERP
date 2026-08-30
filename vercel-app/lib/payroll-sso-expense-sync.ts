/**
 * 급여 확정·SSO 신고 완료 시 매장별 사회보험 납부예정(지출발생·미지급·전표) 동기화.
 * 태국 ม.33: 근로자·사업주 각 5% → 납부 총액 = 근로자 SSO × 2 (payroll_records.sso 기준).
 */
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postExpenseAccrualJournal,
} from '@/lib/accounting-posting'
import { buildPayrollMonthPostgrestFilter } from '@/lib/thai-tax-period'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  aggregateSsoRemittanceByStore,
  type PayrollRecordSsoRow,
} from '@/lib/payroll-sso-expense-sync-calc'
import { normalizeMachineCode, resolveVendorCodeFromStore } from '@/lib/vendor-code-policy'

export {
  aggregateSsoRemittanceByStore,
  ssoRemittanceBahtFromEmployeeContribution,
  type PayrollRecordSsoRow,
} from '@/lib/payroll-sso-expense-sync-calc'

export type PayrollSsoExpenseSyncResult = {
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
  account_subject_id?: number | null
  created_by?: string | null
}

function normalizeToken(src: string): string {
  return String(src || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'na'
}

function encodeExpensePayeeCode(base: string): string {
  const b = String(base || '').trim()
  if (!b) return 'sso::wm::expense'
  if (b.includes('::wm::')) return b
  return `${b}::wm::expense`
}

export function buildSsoStorePayeeCode(monthStr: string, store: string): string {
  return encodeExpensePayeeCode(`sso-${monthStr}-${normalizeToken(store)}`)
}

function toMonthDate(monthStr: string, useLastDay: boolean): string {
  const base = new Date(`${monthStr}-01T12:00:00`)
  if (Number.isNaN(base.getTime())) return `${monthStr}-01`
  if (!useLastDay) return `${monthStr}-01`
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return last.toISOString().slice(0, 10)
}

async function resolveSsoAccountSubject(): Promise<AccountSubjectPick> {
  try {
    const rows = (await supabaseSelectFilter('account_subjects', 'type=eq.expense', {
      select: 'id,code,name,type,is_header',
      order: 'sort_order.asc,code.asc',
      limit: 400,
    })) as { id?: number; code?: string; name?: string; is_header?: boolean | null }[] | null
    const list = rows || []
    const picked = list.find((r) => {
      if (r.is_header === true) return false
      const text = `${String(r.code || '')} ${String(r.name || '')}`.toLowerCase()
      return (
        text.includes('sso') ||
        text.includes('social') ||
        text.includes('ประกัน') ||
        text.includes('สังคม') ||
        text.includes('사회보험')
      )
    })
    if (picked?.id) {
      return {
        id: Number(picked.id),
        code: String(picked.code || '5521'),
        name: String(picked.name || '사회보험(SSO)'),
      }
    }
  } catch {
    /* fallback */
  }
  return { id: null, code: '5521', name: '사회보험(SSO)' }
}

async function deletePlannedSsoAccrual(expenseAccrualId: number): Promise<void> {
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${expenseAccrualId}`, {
    select: 'id,status,expense_date,store_name',
    limit: 1,
  })) as AccrualRow[] | null
  const row = rows?.[0]
  if (!row?.id) return
  const status = String(row.status || '').toLowerCase()
  if (status === 'paid') return
  await assertAccountingDateOpen(
    String(row.expense_date || '').slice(0, 10),
    String(row.store_name || '').trim() || null
  )
  await deleteJournalEntriesBySource('expense_accrual', expenseAccrualId)
  await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${expenseAccrualId}`)
  await supabaseDeleteByFilter('expense_accruals', `id=eq.${expenseAccrualId}`)
}

async function upsertStoreSsoAccrual(params: {
  monthStr: string
  store: string
  vendorCode?: string
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
  const dueDate = toMonthDate(monthStr, true)
  const payeeCode = buildSsoStorePayeeCode(monthStr, store)
  const payeeName = `สปส. SSO — ${store}`.slice(0, 200)
  const memo =
    `[SSO] ${monthStr} ${store} · 납부예정(근로자+사업주) ${totalBaht.toLocaleString()}฿ · ${employeeCount}명`.slice(
      0,
      480
    )
  const vendorCode = params.vendorCode || normalizeMachineCode(`SSO:${store}`) || 'SSO:UNKNOWN'

  const existingId = Number(existing?.id || 0)
  const existingStatus = String(existing?.status || '').toLowerCase()
  if (existingId > 0 && existingStatus === 'paid') return 'skipped_paid'

  if (existingId > 0) {
    await assertAccountingDateOpen(expenseDate, store)
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
          memo: `SSO 납부예정 ${monthStr} ${store}`.slice(0, 200),
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
  if (!expenseAccrualId) throw new Error('SSO expense accrual insert failed')

  await supabaseInsert('payable_transactions', {
    vendor_code: vendorCode,
    amount: totalBaht,
    ref_type: 'Expense',
    ref_id: null,
    trans_date: expenseDate,
    memo: `SSO 납부예정 ${monthStr} ${store}`.slice(0, 200),
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

export async function syncPayrollSsoExpenseAccruals(params: {
  month: string
  storeFilter?: string
  payrollRows?: PayrollRecordSsoRow[]
  postedBy?: string
}): Promise<PayrollSsoExpenseSyncResult> {
  const monthStr = String(params.month || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(monthStr)) {
    return { created: 0, updated: 0, skippedPaid: 0, deleted: 0, stores: [] }
  }

  let rows = params.payrollRows
  if (!rows) {
    const monthFilter = buildPayrollMonthPostgrestFilter([monthStr])
    const storeFilter = String(params.storeFilter || '').trim()
    const payrollFilter = appendStoreNameFilter(monthFilter, storeFilter).replace(
      /store_name=eq\./g,
      'store=eq.'
    )
    rows = (await supabaseSelectFilterAllPages('payroll_records', payrollFilter, {
      select: 'store,sso,name',
      order: 'id.asc',
      pageSize: 4000,
      maxRows: 80000,
    })) as PayrollRecordSsoRow[]
  }

  const storeFilter = String(params.storeFilter || '').trim()
  const filtered = (rows || []).filter((r) => {
    const store = String(r.store || '').trim()
    if (!store) return false
    if (storeFilter && storeFilter !== 'All' && !storesMatchForGradeLookup(store, storeFilter)) {
      return false
    }
    return true
  })

  const byStore = aggregateSsoRemittanceByStore(filtered)
  const expenseSubject = await resolveSsoAccountSubject()

  const monthlyPrefix = `sso-${monthStr}-`
  const existingRows = (await supabaseSelectFilter(
    'expense_accruals',
    `payee_code=ilike.${encodeURIComponent(`${monthlyPrefix}%::wm::expense`)}`,
    { select: 'id,payee_code,status,expense_date,store_name', limit: 500 }
  )) as AccrualRow[] | null

  const existingByStore = new Map<string, AccrualRow>()
  for (const row of existingRows || []) {
    const storeName = String(row.store_name || '').trim()
    if (storeName) existingByStore.set(storeName, row)
  }

  let created = 0
  let updated = 0
  let skippedPaid = 0
  let deleted = 0
  const storeTotals: PayrollSsoExpenseSyncResult['stores'] = []

  for (const [store, agg] of byStore.entries()) {
    const linkedVendorCode = await resolveVendorCodeFromStore(store)
    const payableVendorCode = linkedVendorCode || normalizeMachineCode(`SSO:${store}`) || ''
    storeTotals.push({
      store,
      totalBaht: agg.totalBaht,
      employeeCount: agg.employeeCount,
    })
    const existing = existingByStore.get(store) || null
    const result = await upsertStoreSsoAccrual({
      monthStr,
      store,
      vendorCode: payableVendorCode,
      totalBaht: agg.totalBaht,
      employeeCount: agg.employeeCount,
      expenseSubject,
      existing,
      postedBy: params.postedBy,
    })
    if (result === 'created') created += 1
    else if (result === 'updated') updated += 1
    else skippedPaid += 1
    existingByStore.delete(store)
  }

  for (const [, row] of existingByStore) {
    const id = Number(row.id || 0)
    if (id <= 0) continue
    const status = String(row.status || '').toLowerCase()
    if (status === 'paid') {
      skippedPaid += 1
      continue
    }
    await deletePlannedSsoAccrual(id)
    deleted += 1
  }

  return { created, updated, skippedPaid, deleted, stores: storeTotals }
}
