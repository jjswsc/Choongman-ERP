import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  isMissingEvidenceColumnError,
  mergeEvidenceIntoVatLedgerRow,
  normalizeInvoiceEvidenceStatus,
  setMemoEvidenceTag,
  stripEvidenceFields,
  type InvoiceEvidenceStatus,
} from '@/lib/vat-ledger-invoice-evidence-core'

export type { InvoiceEvidenceStatus } from '@/lib/vat-ledger-invoice-evidence-core'
export {
  enrichVatLedgerEntries,
  enrichVatLedgerEntryRow,
  isInvoiceEvidencePending,
  isInvoiceEvidenceReportable,
  isMissingEvidenceColumnError,
  mergeEvidenceIntoVatLedgerRow,
  normalizeInvoiceEvidenceStatus,
  parseEvidenceFromMemo,
  resolveEvidenceFromRow,
  setMemoEvidenceTag,
  stripEvidenceFields,
  stripMemoEvidenceTag,
} from '@/lib/vat-ledger-invoice-evidence-core'

let evidenceColumnsCached: boolean | null = null

export function resetVatLedgerEvidenceColumnProbe(): void {
  evidenceColumnsCached = null
}

/** PostgREST에 증빙 컬럼이 있는지 1회 프로브(결과 캐시) */
export async function probeVatLedgerEvidenceColumns(): Promise<boolean> {
  if (evidenceColumnsCached !== null) return evidenceColumnsCached
  try {
    await supabaseSelectFilter('vat_ledger_entries', 'id=gt.0', {
      select: 'id,invoice_evidence_status,invoice_evidence_reason_code',
      limit: 1,
    })
    evidenceColumnsCached = true
  } catch (e) {
    evidenceColumnsCached = false
  }
  return evidenceColumnsCached
}

export async function applyEvidenceToVatLedgerRow<T extends Record<string, unknown>>(
  row: T,
  status: InvoiceEvidenceStatus,
  reasonCode: string | null
): Promise<T> {
  const useColumns = await probeVatLedgerEvidenceColumns()
  return mergeEvidenceIntoVatLedgerRow(row, status, reasonCode, useColumns)
}

export async function updateVatLedgerEntryEvidence(
  id: number,
  status: InvoiceEvidenceStatus,
  reasonCode: string | null
): Promise<void> {
  if (id <= 0) return
  const useColumns = await probeVatLedgerEvidenceColumns()
  if (useColumns) {
    try {
      await supabaseUpdate('vat_ledger_entries', id, {
        invoice_evidence_status: status,
        invoice_evidence_reason_code: reasonCode,
      })
      return
    } catch (e) {
      if (!isMissingEvidenceColumnError(e)) throw e
      evidenceColumnsCached = false
    }
  }
  const rows = (await supabaseSelectFilter('vat_ledger_entries', `id=eq.${id}`, {
    select: 'id,memo',
    limit: 1,
  })) as { memo?: string | null }[] | null
  const memo = setMemoEvidenceTag(String(rows?.[0]?.memo || ''), status, reasonCode)
  await supabaseUpdate('vat_ledger_entries', id, { memo })
}

export async function vatLedgerRowForSchemaError<T extends Record<string, unknown>>(
  row: T,
  e: unknown,
  opts?: { submissionStrip?: (r: T) => T }
): Promise<T | null> {
  const msg = String(e || '').toLowerCase()
  const missingSubmission =
    msg.includes('filing_status') || msg.includes('submitted_at') || msg.includes('submitted_by')
  const missingEvidence = isMissingEvidenceColumnError(e)
  if (!missingSubmission && !missingEvidence) return null

  let next = { ...row } as T
  if (missingSubmission && opts?.submissionStrip) next = opts.submissionStrip(next)
  if (missingEvidence) {
    evidenceColumnsCached = false
    const status = normalizeInvoiceEvidenceStatus(row.invoice_evidence_status)
    const reason =
      row.invoice_evidence_reason_code != null
        ? String(row.invoice_evidence_reason_code).trim().slice(0, 64) || null
        : null
    next = mergeEvidenceIntoVatLedgerRow(stripEvidenceFields(next), status, reason, false)
  }
  return next
}
