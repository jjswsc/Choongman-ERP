import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'

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

async function lookupCardAccountStore(cardAccountId: number): Promise<string | null> {
  const id = Math.floor(Number(cardAccountId) || 0)
  if (id <= 0) return null
  const rows = (await supabaseSelectFilter('card_accounts', `id=eq.${id}`, {
    limit: 1,
    select: 'store',
  })) as { store?: string | null }[] | null
  return String(rows?.[0]?.store || '').trim() || null
}

type CardTxRow = {
  id?: number
  card_account_id?: number | null
  trans_type?: string | null
  trans_date?: string | null
  amount?: number | null
  memo?: string | null
  vendor_code?: string | null
  vat_amount?: number | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  is_bill_header?: boolean | null
  parent_id?: number | null
  note?: string | null
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

/** 카드 지출(배분 행) 삭제 시 자동 생성된 매입 부가세 장부 행 제거 */
export async function deleteCardTransactionInputVatLedger(cardTransactionId: number): Promise<void> {
  const id = Math.floor(Number(cardTransactionId) || 0)
  if (id <= 0) return
  const memoTag = `[AUTO:CARD_TX:${id}]`
  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 20, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  for (const e of existing || []) {
    const eid = Math.floor(Number(e?.id) || 0)
    if (eid <= 0) continue
    if (String(e?.filing_status || '').trim().toLowerCase() === 'submitted') continue
    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
  }
}

/**
 * 카드 지출 배분 행 → 매입 부가세(PP30 input) 보조장부 자동 반영.
 * 통장 카드대금 이체(transfer)는 bank VAT 동기화에서 제외되므로 배분 행과 중복되지 않는다.
 */
export async function syncCardTransactionInputVatLedger(
  cardTransactionId: number,
  options?: { createdBy?: string; fallbackStoreName?: string }
): Promise<void> {
  const id = Math.floor(Number(cardTransactionId) || 0)
  if (id <= 0) return

  const rows = (await supabaseSelectFilter('card_transactions', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,card_account_id,trans_type,trans_date,amount,memo,vendor_code,vat_amount,invoice_received,invoice_no,is_bill_header,parent_id,note',
  })) as CardTxRow[] | null
  const row = rows?.[0]
  if (!row?.id) return

  const memoTag = `[AUTO:CARD_TX:${id}]`
  const transType = String(row.trans_type || '').toLowerCase()
  const isHeader =
    Boolean(row.is_bill_header) || String(row.note || '').trim() === CARD_BILL_HEADER_NOTE
  const parentId = Math.floor(Number(row.parent_id || 0))

  if (transType !== 'expense' || isHeader || parentId <= 0) {
    await deleteCardTransactionInputVatLedger(id)
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
    await deleteCardTransactionInputVatLedger(id)
    return
  }

  const docDate = String(row.trans_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return
  const taxMonth = docDate.slice(0, 7)

  const vendorCode = String(row.vendor_code || '').trim()
  const vendorName = vendorCode ? await lookupVendorName(vendorCode) : null
  const payeeName = vendorName || String(row.memo || '카드 지출').trim() || '카드 지출'
  const tin = vendorCode ? await lookupVendorTaxId(vendorCode) : null
  const invoiceNoRaw = String(row.invoice_no || '').trim()
  const invoiceNo = (invoiceNoRaw || `CT-${id}`).slice(0, 128)
  const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
  const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

  const cardStore = await lookupCardAccountStore(Number(row.card_account_id || 0))
  const storeName = cardStore || String(options?.fallbackStoreName || '').trim() || null

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
      memo: `${memoTag} 카드지출 배분 부가세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: storeName,
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
    created_by: String(options?.createdBy || 'system').trim().slice(0, 200) || 'system',
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

function monthStartYmd(ym: string): string {
  return `${ym}-01`
}

function monthEndYmd(ym: string): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return `${ym}-28`
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

/** 기간·매장 기준 카드 배분 행 매입 부가세 일괄 동기화 */
export async function syncCardAllocationInputVatLedgers(params: {
  months: string[]
  storeFilter?: string
  createdBy?: string
}): Promise<{ synced: number; skipped: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!validMonths.length) return { synced: 0, skipped: 0 }

  const storeFilter = String(params.storeFilter || '').trim()
  const storeScope = storeFilter && storeFilter !== 'All' ? await createAccountingStoreScopeMatcher(storeFilter) : null
  const officeScope = !!storeFilter && storeFilter !== 'All' && isHeadOfficeLikeStoreName(storeFilter)
  const startYmd = monthStartYmd(validMonths[0]!)
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1]!)

  const cardRows = (await supabaseSelectFilterAllPages(
    'card_transactions',
    [
      'trans_type=eq.expense',
      'parent_id=not.is.null',
      `trans_date=gte.${encodeURIComponent(startYmd)}`,
      `trans_date=lte.${encodeURIComponent(endYmd)}`,
    ].join('&'),
    {
      select: 'id,card_account_id',
      order: 'id.asc',
      pageSize: 2000,
      maxRows: 30000,
    }
  )) as { id?: number; card_account_id?: number | null }[]

  const storeByCardAccount = new Map<number, string>()
  let synced = 0
  let skipped = 0

  for (const row of cardRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue

    if (storeScope) {
      const cardAccountId = Math.floor(Number(row.card_account_id) || 0)
      let rowStore = cardAccountId > 0 ? storeByCardAccount.get(cardAccountId) : undefined
      if (rowStore === undefined && cardAccountId > 0) {
        rowStore = (await lookupCardAccountStore(cardAccountId)) || ''
        storeByCardAccount.set(cardAccountId, rowStore)
      }
      const inScope = storeScope.matches(rowStore || '') || (officeScope && !rowStore)
      if (!inScope) {
        skipped += 1
        continue
      }
    }

    try {
      await syncCardTransactionInputVatLedger(id, {
        createdBy: params.createdBy,
        fallbackStoreName: officeScope ? storeFilter : undefined,
      })
      synced += 1
    } catch {
      skipped += 1
    }
  }

  return { synced, skipped }
}
