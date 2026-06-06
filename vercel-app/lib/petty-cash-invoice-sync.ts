import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { syncPettyCashInputVatLedger } from '@/lib/petty-input-vat-ledger'
import { updateVatLedgerEntryEvidence } from '@/lib/vat-ledger-invoice-evidence'

type PettyInvoiceRow = {
  id?: number
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
  vat_amount?: number | null
  vendor_code?: string | null
}

/** 패티 거래 인보이스 상태 → VAT 보조장부 증빙 반영 */
export async function syncPettyCashInvoiceEvidence(
  pettyCashId: number,
  options?: { skipPurchasePayment?: boolean }
): Promise<void> {
  const id = Math.floor(Number(pettyCashId) || 0)
  if (id <= 0) return

  await syncPettyCashInputVatLedger(id, options)

  const rows = (await supabaseSelectFilter('petty_cash_transactions', `id=eq.${id}`, {
    limit: 1,
    select: 'id,invoice_received',
  })) as PettyInvoiceRow[] | null
  const row = rows?.[0]
  if (!row?.id) return

  const invoiceReceived = Boolean(row.invoice_received)
  const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
  const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

  const memoTag = encodeURIComponent(`%[AUTO:PETTY_CASH:${id}]%`)
  const vatRows = (await supabaseSelectFilter('vat_ledger_entries', `memo=ilike.${memoTag}`, {
    select: 'id',
    limit: 20,
  })) as { id?: number }[] | null
  for (const v of vatRows || []) {
    const vid = Math.floor(Number(v.id) || 0)
    if (vid > 0) await updateVatLedgerEntryEvidence(vid, evidenceStatus, evidenceReasonCode)
  }
}

/** 지출 발생(accrual) 인보이스 → 연결된 패티 거래 복사 */
export async function propagateExpenseAccrualInvoiceToLinkedPetty(expenseAccrualId: number): Promise<void> {
  const accrualId = Math.floor(Number(expenseAccrualId) || 0)
  if (accrualId <= 0) return

  const accrualRows = (await supabaseSelectFilter('expense_accruals', `id=eq.${accrualId}`, {
    limit: 1,
    select: 'id,invoice_received,invoice_no,invoice_photo_url,vat_amount,payee_code',
  })) as {
    id?: number
    invoice_received?: boolean | null
    invoice_no?: string | null
    invoice_photo_url?: string | null
    vat_amount?: number | null
    payee_code?: string | null
  }[] | null
  const accrual = accrualRows?.[0]
  if (!accrual?.id) return

  const payableRows = (await supabaseSelectFilter(
    'payable_transactions',
    `expense_accrual_id=eq.${accrualId}&petty_cash_transaction_id=not.is.null`,
    { select: 'petty_cash_transaction_id', limit: 50 }
  )) as { petty_cash_transaction_id?: number | null }[] | null

  const pettyIds = [
    ...new Set((payableRows || []).map((p) => Math.floor(Number(p.petty_cash_transaction_id) || 0)).filter((n) => n > 0)),
  ]
  if (!pettyIds.length) return

  const payeeCode = String(accrual.payee_code || '').split('::wm::')[0]?.trim() || null
  const patch: Record<string, unknown> = {
    invoice_received: Boolean(accrual.invoice_received),
    invoice_no: String(accrual.invoice_no || '').trim() || null,
    invoice_photo_url: String(accrual.invoice_photo_url || '').trim() || null,
    vat_amount: Math.max(0, Math.abs(Number(accrual.vat_amount ?? 0) || 0)) || null,
  }
  if (payeeCode && !payeeCode.startsWith('auto_')) patch.vendor_code = payeeCode

  for (const pettyId of pettyIds) {
    await supabaseUpdate('petty_cash_transactions', pettyId, patch)
    await syncPettyCashInvoiceEvidence(pettyId)
  }
}
