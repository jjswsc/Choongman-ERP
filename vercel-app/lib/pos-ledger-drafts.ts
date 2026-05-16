import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import {
  applyEvidenceToVatLedgerRow,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'

function toBangkokYmd(inputIso?: string): string {
  const src = String(inputIso || '').trim()
  const base = src ? new Date(src) : new Date()
  if (Number.isNaN(base.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  }
  return base.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

export async function upsertPosVatLedgerDraft(params: {
  posOrderId: number
  orderNo?: string
  storeCode?: string
  createdAtIso?: string
  subtotal?: number
  total?: number
  vatAmount?: number
  createdBy?: string
}) {
  const orderId = Math.floor(Number(params.posOrderId) || 0)
  if (orderId <= 0) return
  const total = Math.max(0, Number(params.total) || 0)
  const vatAmount = Math.max(0, Number(params.vatAmount) || 0)
  if (total <= 0 || vatAmount <= 0) return

  const docDate = toBangkokYmd(params.createdAtIso)
  const taxMonth = docDate.slice(0, 7)
  const invoiceNo = String(params.orderNo || `POS-${orderId}`).trim() || `POS-${orderId}`
  const memoTag = `[AUTO:POS_ORDER:${orderId}]`
  const row = await applyEvidenceToVatLedgerRow(
    {
      doc_date: docDate,
      tax_month: taxMonth,
      direction: 'output',
      counterparty_name: 'POS SALES',
      counterparty_tax_id: null,
      invoice_number: invoiceNo.slice(0, 128),
      net_amount: Math.max(0, Number(params.subtotal ?? total - vatAmount) || 0),
      vat_amount: vatAmount,
      total_amount: total,
      vat_status: 'draft_auto',
      memo: `${memoTag} POS 완료 자동 생성`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: String(params.storeCode || '').trim() || null,
      updated_at: new Date().toISOString(),
    },
    'not_required',
    'pos_auto_excluded'
  )

  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null
  const existingId = Math.floor(Number(existing?.[0]?.id) || 0)
  if (existingId > 0) {
    try {
      await supabaseUpdate('vat_ledger_entries', existingId, row)
      return
    } catch (e) {
      const fallback = await vatLedgerRowForSchemaError(row, e, {
        submissionStrip: stripSubmissionAuditFields,
      })
      if (!fallback) throw e
      await supabaseUpdate('vat_ledger_entries', existingId, fallback)
      return
    }
  }

  const insertRow = {
    ...row,
    created_by: String(params.createdBy || 'system').trim().slice(0, 200) || 'system',
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
