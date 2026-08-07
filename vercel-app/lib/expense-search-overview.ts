import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { buildExpenseAccrualPlanDateFilters } from '@/lib/expense-accrual-plan-filters'
import { expenseAccrualNetPayable } from '@/lib/expense-accrual-net'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export type ExpenseSearchRelation =
  | 'plan_only'
  | 'approved_unpaid'
  | 'paid_bank'
  | 'paid_petty'
  | 'rejected'
  | 'bank_only'
  | 'card_only'

export interface ExpenseSearchOverviewRow {
  rowKey: string
  relation: ExpenseSearchRelation
  storeName: string
  category: string
  payeeCode?: string
  payeeName?: string
  accountSubjectId?: number | null
  vendorCode?: string
  plannedAmount?: number
  grossAmount?: number
  vatAmount?: number
  withholdingTaxAmount?: number
  paidAmount?: number
  accrualStatus?: string
  remainingAmount?: number
  bankAmount?: number
  expenseDate?: string
  dueDate?: string
  bankTransDate?: string
  accrualId?: number
  bankTransactionId?: number
  cardTransactionId?: number
  accountId?: number
  planStatus?: 'planned' | 'approved' | 'paid' | 'rejected'
  memo?: string
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  documentNo?: string
  bankLinked?: boolean
  pettyLinked?: boolean
  linkStatus?: string
}

export interface ExpenseSearchOverviewSummary {
  planOnly: number
  approvedUnpaid: number
  paid: number
  bankOnly: number
  rejected: number
}

type ExpenseAccrualRow = {
  id?: number
  payee_code?: string
  payee_name?: string
  amount?: number
  vat_amount?: number | null
  withholding_tax_amount?: number | null
  expense_date?: string
  due_date?: string
  memo?: string
  account_subject_id?: number
  store_name?: string
  status?: string
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
  document_no?: string | null
}

type BankTxRow = {
  id?: number
  account_id?: number
  trans_date?: string
  amount?: number
  memo?: string
  note?: string
  category?: string
  account_subject_id?: number
  expense_date?: string
  vendor_code?: string
  store_name?: string
  invoice_received?: boolean
  invoice_no?: string
  invoice_photo_url?: string
  document_no?: string | null
}

type CardTxRow = {
  id?: number
  card_account_id?: number
  trans_date?: string
  amount?: number
  memo?: string
  vendor_code?: string
  account_subject_id?: number | null
  note?: string | null
  is_bill_header?: boolean | null
  parent_id?: number | null
  document_no?: string | null
}

type PayableLinkRow = {
  bank_transaction_id?: number
  expense_accrual_id?: number | null
  petty_cash_transaction_id?: number | null
  amount?: number
}

const ACCRUAL_SELECT =
  'id,payee_code,payee_name,amount,vat_amount,withholding_tax_amount,expense_date,due_date,memo,account_subject_id,store_name,status,invoice_received,invoice_no,invoice_photo_url,document_no'

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  return {
    payeeCode: src.slice(0, idx).trim(),
    withdrawalCategory: src.slice(idx + marker.length).trim().toLowerCase() || 'expense',
  }
}

function inRange(dateStr: string | undefined, startStr: string, endStr: string): boolean {
  const d = String(dateStr || '').slice(0, 10)
  if (!d) return false
  return (!startStr || d >= startStr) && (!endStr || d <= endStr)
}

function accrualMatchesPlanDateRange(r: ExpenseAccrualRow, startStr: string, endStr: string): boolean {
  if (!startStr && !endStr) return true
  return inRange(r.expense_date, startStr, endStr) || inRange(r.due_date, startStr, endStr)
}

function storeMatchesFilter(storeName: string, storeFilter: string): boolean {
  const sn = String(storeName || '').trim()
  if (!storeFilter || storeFilter === '__all__') return true
  if (!sn) return false
  return storesMatchForGradeLookup(storeFilter, sn)
}

function storeAllowedForAuth(storeName: string, scopedAllowedStores: string[]): boolean {
  if (scopedAllowedStores.length === 0) return true
  const sn = String(storeName || '').trim()
  if (!sn) return false
  return scopedAllowedStores.some((s) => storesMatchForGradeLookup(s, sn))
}

function resolvePlanStatus(
  rawStatus: string | undefined,
  remaining: number
): 'planned' | 'approved' | 'paid' | 'rejected' {
  const raw = String(rawStatus || '').toLowerCase()
  if (raw === 'rejected') return 'rejected'
  // DB status paid/done 은 remaining 과 무관하게 지급완료로 표시 (오표시 plan_only 방지)
  if (raw === 'paid' || raw === 'done') return 'paid'
  if (remaining <= 0) return 'paid'
  if (raw === 'approved' || raw === 'partial') return 'approved'
  return 'planned'
}

function resolveRelation(
  planStatus: 'planned' | 'approved' | 'paid' | 'rejected',
  hasBank: boolean,
  hasPetty: boolean,
  isBankOnly: boolean
): ExpenseSearchRelation {
  if (isBankOnly) return 'bank_only'
  if (planStatus === 'rejected') return 'rejected'
  if (hasBank) return 'paid_bank'
  if (hasPetty && planStatus === 'paid') return 'paid_petty'
  if (planStatus === 'approved') return 'approved_unpaid'
  // paid/done 이지만 통장·패티 미연결(오표시) — paid_bank 로 위장하지 않음
  return 'plan_only'
}

function parseBankCategory(note: string, category?: string): string {
  const catMatch = String(note || '').match(/withdrawal_category:([a-z_]+)/i)
  return (catMatch?.[1] || '').toLowerCase() || String(category || 'expense').toLowerCase()
}

async function fetchAccrualsForRange(startStr: string, endStr: string): Promise<ExpenseAccrualRow[]> {
  const filters = buildExpenseAccrualPlanDateFilters(startStr, endStr)
  const batches = await Promise.all(
    filters.map(
      (filter) =>
        supabaseSelectFilter('expense_accruals', filter, {
          select: ACCRUAL_SELECT,
          order: 'due_date.asc,expense_date.asc,id.desc',
          limit: 5000,
        }) as Promise<ExpenseAccrualRow[]>
    )
  )
  const byId = new Map<number, ExpenseAccrualRow>()
  for (const rows of batches) {
    for (const r of rows || []) {
      const id = Number(r.id || 0)
      if (id > 0) byId.set(id, r)
    }
  }
  return [...byId.values()]
}

async function fetchAccrualsByIds(ids: number[]): Promise<ExpenseAccrualRow[]> {
  if (ids.length === 0) return []
  const idList = ids.join(',')
  return (await supabaseSelectFilter('expense_accruals', `id=in.(${idList})`, {
    select: ACCRUAL_SELECT,
    limit: ids.length,
  })) as ExpenseAccrualRow[]
}

async function fetchBankRegisterRows(
  startStr: string,
  endStr: string,
  accountId?: string
): Promise<BankTxRow[]> {
  const parts: string[] = [
    'trans_type=eq.withdraw',
    `note=ilike.${encodeURIComponent('*withdrawal_category*')}`,
    `trans_date=gte.${startStr}`,
    `trans_date=lte.${endStr}`,
  ]
  if (accountId) parts.push(`account_id=eq.${accountId}`)
  return (await supabaseSelectFilter('bank_transactions', parts.join('&'), {
    order: 'trans_date.desc,id.desc',
    limit: 20000,
    select:
      'id,account_id,trans_date,amount,memo,note,category,account_subject_id,expense_date,vendor_code,store_name,invoice_received,invoice_no,invoice_photo_url,document_no',
  })) as BankTxRow[]
}

async function fetchBankRowsByIds(ids: number[]): Promise<BankTxRow[]> {
  if (ids.length === 0) return []
  const idList = ids.join(',')
  return (await supabaseSelectFilter('bank_transactions', `id=in.(${idList})`, {
    select:
      'id,account_id,trans_date,amount,memo,note,category,account_subject_id,expense_date,vendor_code,store_name,invoice_received,invoice_no,invoice_photo_url,document_no',
    limit: ids.length,
  })) as BankTxRow[]
}

async function fetchCardExpenseRows(startStr: string, endStr: string): Promise<CardTxRow[]> {
  try {
    return (await supabaseSelectFilter(
      'card_transactions',
      `trans_type=eq.expense&trans_date=gte.${startStr}&trans_date=lte.${endStr}`,
      {
        order: 'trans_date.desc,id.desc',
        limit: 10000,
        select:
          'id,card_account_id,trans_date,amount,memo,vendor_code,account_subject_id,note,is_bill_header,parent_id,document_no',
      }
    )) as CardTxRow[]
  } catch (e) {
    console.warn('fetchCardExpenseRows:', e)
    return []
  }
}

async function fetchCardAccountStoreMap(): Promise<Map<number, string>> {
  try {
    const rows = (await supabaseSelect('card_accounts', {
      select: 'id,store',
      limit: 2000,
    })) as { id?: number; store?: string }[]
    const map = new Map<number, string>()
    for (const r of rows || []) {
      const id = Number(r.id || 0)
      if (id > 0) map.set(id, String(r.store || '').trim())
    }
    return map
  } catch {
    return new Map()
  }
}

async function fetchAccountStoreMap(): Promise<Map<number, string>> {
  const rows = (await supabaseSelect('bank_accounts', {
    select: 'id,store',
    limit: 2000,
  })) as { id?: number; store?: string }[]
  const map = new Map<number, string>()
  for (const r of rows || []) {
    const id = Number(r.id || 0)
    if (id > 0) map.set(id, String(r.store || '').trim())
  }
  return map
}

function resolveBankStore(row: BankTxRow, accountStoreMap: Map<number, string>): string {
  return String(row.store_name || '').trim() || accountStoreMap.get(Number(row.account_id || 0)) || ''
}

function matchesCategory(category: string, categoryFilter: string): boolean {
  if (!categoryFilter) return true
  const rowCat = String(category || '').toLowerCase()
  if (categoryFilter === 'expense') return rowCat === 'expense' || rowCat === 'fixed'
  return rowCat === categoryFilter
}

function matchesVendor(
  vendorFilter: string,
  vendorCode?: string,
  payeeCode?: string,
  payeeName?: string
): boolean {
  const needle = vendorFilter.trim().toLowerCase()
  if (!needle) return true
  const hay = `${vendorCode || ''} ${payeeCode || ''} ${payeeName || ''}`.toLowerCase()
  return hay.includes(needle)
}

function matchesDocumentNo(documentNoFilter: string, ...docs: Array<string | null | undefined>): boolean {
  const needle = documentNoFilter.trim().toLowerCase()
  if (!needle) return true
  return docs.some((d) => String(d || '').toLowerCase().includes(needle))
}

export async function buildExpenseSearchOverview(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  accountId?: string
  categoryFilter?: string
  vendorFilter?: string
  documentNoFilter?: string
  scopedAllowedStores: string[]
}): Promise<{ list: ExpenseSearchOverviewRow[]; summary: ExpenseSearchOverviewSummary }> {
  const {
    startStr,
    endStr,
    storeFilter = '',
    accountId = '',
    categoryFilter = '',
    vendorFilter = '',
    documentNoFilter = '',
    scopedAllowedStores,
  } = params

  if (!startStr || !endStr) {
    return {
      list: [],
      summary: { planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 },
    }
  }

  const [accrualRows, bankRowsInRange, accountStoreMap, payableLinks, cardRows, cardStoreMap] = await Promise.all([
    fetchAccrualsForRange(startStr, endStr),
    fetchBankRegisterRows(startStr, endStr, accountId || undefined),
    fetchAccountStoreMap(),
    supabaseSelectFilter('payable_transactions', 'expense_accrual_id=not.is.null', {
      select: 'bank_transaction_id,expense_accrual_id,petty_cash_transaction_id,amount',
      limit: 20000,
    }) as Promise<PayableLinkRow[]>,
    fetchCardExpenseRows(startStr, endStr),
    fetchCardAccountStoreMap(),
  ])

  const paymentByAccrual = new Map<number, number>()
  const bankByAccrual = new Map<number, number>()
  const pettyAccrualSet = new Set<number>()
  const bankToAccrual = new Map<number, number>()
  const plannedBankSet = new Set<number>()

  for (const p of payableLinks || []) {
    const accrualId = Number(p.expense_accrual_id || 0)
    const bankId = Number(p.bank_transaction_id || 0)
    const pettyId = Number(p.petty_cash_transaction_id || 0)
    const amt = Number(p.amount || 0)
    if (accrualId > 0 && amt < 0) {
      paymentByAccrual.set(accrualId, (paymentByAccrual.get(accrualId) || 0) + Math.abs(amt))
    }
    if (accrualId > 0 && bankId > 0) {
      bankByAccrual.set(accrualId, bankId)
      bankToAccrual.set(bankId, accrualId)
      plannedBankSet.add(bankId)
    }
    if (accrualId > 0 && pettyId > 0) {
      pettyAccrualSet.add(accrualId)
    }
  }

  const accrualIdsInRange = new Set<number>()
  const mappedAccruals: Array<{
    row: ExpenseAccrualRow
    decoded: ReturnType<typeof decodePayeeCode>
    gross: number
    vatAmt: number
    wht: number
    paid: number
    planned: number
    remaining: number
    planStatus: 'planned' | 'approved' | 'paid' | 'rejected'
  }> = []

  for (const r of accrualRows || []) {
    if ((startStr || endStr) && !accrualMatchesPlanDateRange(r, startStr, endStr)) continue
    const storeName = String(r.store_name || '').trim()
    if (!storeAllowedForAuth(storeName, scopedAllowedStores)) continue
    if (!storeMatchesFilter(storeName, storeFilter)) continue

    const decoded = decodePayeeCode(r.payee_code)
    if (!matchesCategory(decoded.withdrawalCategory, categoryFilter)) continue
    if (!matchesVendor(vendorFilter, undefined, decoded.payeeCode, r.payee_name)) continue
    if (!matchesDocumentNo(documentNoFilter, r.document_no)) continue

    const id = Number(r.id || 0)
    if (id <= 0) continue
    accrualIdsInRange.add(id)

    const gross = Math.abs(Number(r.amount || 0))
    const vatAmt = Math.max(0, Math.abs(Number(r.vat_amount ?? 0) || 0))
    const wht = Math.max(0, Math.abs(Number(r.withholding_tax_amount ?? 0) || 0))
    const planned = expenseAccrualNetPayable(gross, wht)
    const paid = paymentByAccrual.get(id) || 0
    const remaining = Math.max(0, planned - paid)
    const planStatus = resolvePlanStatus(r.status, remaining)

    mappedAccruals.push({ row: r, decoded, gross, vatAmt, wht, paid, planned, remaining, planStatus })
  }

  const linkedBankIds = new Set<number>(
    mappedAccruals.map((a) => bankByAccrual.get(Number(a.row.id || 0)) || 0).filter((id) => id > 0)
  )
  const missingBankIds = [...linkedBankIds].filter((id) => !bankRowsInRange.some((b) => Number(b.id) === id))
  const extraBankRows = missingBankIds.length > 0 ? await fetchBankRowsByIds(missingBankIds) : []
  const bankById = new Map<number, BankTxRow>()
  for (const b of [...bankRowsInRange, ...extraBankRows]) {
    const id = Number(b.id || 0)
    if (id > 0) bankById.set(id, b)
  }

  const rows: ExpenseSearchOverviewRow[] = []
  const representedBankIds = new Set<number>()

  for (const { row, decoded, gross, vatAmt, wht, paid, planned, remaining, planStatus } of mappedAccruals) {
    const accrualId = Number(row.id || 0)
    const bankId = bankByAccrual.get(accrualId) || 0
    const hasBank = bankId > 0
    const hasPetty = pettyAccrualSet.has(accrualId)
    const bank = hasBank ? bankById.get(bankId) : undefined
    if (hasBank) representedBankIds.add(bankId)

    const relation = resolveRelation(planStatus, hasBank, hasPetty, false)
    const vendorCode =
      ['purchase_payment', 'purchase_advance'].includes(decoded.withdrawalCategory) && decoded.payeeCode
        ? decoded.payeeCode
        : undefined

    rows.push({
      rowKey: `accrual-${accrualId}`,
      relation,
      storeName: String(row.store_name || '').trim(),
      category: decoded.withdrawalCategory,
      payeeCode: decoded.payeeCode || undefined,
      payeeName: String(row.payee_name || decoded.payeeCode || '').trim() || undefined,
      accountSubjectId: row.account_subject_id ?? null,
      vendorCode,
      plannedAmount: planned,
      grossAmount: gross,
      vatAmount: vatAmt,
      withholdingTaxAmount: wht,
      paidAmount: paid,
      accrualStatus: String(row.status || '').toLowerCase() || 'planned',
      remainingAmount: remaining,
      bankAmount: bank ? Math.abs(Number(bank.amount) || 0) : undefined,
      expenseDate: row.expense_date ? String(row.expense_date).slice(0, 10) : undefined,
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
      bankTransDate: bank ? String(bank.trans_date || '').slice(0, 10) : undefined,
      accrualId,
      bankTransactionId: hasBank ? bankId : undefined,
      accountId: bank ? Number(bank.account_id || 0) || undefined : undefined,
      planStatus,
      memo: String(row.memo || '').trim() || undefined,
      invoiceReceived: Boolean(row.invoice_received ?? bank?.invoice_received),
      invoiceNo: String(row.invoice_no || bank?.invoice_no || '').trim() || undefined,
      invoicePhotoUrl: String(row.invoice_photo_url || bank?.invoice_photo_url || '').trim() || undefined,
      documentNo: String(row.document_no || bank?.document_no || '').trim() || undefined,
      bankLinked: hasBank,
      pettyLinked: hasPetty,
      linkStatus: hasBank ? 'bank_plan' : hasPetty ? 'petty' : 'unlinked',
    })
  }

  const orphanAccrualIds = [...new Set(
    bankRowsInRange
      .map((b) => Number(bankToAccrual.get(Number(b.id || 0)) || 0))
      .filter((id) => id > 0 && !accrualIdsInRange.has(id))
  )]
  const orphanAccruals = orphanAccrualIds.length > 0 ? await fetchAccrualsByIds(orphanAccrualIds) : []
  const orphanAccrualById = new Map<number, ExpenseAccrualRow>()
  for (const r of orphanAccruals) {
    const id = Number(r.id || 0)
    if (id > 0) orphanAccrualById.set(id, r)
  }

  for (const bank of bankRowsInRange) {
    const bankId = Number(bank.id || 0)
    if (!bankId || representedBankIds.has(bankId)) continue

    const storeName = resolveBankStore(bank, accountStoreMap)
    if (!storeAllowedForAuth(storeName, scopedAllowedStores)) continue
    if (!storeMatchesFilter(storeName, storeFilter)) continue

    const category = parseBankCategory(String(bank.note || ''), bank.category)
    if (!matchesCategory(category, categoryFilter)) continue

    const linkedAccrualId = Number(bankToAccrual.get(bankId) || 0)
    const linkedAccrual = linkedAccrualId > 0 ? orphanAccrualById.get(linkedAccrualId) : undefined
    const decoded = linkedAccrual ? decodePayeeCode(linkedAccrual.payee_code) : null
    const vendorCode = String(bank.vendor_code || decoded?.payeeCode || '').trim() || undefined

    if (!matchesVendor(vendorFilter, vendorCode, decoded?.payeeCode, linkedAccrual?.payee_name)) continue
    if (
      !matchesDocumentNo(
        documentNoFilter,
        bank.document_no,
        linkedAccrual?.document_no
      )
    ) {
      continue
    }

    rows.push({
      rowKey: `bank-${bankId}`,
      relation: linkedAccrualId > 0 ? 'paid_bank' : 'bank_only',
      storeName,
      category,
      payeeCode: decoded?.payeeCode || vendorCode,
      payeeName: linkedAccrual
        ? String(linkedAccrual.payee_name || decoded?.payeeCode || '').trim() || undefined
        : undefined,
      accountSubjectId: bank.account_subject_id ?? linkedAccrual?.account_subject_id ?? null,
      vendorCode,
      plannedAmount: linkedAccrual
        ? expenseAccrualNetPayable(
            Math.abs(Number(linkedAccrual.amount || 0)),
            Math.max(0, Math.abs(Number(linkedAccrual.withholding_tax_amount ?? 0) || 0))
          )
        : undefined,
      bankAmount: Math.abs(Number(bank.amount) || 0),
      expenseDate: linkedAccrual?.expense_date
        ? String(linkedAccrual.expense_date).slice(0, 10)
        : bank.expense_date
          ? String(bank.expense_date).slice(0, 10)
          : undefined,
      dueDate: linkedAccrual?.due_date ? String(linkedAccrual.due_date).slice(0, 10) : undefined,
      bankTransDate: String(bank.trans_date || '').slice(0, 10),
      accrualId: linkedAccrualId > 0 ? linkedAccrualId : undefined,
      bankTransactionId: bankId,
      accountId: Number(bank.account_id || 0) || undefined,
      planStatus: linkedAccrual
        ? resolvePlanStatus(
            linkedAccrual.status,
            Math.max(
              0,
              expenseAccrualNetPayable(
                Math.abs(Number(linkedAccrual.amount || 0)),
                Math.max(0, Math.abs(Number(linkedAccrual.withholding_tax_amount ?? 0) || 0))
              ) - (paymentByAccrual.get(linkedAccrualId) || 0)
            )
          )
        : undefined,
      memo: String(bank.memo || linkedAccrual?.memo || '').trim() || undefined,
      invoiceReceived: Boolean(bank.invoice_received ?? linkedAccrual?.invoice_received),
      invoiceNo: String(bank.invoice_no || linkedAccrual?.invoice_no || '').trim() || undefined,
      invoicePhotoUrl: String(bank.invoice_photo_url || linkedAccrual?.invoice_photo_url || '').trim() || undefined,
      documentNo: String(bank.document_no || linkedAccrual?.document_no || '').trim() || undefined,
      bankLinked: plannedBankSet.has(bankId),
      pettyLinked: false,
      linkStatus: plannedBankSet.has(bankId) ? 'bank_plan' : 'unlinked',
    })
  }

  for (const card of cardRows || []) {
    if (Boolean(card.is_bill_header) || Number(card.parent_id || 0) > 0) continue
    const cardId = Number(card.id || 0)
    if (!cardId) continue
    const storeName = cardStoreMap.get(Number(card.card_account_id || 0)) || ''
    if (!storeAllowedForAuth(storeName, scopedAllowedStores)) continue
    if (!storeMatchesFilter(storeName, storeFilter)) continue
    if (categoryFilter && categoryFilter !== 'expense' && categoryFilter !== 'card') continue
    const vendorCode = String(card.vendor_code || '').trim() || undefined
    if (!matchesVendor(vendorFilter, vendorCode, vendorCode, undefined)) continue
    if (!matchesDocumentNo(documentNoFilter, card.document_no)) continue
    if (accountId) continue

    rows.push({
      rowKey: `card-${cardId}`,
      relation: 'card_only',
      storeName,
      category: 'expense',
      payeeCode: vendorCode,
      vendorCode,
      bankAmount: Math.abs(Number(card.amount) || 0),
      expenseDate: String(card.trans_date || '').slice(0, 10) || undefined,
      bankTransDate: String(card.trans_date || '').slice(0, 10) || undefined,
      cardTransactionId: cardId,
      accountSubjectId: card.account_subject_id ?? null,
      memo: String(card.memo || card.note || '').trim() || undefined,
      documentNo: String(card.document_no || '').trim() || undefined,
      bankLinked: false,
      pettyLinked: false,
      linkStatus: 'card',
    })
  }

  rows.sort((a, b) => {
    const dateA = a.bankTransDate || a.dueDate || a.expenseDate || ''
    const dateB = b.bankTransDate || b.dueDate || b.expenseDate || ''
    return dateB.localeCompare(dateA) || (b.accrualId || b.bankTransactionId || 0) - (a.accrualId || a.bankTransactionId || 0)
  })

  const summary: ExpenseSearchOverviewSummary = {
    planOnly: 0,
    approvedUnpaid: 0,
    paid: 0,
    bankOnly: 0,
    rejected: 0,
  }
  for (const r of rows) {
    if (r.relation === 'plan_only') summary.planOnly += 1
    else if (r.relation === 'approved_unpaid') summary.approvedUnpaid += 1
    else if (r.relation === 'paid_bank' || r.relation === 'paid_petty') summary.paid += 1
    else if (r.relation === 'bank_only') summary.bankOnly += 1
    else if (r.relation === 'rejected') summary.rejected += 1
  }

  return { list: rows, summary }
}
