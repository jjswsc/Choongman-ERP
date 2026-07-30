import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { propagateExpenseAccrualInvoiceToLinkedPetty } from '@/lib/petty-cash-invoice-sync'
import { updateVatLedgerEntryEvidence } from '@/lib/vat-ledger-invoice-evidence'
import { normalizeExpenseDocumentType } from '@/lib/expense-document-type'

type AccrualInvoiceRow = {
  id?: number
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
  document_type?: string | null
}

/** 지출 발생의 인보이스 상태를 연결된 통장 출금·VAT 보조장부에 반영 */
export async function syncExpenseAccrualInvoiceEvidence(expenseAccrualId: number): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return

  await syncExpenseAccrualInputVatLedger(id)

  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${id}`, {
    limit: 1,
    select: 'id,invoice_received,invoice_no,invoice_photo_url,document_type',
  })) as AccrualInvoiceRow[] | null
  const row = rows?.[0]
  if (!row?.id) return

  const documentType = normalizeExpenseDocumentType(row.document_type)
  const invoiceReceived =
    documentType === 'tax_invoice' ? true : Boolean(row.invoice_received)
  const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
  const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

  const memoTag = encodeURIComponent(`%[AUTO:EXPENSE_ACCRUAL:${id}]%`)
  const vatRows = (await supabaseSelectFilter('vat_ledger_entries', `memo=ilike.${memoTag}`, {
    select: 'id',
    limit: 20,
  })) as { id?: number }[] | null
  for (const v of vatRows || []) {
    const vid = Math.floor(Number(v.id) || 0)
    if (vid > 0) await updateVatLedgerEntryEvidence(vid, evidenceStatus, evidenceReasonCode)
  }

  await propagateExpenseAccrualInvoiceToLinkedBank(id)
  await propagateExpenseAccrualInvoiceToLinkedPetty(id)
}

/** 지급 완료·통장 연결 시 accrual 인보이스 → bank_transactions 복사 */
export async function propagateExpenseAccrualInvoiceToLinkedBank(expenseAccrualId: number): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return

  const accrualRows = (await supabaseSelectFilter('expense_accruals', `id=eq.${id}`, {
    limit: 1,
    select: 'id,invoice_received,invoice_no,invoice_photo_url,document_type',
  })) as AccrualInvoiceRow[] | null
  const accrual = accrualRows?.[0]
  if (!accrual?.id) return

  const payableRows = (await supabaseSelectFilter(
    'payable_transactions',
    `expense_accrual_id=eq.${id}&bank_transaction_id=not.is.null`,
    { select: 'bank_transaction_id', limit: 50 }
  )) as { bank_transaction_id?: number | null }[] | null

  const bankIds = [...new Set((payableRows || []).map((p) => Math.floor(Number(p.bank_transaction_id) || 0)).filter((n) => n > 0))]
  if (!bankIds.length) return

  const documentType = normalizeExpenseDocumentType(accrual.document_type)
  const patch: Record<string, unknown> = {
    invoice_received: documentType === 'tax_invoice' ? true : Boolean(accrual.invoice_received),
    invoice_no: String(accrual.invoice_no || '').trim() || null,
    invoice_photo_url: String(accrual.invoice_photo_url || '').trim() || null,
    document_type: documentType,
  }

  for (const bankId of bankIds) {
    await supabaseUpdate('bank_transactions', bankId, patch)
  }
}
