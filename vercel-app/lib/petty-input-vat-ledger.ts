import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function vatSplitFromTaxInvoiceGross(gross: number): { net: number; vat: number } {
  const g = Math.max(0, Math.abs(Number(gross) || 0))
  if (g <= 0) return { net: 0, vat: 0 }
  const vat = round2((g * 7) / 107)
  const net = round2(g - vat)
  return { net, vat }
}

async function lookupVendorTaxId(vendorCode: string): Promise<string | null> {
  const code = String(vendorCode || '').trim()
  if (!code) return null
  const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
    select: 'tax_id',
  })) as { tax_id?: string | null }[] | null
  const t = String(rows?.[0]?.tax_id || '').trim().replace(/\D/g, '')
  return t || null
}

async function lookupVendorName(vendorCode: string): Promise<string | null> {
  const code = String(vendorCode || '').trim()
  if (!code) return null
  const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
    select: 'name,gps_name',
  })) as { name?: string | null; gps_name?: string | null }[] | null
  return String(rows?.[0]?.name || rows?.[0]?.gps_name || code).trim() || null
}

type PettyRow = {
  id?: number
  trans_type?: string | null
  trans_date?: string | null
  amount?: number | null
  memo?: string | null
  store?: string | null
  user_name?: string | null
  vat_amount?: number | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  vendor_code?: string | null
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

/** 패티 지출 삭제 시 자동 생성된 매입 부가세 장부 행 제거 */
export async function deletePettyCashInputVatLedger(pettyCashId: number): Promise<void> {
  const id = Math.floor(Number(pettyCashId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:PETTY_CASH:${id}]`
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
 * 패티캐시 지출 → 매입 부가세(PP30 input) 보조장부 자동 반영.
 * 매입대금(purchase_payment) 등 입고·미지급과 중복 가능한 건은 호출 측에서 생략.
 */
export async function syncPettyCashInputVatLedger(
  pettyCashId: number,
  options?: { skipPurchasePayment?: boolean }
): Promise<void> {
  const id = Math.floor(Number(pettyCashId) || 0)
  if (id <= 0) return
  if (options?.skipPurchasePayment) {
    await deletePettyCashInputVatLedger(id)
    return
  }

  const rows = (await supabaseSelectFilter('petty_cash_transactions', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,trans_type,trans_date,amount,memo,store,user_name,vat_amount,invoice_received,invoice_no,vendor_code',
  })) as PettyRow[] | null
  const row = rows?.[0]
  if (!row?.id) return

  const memoTag = `[AUTO:PETTY_CASH:${id}]`
  const transType = String(row.trans_type || '').toLowerCase()
  if (transType !== 'expense') {
    await deletePettyCashInputVatLedger(id)
    return
  }

  const gross = Math.max(0, Math.abs(Number(row.amount ?? 0) || 0))
  const explicitVat = Math.max(0, Math.abs(Number(row.vat_amount ?? 0) || 0))
  const invoiceReceived = Boolean(row.invoice_received)
  let vatAmount = explicitVat
  let netAmount = Math.max(0, gross - vatAmount)
  if (vatAmount <= 0 && invoiceReceived && gross > 0) {
    const split = vatSplitFromTaxInvoiceGross(gross)
    vatAmount = split.vat
    netAmount = split.net
  }

  if (vatAmount <= 0 || gross <= 0) {
    await deletePettyCashInputVatLedger(id)
    return
  }

  const docDate = String(row.trans_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return
  const taxMonth = docDate.slice(0, 7)

  const vendorCode = String(row.vendor_code || '').trim()
  const vendorName = vendorCode ? await lookupVendorName(vendorCode) : null
  const payeeName = vendorName || String(row.memo || '패티 지출').trim() || '패티 지출'
  const tin = vendorCode ? await lookupVendorTaxId(vendorCode) : null
  const invoiceNoRaw = String(row.invoice_no || '').trim()
  const invoiceNo = (invoiceNoRaw || `PC-${id}`).slice(0, 128)
  const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
  const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()
  const ledgerRow = mergeEvidenceIntoVatLedgerRow(
    {
      doc_date: docDate,
      tax_month: taxMonth,
      direction: 'input' as const,
      counterparty_name: payeeName.slice(0, 500),
      counterparty_tax_id: tin,
      invoice_number: invoiceNo,
      net_amount: round2(netAmount),
      vat_amount: round2(vatAmount),
      total_amount: round2(gross),
      vat_status: 'draft_auto',
      memo: `${memoTag} 패티 지출 부가세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: String(row.store || '').trim() || null,
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
    if (keepSubmitted) return
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
    created_by: String(row.user_name || 'system').trim().slice(0, 200) || 'system',
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
