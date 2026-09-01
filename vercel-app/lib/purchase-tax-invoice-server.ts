import 'server-only'

import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { normalizeStoreTaxId, resolveStoreTaxFilingProfile } from '@/lib/store-tax-filing-profile'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'
import { parseTaxScopeFilter } from '@/lib/tax-entity-scope'
import {
  digitsTin13,
  formatSellerBranch,
  isTin13,
  normalizeInvoiceNo,
  normalizePurchaseTaxInvoiceSource,
  parseAttachmentUrlsJson,
  purchaseTaxInvLedgerMemoTag,
  purchaseTaxInvoiceDedupeKey,
  roundPurchaseTaxAmounts,
  serializeAttachmentUrls,
  taxMonthFromDocDate,
  validatePurchaseTaxInvoiceInput,
  type PurchaseTaxInvoiceInput,
  type PurchaseTaxInvoiceRow,
  type PurchaseTaxInvoiceSource,
} from '@/lib/purchase-tax-invoice-core'

type DbRow = {
  id?: number
  store_name?: string | null
  buyer_tax_id?: string | null
  tax_month?: string | null
  doc_date?: string | null
  invoice_no?: string | null
  seller_name?: string | null
  seller_tax_id?: string | null
  seller_branch?: string | null
  net_amount?: number | null
  vat_amount?: number | null
  total_amount?: number | null
  source?: string | null
  inbound_batch_id?: number | null
  attachment_urls?: string | null
  memo?: string | null
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

function mapDbRow(row: DbRow): PurchaseTaxInvoiceRow | null {
  const id = Math.floor(Number(row.id) || 0)
  if (id <= 0) return null
  const { netAmount, vatAmount, totalAmount } = roundPurchaseTaxAmounts(
    Number(row.net_amount) || 0,
    Number(row.vat_amount) || 0,
    Number(row.total_amount) || 0
  )
  return {
    id,
    storeName: String(row.store_name || '').trim(),
    buyerTaxId: digitsTin13(row.buyer_tax_id),
    taxMonth: String(row.tax_month || '').slice(0, 7),
    docDate: String(row.doc_date || '').slice(0, 10),
    invoiceNo: String(row.invoice_no || '').trim(),
    sellerName: String(row.seller_name || '').trim(),
    sellerTaxId: digitsTin13(row.seller_tax_id),
    sellerBranch: formatSellerBranch(row.seller_branch),
    netAmount,
    vatAmount,
    totalAmount,
    source: normalizePurchaseTaxInvoiceSource(row.source),
    inboundBatchId: Math.floor(Number(row.inbound_batch_id) || 0) || null,
    attachmentUrls: parseAttachmentUrlsJson(row.attachment_urls),
    memo: String(row.memo || '').trim(),
  }
}

const SELECT_COLS =
  'id,store_name,buyer_tax_id,tax_month,doc_date,invoice_no,seller_name,seller_tax_id,seller_branch,net_amount,vat_amount,total_amount,source,inbound_batch_id,attachment_urls,memo'

export async function resolveBuyerTaxIdForStore(storeName: string): Promise<string> {
  const profile = await resolveStoreTaxFilingProfile(storeName)
  return digitsTin13(profile.taxId)
}

async function loadEntityBuyerTaxId(entityCode: string): Promise<string> {
  if (!entityCode) return ''
  try {
    const rows = (await supabaseSelectFilter(
      'tax_entities',
      `entity_code=eq.${encodeURIComponent(entityCode)}`,
      { select: 'tax_id', limit: 1 }
    )) as { tax_id?: string | null }[] | null
    return normalizeStoreTaxId(rows?.[0]?.tax_id)
  } catch {
    return ''
  }
}

export async function listPurchaseTaxInvoices(params: {
  taxMonth: string
  storeFilter?: string
}): Promise<PurchaseTaxInvoiceRow[]> {
  const taxMonth = String(params.taxMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(taxMonth)) return []
  const parsed = parseTaxScopeFilter(String(params.storeFilter || ''))
  const parts = [`tax_month=eq.${encodeURIComponent(taxMonth)}`]
  if (parsed.kind === 'taxid' && parsed.value.length === 13) {
    parts.push(`buyer_tax_id=eq.${encodeURIComponent(parsed.value)}`)
  } else if (parsed.kind === 'entity') {
    const tin = await loadEntityBuyerTaxId(parsed.value)
    if (tin.length === 13) parts.push(`buyer_tax_id=eq.${encodeURIComponent(tin)}`)
    else if (!tin) return []
  } else if (parsed.kind === 'store' && parsed.value) {
    parts.push(`store_name=eq.${encodeURIComponent(parsed.value)}`)
  }

  const rows = (await supabaseSelectFilterAllPages('purchase_tax_invoices', parts.join('&'), {
    select: SELECT_COLS,
    order: 'doc_date.asc',
    pageSize: 2000,
    maxRows: 20000,
  })) as DbRow[]
  return (rows || []).map(mapDbRow).filter((r): r is PurchaseTaxInvoiceRow => !!r)
}

async function findByDedupe(
  buyerTaxId: string,
  invoiceNo: string,
  sellerTaxId: string
): Promise<PurchaseTaxInvoiceRow | null> {
  const rows = (await supabaseSelectFilter(
    'purchase_tax_invoices',
    [
      `buyer_tax_id=eq.${encodeURIComponent(digitsTin13(buyerTaxId))}`,
      `invoice_no=eq.${encodeURIComponent(normalizeInvoiceNo(invoiceNo))}`,
      `seller_tax_id=eq.${encodeURIComponent(digitsTin13(sellerTaxId))}`,
    ].join('&'),
    { select: SELECT_COLS, limit: 5 }
  )) as DbRow[] | null
  const want = purchaseTaxInvoiceDedupeKey(buyerTaxId, invoiceNo, sellerTaxId)
  for (const row of rows || []) {
    const mapped = mapDbRow(row)
    if (!mapped) continue
    if (purchaseTaxInvoiceDedupeKey(mapped.buyerTaxId, mapped.invoiceNo, mapped.sellerTaxId) === want) {
      return mapped
    }
  }
  return null
}

async function findByInboundBatchId(batchId: number): Promise<PurchaseTaxInvoiceRow | null> {
  const id = Math.floor(Number(batchId) || 0)
  if (id <= 0) return null
  const rows = (await supabaseSelectFilter('purchase_tax_invoices', `inbound_batch_id=eq.${id}`, {
    select: SELECT_COLS,
    limit: 5,
  })) as DbRow[] | null
  return mapDbRow(rows?.[0] || {}) 
}

function toDbPayload(
  input: PurchaseTaxInvoiceInput,
  actor: string,
  existingId?: number
): Record<string, unknown> {
  const { netAmount, vatAmount, totalAmount } = roundPurchaseTaxAmounts(
    input.netAmount,
    input.vatAmount,
    input.totalAmount
  )
  const docDate = String(input.docDate || '').slice(0, 10)
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    store_name: String(input.storeName || '').trim(),
    buyer_tax_id: digitsTin13(input.buyerTaxId),
    tax_month: taxMonthFromDocDate(docDate),
    doc_date: docDate,
    invoice_no: normalizeInvoiceNo(input.invoiceNo),
    seller_name: String(input.sellerName || '').trim().slice(0, 500),
    seller_tax_id: digitsTin13(input.sellerTaxId),
    seller_branch: formatSellerBranch(input.sellerBranch),
    net_amount: netAmount,
    vat_amount: vatAmount,
    total_amount: totalAmount,
    source: normalizePurchaseTaxInvoiceSource(input.source),
    inbound_batch_id: Math.floor(Number(input.inboundBatchId) || 0) || null,
    attachment_urls: serializeAttachmentUrls(input.attachmentUrls || []),
    memo: String(input.memo || '').trim().slice(0, 2000) || null,
    updated_at: now,
    updated_by: actor.slice(0, 200) || null,
  }
  if (!existingId) {
    row.created_at = now
    row.created_by = actor.slice(0, 200) || 'system'
  }
  return row
}

export class PurchaseTaxInvoiceDuplicateError extends Error {
  existingId: number
  constructor(existingId: number) {
    super('DUPLICATE_PURCHASE_TAX_INVOICE')
    this.name = 'PurchaseTaxInvoiceDuplicateError'
    this.existingId = existingId
  }
}

export class PurchaseTaxInvoiceSubmittedError extends Error {
  constructor() {
    super('PURCHASE_TAX_INVOICE_SUBMITTED')
    this.name = 'PurchaseTaxInvoiceSubmittedError'
  }
}

async function ledgerFilingStatusForPti(ptiId: number): Promise<'draft' | 'submitted'> {
  const tag = purchaseTaxInvLedgerMemoTag(ptiId)
  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${tag}%`)}`,
    { limit: 10, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  for (const e of existing || []) {
    if (String(e?.filing_status || '').trim().toLowerCase() === 'submitted') return 'submitted'
  }
  return 'draft'
}

export async function syncPurchaseTaxInvoiceVatLedger(pti: PurchaseTaxInvoiceRow): Promise<void> {
  const id = Math.floor(Number(pti.id) || 0)
  if (id <= 0) return
  const memoTag = purchaseTaxInvLedgerMemoTag(id)
  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()
  const ledgerRow = mergeEvidenceIntoVatLedgerRow(
    {
      doc_date: pti.docDate,
      tax_month: pti.taxMonth,
      direction: 'input' as const,
      counterparty_name: pti.sellerName.slice(0, 500),
      counterparty_tax_id: isTin13(pti.sellerTaxId) ? pti.sellerTaxId : null,
      invoice_number: pti.invoiceNo.slice(0, 128),
      net_amount: pti.netAmount,
      vat_amount: pti.vatAmount,
      total_amount: pti.totalAmount,
      vat_status: 'draft_auto',
      memo: `${memoTag} ใบกำกับภาษีซื้อ`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: pti.storeName || null,
      updated_at: new Date().toISOString(),
    },
    'received',
    null,
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
  if (keepSubmitted) return
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
    created_by: 'system',
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

export async function deletePurchaseTaxInvoiceVatLedger(ptiId: number): Promise<void> {
  const id = Math.floor(Number(ptiId) || 0)
  if (id <= 0) return
  const memoTag = purchaseTaxInvLedgerMemoTag(id)
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

export async function upsertPurchaseTaxInvoice(
  input: PurchaseTaxInvoiceInput,
  opts?: { actor?: string; existingId?: number; allowOverwriteManual?: boolean }
): Promise<PurchaseTaxInvoiceRow> {
  const actor = String(opts?.actor || 'system').trim() || 'system'
  const err = validatePurchaseTaxInvoiceInput(input)
  if (err) throw new Error(`INVALID_PURCHASE_TAX_INVOICE:${err}`)

  const existingId = Math.floor(Number(opts?.existingId) || 0)
  if (existingId > 0) {
    const status = await ledgerFilingStatusForPti(existingId)
    if (status === 'submitted') throw new PurchaseTaxInvoiceSubmittedError()
    await supabaseUpdate('purchase_tax_invoices', existingId, toDbPayload(input, actor, existingId))
    const rows = (await supabaseSelectFilter('purchase_tax_invoices', `id=eq.${existingId}`, {
      select: SELECT_COLS,
      limit: 1,
    })) as DbRow[] | null
    const mapped = mapDbRow(rows?.[0] || {})
    if (!mapped) throw new Error('PURCHASE_TAX_INVOICE_UPDATE_FAILED')
    await syncPurchaseTaxInvoiceVatLedger(mapped)
    return mapped
  }

  const dup = await findByDedupe(input.buyerTaxId, input.invoiceNo, input.sellerTaxId)
  if (dup) {
    const sameBatch =
      input.inboundBatchId && dup.inboundBatchId && Number(dup.inboundBatchId) === Number(input.inboundBatchId)
    const inboundUpdatingInbound = input.source === 'inbound_batch' && dup.source === 'inbound_batch' && sameBatch
    if (!inboundUpdatingInbound && !opts?.allowOverwriteManual) {
      throw new PurchaseTaxInvoiceDuplicateError(dup.id)
    }
    const status = await ledgerFilingStatusForPti(dup.id)
    if (status === 'submitted') throw new PurchaseTaxInvoiceSubmittedError()
    await supabaseUpdate('purchase_tax_invoices', dup.id, toDbPayload(input, actor, dup.id))
    const rows = (await supabaseSelectFilter('purchase_tax_invoices', `id=eq.${dup.id}`, {
      select: SELECT_COLS,
      limit: 1,
    })) as DbRow[] | null
    const mapped = mapDbRow(rows?.[0] || {})
    if (!mapped) throw new Error('PURCHASE_TAX_INVOICE_UPDATE_FAILED')
    await syncPurchaseTaxInvoiceVatLedger(mapped)
    return mapped
  }

  const byBatch = input.inboundBatchId ? await findByInboundBatchId(input.inboundBatchId) : null
  if (byBatch) {
    const status = await ledgerFilingStatusForPti(byBatch.id)
    if (status === 'submitted') throw new PurchaseTaxInvoiceSubmittedError()
    await supabaseUpdate('purchase_tax_invoices', byBatch.id, toDbPayload(input, actor, byBatch.id))
    const rows = (await supabaseSelectFilter('purchase_tax_invoices', `id=eq.${byBatch.id}`, {
      select: SELECT_COLS,
      limit: 1,
    })) as DbRow[] | null
    const mapped = mapDbRow(rows?.[0] || {})
    if (!mapped) throw new Error('PURCHASE_TAX_INVOICE_UPDATE_FAILED')
    await syncPurchaseTaxInvoiceVatLedger(mapped)
    return mapped
  }

  const inserted = (await supabaseInsert('purchase_tax_invoices', toDbPayload(input, actor))) as DbRow[] | null
  const mapped = mapDbRow(inserted?.[0] || {})
  if (!mapped) {
    const again = await findByDedupe(input.buyerTaxId, input.invoiceNo, input.sellerTaxId)
    if (again) {
      await syncPurchaseTaxInvoiceVatLedger(again)
      return again
    }
    throw new Error('PURCHASE_TAX_INVOICE_INSERT_FAILED')
  }
  await syncPurchaseTaxInvoiceVatLedger(mapped)
  return mapped
}

export async function deletePurchaseTaxInvoice(id: number): Promise<void> {
  const ptiId = Math.floor(Number(id) || 0)
  if (ptiId <= 0) return
  const status = await ledgerFilingStatusForPti(ptiId)
  if (status === 'submitted') throw new PurchaseTaxInvoiceSubmittedError()
  await deletePurchaseTaxInvoiceVatLedger(ptiId)
  await supabaseDeleteByFilter('purchase_tax_invoices', `id=eq.${ptiId}`)
}

export async function deletePurchaseTaxInvoices(ids: number[]): Promise<{
  deleted: number
  skippedSubmitted: number
  failed: number
}> {
  let deleted = 0
  let skippedSubmitted = 0
  let failed = 0
  for (const id of ids) {
    try {
      await deletePurchaseTaxInvoice(id)
      deleted += 1
    } catch (e) {
      if (e instanceof PurchaseTaxInvoiceSubmittedError) skippedSubmitted += 1
      else failed += 1
    }
  }
  return { deleted, skippedSubmitted, failed }
}

export async function deletePurchaseTaxInvoiceByInboundBatch(batchId: number): Promise<void> {
  const existing = await findByInboundBatchId(batchId)
  if (!existing) return
  try {
    await deletePurchaseTaxInvoice(existing.id)
  } catch (e) {
    if (e instanceof PurchaseTaxInvoiceSubmittedError) return
    throw e
  }
}

export type { PurchaseTaxInvoiceInput, PurchaseTaxInvoiceRow, PurchaseTaxInvoiceSource }