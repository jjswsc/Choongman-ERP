import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'
import {
  expenseDocumentQualifiesForPp30,
  normalizeExpenseDocumentType,
} from '@/lib/expense-document-type'

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  const payeeCode = src.slice(0, idx).trim()
  const withdrawalCategory = src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
  return { payeeCode, withdrawalCategory }
}

function shouldSkipExpenseVatAutoSync(withdrawalCategory: string): boolean {
  const cat = String(withdrawalCategory || '').trim().toLowerCase()
  // 매입대금/매입선급은 입고(재고) 기반 매입 VAT와 중복될 가능성이 높아 자동 반영에서 제외한다.
  return cat === 'purchase_payment' || cat === 'purchase_advance'
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

type ExpenseAccrualRow = {
  id?: number
  status?: string | null
  payee_code?: string | null
  payee_name?: string | null
  amount?: number | null
  vat_amount?: number | null
  expense_date?: string | null
  memo?: string | null
  store_name?: string | null
  created_by?: string | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  document_type?: string | null
}

async function lookupVendorTaxId(payeeCode: string): Promise<string | null> {
  const code = String(payeeCode || '').trim()
  if (!code || code.startsWith('auto_')) return null
  const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
    select: 'tax_id',
  })) as { tax_id?: string | null }[] | null
  const t = String(rows?.[0]?.tax_id || '').trim().replace(/\D/g, '')
  return t || null
}

/** 지출 발생 삭제 시 자동 생성된 매입 부가세 장부 행 제거 */
export async function deleteExpenseAccrualInputVatLedger(expenseAccrualId: number): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:EXPENSE_ACCRUAL:${id}]`
  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 20, select: 'id' }
  )) as { id?: number }[] | null
  for (const e of existing || []) {
    const eid = Math.floor(Number(e?.id) || 0)
    if (eid > 0) await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
  }
}

/**
 * 지출 발생(expense_accruals)의 부가세를 매입 세금계산서(PP30 input) 보조장부에 자동 반영한다.
 * document_type=tax_invoice(또는 레거시 invoice_received) 이고 vat_amount>0 이며 반려가 아니면 초안으로 적재한다.
 * Invoice / Receipt 첨부는 PP.30에 넣지 않는다.
 */
export async function syncExpenseAccrualInputVatLedger(
  expenseAccrualId: number,
  options?: { fallbackStoreName?: string }
): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return

  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,status,payee_code,payee_name,amount,vat_amount,expense_date,memo,store_name,created_by,invoice_received,invoice_no,document_type',
  })) as ExpenseAccrualRow[] | null
  const row = rows?.[0]
  if (!row?.id) return

  const memoTag = `[AUTO:EXPENSE_ACCRUAL:${id}]`
  const status = String(row.status || '').toLowerCase()
  const vatAmount = Math.max(0, Math.abs(Number(row.vat_amount ?? 0) || 0))
  const gross = Math.max(0, Math.abs(Number(row.amount ?? 0) || 0))
  const fallbackStoreName = String(options?.fallbackStoreName || '').trim()
  const documentType = normalizeExpenseDocumentType(row.document_type)
  const qualifiesForPp30 = expenseDocumentQualifiesForPp30({
    documentType,
    invoiceReceived: row.invoice_received,
  })

  if (status === 'rejected' || vatAmount <= 0 || gross <= 0 || !qualifiesForPp30) {
    const existing = (await supabaseSelectFilter(
      'vat_ledger_entries',
      `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
      { limit: 5, select: 'id,filing_status' }
    )) as { id?: number; filing_status?: string | null }[] | null
    for (const e of existing || []) {
      const eid = Math.floor(Number(e?.id) || 0)
      if (eid <= 0) continue
      if (String(e?.filing_status || '').trim().toLowerCase() === 'submitted') continue
      await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
    }
    return
  }

  const expenseDate = String(row.expense_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return
  const taxMonth = expenseDate.slice(0, 7)
  const { payeeCode, withdrawalCategory } = decodePayeeCode(row.payee_code || undefined)
  if (shouldSkipExpenseVatAutoSync(withdrawalCategory)) {
    const existing = (await supabaseSelectFilter(
      'vat_ledger_entries',
      `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
      { limit: 20, select: 'id' }
    )) as { id?: number }[] | null
    for (const e of existing || []) {
      const eid = Math.floor(Number(e?.id) || 0)
      if (eid > 0) await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
    }
    return
  }
  const payeeName = String(row.payee_name || payeeCode || '지출').trim() || '지출'
  const netAmount = Math.max(0, gross - vatAmount)
  const tin = await lookupVendorTaxId(payeeCode)
  const invoiceNoRaw = String(row.invoice_no || '').trim()
  const invoiceNo = (invoiceNoRaw || `EA-${id}`).slice(0, 128)
  // Tax Invoice면 증빙 수령, 그 외(레거시 미설정 포함)는 invoice_received 기준
  const invoiceReceived =
    documentType === 'tax_invoice' ? true : Boolean(row.invoice_received)
  const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
  const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()
  const ledgerRow = mergeEvidenceIntoVatLedgerRow(
    {
      doc_date: expenseDate,
      tax_month: taxMonth,
      direction: 'input' as const,
      counterparty_name: payeeName.slice(0, 500),
      counterparty_tax_id: tin,
      invoice_number: invoiceNo,
      net_amount: Math.round(netAmount * 100) / 100,
      vat_amount: Math.round(vatAmount * 100) / 100,
      total_amount: Math.round(gross * 100) / 100,
      vat_status: 'draft_auto',
      memo: `${memoTag} 지출발생 부가세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: String(row.store_name || '').trim() || fallbackStoreName || null,
      updated_at: new Date().toISOString(),
    },
    evidenceStatus,
    evidenceReasonCode,
    useEvidenceColumns
  )

  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 20, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  let existingId = 0
  let keepSubmitted = false
  for (const e of existing || []) {
    const eid = Math.floor(Number(e?.id) || 0)
    if (eid <= 0) continue
    const submitted = String(e?.filing_status || '').trim().toLowerCase() === 'submitted'
    if (existingId <= 0) {
      existingId = eid
      keepSubmitted = submitted
      continue
    }
    if (keepSubmitted) {
      if (!submitted) await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
      continue
    }
    if (submitted) {
      await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${existingId}`)
      existingId = eid
      keepSubmitted = true
      continue
    }
    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
  }
  if (existingId > 0) {
    try {
      await supabaseUpdate('vat_ledger_entries', existingId, ledgerRow)
    } catch (e) {
      const fallback = await vatLedgerRowForSchemaError(ledgerRow, e, {
        submissionStrip: stripSubmissionAuditFields,
      })
      if (!fallback) throw e
      await supabaseUpdate('vat_ledger_entries', existingId, fallback)
    }
    return
  }

  const insertRow = {
    ...ledgerRow,
    created_by: String(row.created_by || 'system').trim().slice(0, 200) || 'system',
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('vat_ledger_entries', insertRow)
  } catch (e) {
    const fallback = await vatLedgerRowForSchemaError(insertRow, e, {
      submissionStrip: stripSubmissionAuditFields,
    })
    if (!fallback) throw e
    await supabaseInsert('vat_ledger_entries', fallback)
  }
}
