import { describe, expect, it } from 'vitest'
import {
  enrichVatLedgerEntryRow,
  parseEvidenceFromMemo,
  resolveEvidenceFromRow,
  setMemoEvidenceTag,
  stripMemoEvidenceTag,
} from '@/lib/vat-ledger-invoice-evidence-core'

describe('vat-ledger-invoice-evidence memo fallback', () => {
  it('parses IE tag from memo', () => {
    expect(parseEvidenceFromMemo('[AUTO:STOCK_LOG:1] [IE:received]')).toEqual({
      status: 'received',
      reasonCode: null,
    })
    expect(parseEvidenceFromMemo('x [IE:required_pending:missing_invoice]')).toEqual({
      status: 'required_pending',
      reasonCode: 'missing_invoice',
    })
  })

  it('strips and sets memo tag', () => {
    const m = setMemoEvidenceTag('[AUTO:EA:9] [IE:received]', 'required_pending', 'lost_doc')
    expect(m).toContain('[AUTO:EA:9]')
    expect(m).toContain('[IE:required_pending:lost_doc]')
    expect(stripMemoEvidenceTag(m)).not.toMatch(/\[IE:/)
  })

  it('prefers DB column over memo when column is set', () => {
    expect(
      resolveEvidenceFromRow({
        invoice_evidence_status: 'not_required',
        invoice_evidence_reason_code: 'pos_auto_excluded',
        memo: '[IE:required_pending]',
      })
    ).toEqual({ status: 'not_required', reasonCode: 'pos_auto_excluded' })
  })

  it('prefers memo when column is default pending but memo says received', () => {
    expect(
      resolveEvidenceFromRow({
        invoice_evidence_status: 'required_pending',
        memo: '[AUTO:STOCK_LOG:1] [IE:received]',
      })
    ).toEqual({ status: 'received', reasonCode: null })
  })

  it('falls back to memo when column missing', () => {
    const row = enrichVatLedgerEntryRow({
      memo: '[AUTO:STOCK_LOG:2] [IE:received]',
    })
    expect(row.invoice_evidence_status).toBe('received')
  })
})
