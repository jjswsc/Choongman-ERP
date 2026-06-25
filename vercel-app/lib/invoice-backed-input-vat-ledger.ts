import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
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

function parseWithdrawalCategory(note: string): string {
  const m = String(note || '').match(/withdrawal_category:([a-z_]+)/i)
  return (m?.[1] || '').trim().toLowerCase()
}

function shouldSkipBankTxVatAutoSync(category: string): boolean {
  // 매입대금·매입선급·입고·이체는 stock_logs·expense_accruals와 중복 가능
  return (
    category === 'purchase_payment' ||
    category === 'purchase_advance' ||
    category === 'transfer' ||
    category === 'transfer_external' ||
    category === 'transfer_to_petty' ||
    category === 'bank_card_bill' ||
    category === 'transfer_to_card' ||
    category === 'transfer_from_petty'
  )
}

export function vatSplitFromTaxInvoiceGross(gross: number): { net: number; vat: number } {
  const g = Math.max(0, Math.abs(Number(gross) || 0))
  if (g <= 0) return { net: 0, vat: 0 }
  const vat = round2((g * 7) / 107)
  const net = round2(g - vat)
  return { net, vat }
}

function resolveBankTxWithdrawCategory(row: { note?: string | null; category?: string | null }): string {
  const fromNote = parseWithdrawalCategory(String(row.note || ''))
  if (fromNote) return fromNote
  return String(row.category || '').trim().toLowerCase()
}

async function deleteAutoBankVatLedgerRow(bankId: number): Promise<boolean> {
  const memoTag = `[AUTO:BANK_TX:${bankId}]`
  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 5, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  const eid = Math.floor(Number(existing?.[0]?.id) || 0)
  if (eid <= 0) return false
  if (String(existing?.[0]?.filing_status || '').trim().toLowerCase() === 'submitted') return false
  await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
  return true
}

async function bankTxLinkedAccrualVat(bankId: number): Promise<number> {
  const payableRows = (await supabaseSelectFilter(
    'payable_transactions',
    `bank_transaction_id=eq.${bankId}`,
    { select: 'expense_accrual_id', limit: 20 }
  )) as { expense_accrual_id?: number | null }[] | null
  const accrualId = Math.floor(Number(payableRows?.[0]?.expense_accrual_id) || 0)
  if (accrualId <= 0) return 0
  const accrualRows = (await supabaseSelectFilter('expense_accruals', `id=eq.${accrualId}`, {
    limit: 1,
    select: 'vat_amount',
  })) as { vat_amount?: number | null }[] | null
  return Math.max(0, Number(accrualRows?.[0]?.vat_amount) || 0)
}

async function bankTxHasInboundLink(bankId: number): Promise<boolean> {
  try {
    const rows = (await supabaseSelectFilter(
      'bank_transaction_inbound_links',
      `bank_transaction_id=eq.${bankId}`,
      { select: 'id', limit: 1 }
    )) as { id?: number }[] | null
    return (rows?.length || 0) > 0
  } catch {
    return false
  }
}

async function lookupVendorTaxId(vendorCode: string): Promise<string | null> {
  const code = String(vendorCode || '').trim()
  if (!code) return null
  const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
    select: 'tax_id,name,gps_name',
  })) as { tax_id?: string | null; name?: string | null; gps_name?: string | null }[] | null
  const t = String(rows?.[0]?.tax_id || '').trim().replace(/\D/g, '')
  return t || null
}

async function lookupVendorName(vendorCode: string): Promise<string> {
  const code = String(vendorCode || '').trim()
  if (!code) return '지출'
  const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
    select: 'name,gps_name',
  })) as { name?: string | null; gps_name?: string | null }[] | null
  return String(rows?.[0]?.name || rows?.[0]?.gps_name || code).trim() || code
}

type BankTxRow = {
  id?: number
  trans_type?: string | null
  trans_date?: string | null
  amount?: number | null
  memo?: string | null
  note?: string | null
  category?: string | null
  vendor_code?: string | null
  store?: string | null
  store_name?: string | null
  invoice_received?: boolean | null
  invoice_no?: string | null
}

/**
 * 세금계산서(invoice_received) 확인된 통장 지출 → 매입 부가세 원장 반영.
 * expense_accruals·입고(stock_logs)와 이미 연결된 건은 제외.
 */
export async function syncInvoiceBackedBankInputVatLedgers(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number; skipped: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!validMonths.length) return { upserted: 0, deleted: 0, skipped: 0 }

  const storeFilter = String(params.storeFilter || '').trim()
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter || undefined)
  const startYmd = monthStartYmd(validMonths[0]!)
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1]!)

  const bankRows = (await supabaseSelectFilterAllPages(
    'bank_transactions',
    [
      'trans_type=eq.withdraw',
      'invoice_received=eq.true',
      `trans_date=gte.${encodeURIComponent(startYmd)}`,
      `trans_date=lte.${encodeURIComponent(endYmd)}`,
    ].join('&'),
    {
      select: 'id,trans_date,amount,memo,note,category,vendor_code,store,store_name,invoice_received,invoice_no',
      order: 'id.asc',
      pageSize: 4000,
      maxRows: 100000,
    }
  )) as BankTxRow[]

  const payableLinks = (await supabaseSelectFilterAllPages(
    'payable_transactions',
    'bank_transaction_id=not.is.null',
    { select: 'bank_transaction_id,expense_accrual_id,ref_type', pageSize: 4000, maxRows: 100000 }
  )) as { bank_transaction_id?: number; expense_accrual_id?: number | null; ref_type?: string | null }[]

  const inboundLinks = (await supabaseSelectFilterAllPages(
    'bank_transaction_inbound_links',
    'bank_transaction_id=not.is.null',
    { select: 'bank_transaction_id', pageSize: 4000, maxRows: 50000 }
  ).catch(() => [])) as { bank_transaction_id?: number }[]

  const bankToAccrual = new Map<number, number>()
  const bankLinkedInbound = new Set<number>()
  for (const p of payableLinks || []) {
    const bid = Math.floor(Number(p.bank_transaction_id) || 0)
    const accrualId = Math.floor(Number(p.expense_accrual_id) || 0)
    if (bid > 0 && accrualId > 0) bankToAccrual.set(bid, accrualId)
  }
  for (const l of inboundLinks || []) {
    const bid = Math.floor(Number(l.bank_transaction_id) || 0)
    if (bid > 0) bankLinkedInbound.add(bid)
  }

  const accrualIds = [...new Set(bankToAccrual.values())].filter((id) => id > 0)
  const accrualVatById = new Map<number, number>()
  if (accrualIds.length) {
    const chunkSize = 200
    for (let i = 0; i < accrualIds.length; i += chunkSize) {
      const chunk = accrualIds.slice(i, i + chunkSize)
      const rows = (await supabaseSelectFilter(
        'expense_accruals',
        `id=in.(${chunk.join(',')})`,
        { select: 'id,vat_amount', limit: chunk.length }
      )) as { id?: number; vat_amount?: number | null }[] | null
      for (const r of rows || []) {
        const id = Math.floor(Number(r.id) || 0)
        if (id > 0) accrualVatById.set(id, Math.max(0, Number(r.vat_amount) || 0))
      }
    }
  }

  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()
  let upserted = 0
  let deleted = 0
  let skipped = 0
  const seenBankIds = new Set<number>()

  for (const row of bankRows || []) {
    const bankId = Math.floor(Number(row.id) || 0)
    if (bankId <= 0) continue
    const category = resolveBankTxWithdrawCategory(row)
    if (shouldSkipBankTxVatAutoSync(category)) {
      skipped += 1
      continue
    }
    if (bankLinkedInbound.has(bankId)) {
      skipped += 1
      continue
    }
    const linkedAccrual = bankToAccrual.get(bankId)
    if (linkedAccrual && (accrualVatById.get(linkedAccrual) || 0) > 0) {
      skipped += 1
      continue
    }

    const docDate = String(row.trans_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
      skipped += 1
      continue
    }
    const taxMonth = docDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) {
      skipped += 1
      continue
    }

    const rowStore = String(row.store_name || row.store || '').trim()
    if (storeFilter && rowStore && !storeScope.matches(rowStore)) {
      skipped += 1
      continue
    }

    const gross = Math.max(0, Math.abs(Number(row.amount) || 0))
    if (gross <= 0) {
      skipped += 1
      continue
    }
    const { net, vat } = vatSplitFromTaxInvoiceGross(gross)
    if (net <= 0 && vat <= 0) {
      skipped += 1
      continue
    }

    const vendorCode = String(row.vendor_code || '').trim()
    const payeeName = vendorCode ? await lookupVendorName(vendorCode) : String(row.memo || '지출').trim() || '지출'
    const tin = vendorCode ? await lookupVendorTaxId(vendorCode) : null
    const invoiceNo = String(row.invoice_no || `BT-${bankId}`).trim().slice(0, 128)
    const memoTag = `[AUTO:BANK_TX:${bankId}]`

    const ledgerRow = mergeEvidenceIntoVatLedgerRow(
      {
        doc_date: docDate,
        tax_month: taxMonth,
        direction: 'input' as const,
        counterparty_name: payeeName.slice(0, 500),
        counterparty_tax_id: tin,
        invoice_number: invoiceNo,
        net_amount: net,
        vat_amount: vat,
        total_amount: gross,
        vat_status: 'draft_auto',
        memo: `${memoTag} 세금계산서 확인 통장지출`.slice(0, 2000),
        filing_status: 'draft',
        submitted_at: null,
        submitted_by: null,
        store_name: rowStore || null,
        updated_at: new Date().toISOString(),
      },
      'received',
      null,
      useEvidenceColumns
    )

    const existing = (await supabaseSelectFilter(
      'vat_ledger_entries',
      `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
      { limit: 5, select: 'id,filing_status' }
    )) as { id?: number; filing_status?: string | null }[] | null
    const existingId = Math.floor(Number(existing?.[0]?.id) || 0)
    const submitted = String(existing?.[0]?.filing_status || '').trim().toLowerCase() === 'submitted'
    if (existingId > 0) {
      if (!submitted) {
        try {
          await supabaseUpdate('vat_ledger_entries', existingId, ledgerRow)
        } catch (e) {
          const fallback = await vatLedgerRowForSchemaError(ledgerRow, e)
          if (fallback) await supabaseUpdate('vat_ledger_entries', existingId, fallback)
        }
      }
      upserted += 1
      seenBankIds.add(bankId)
      continue
    }

    const insertRow = {
      ...ledgerRow,
      created_by: 'system',
      created_at: new Date().toISOString(),
    }
    try {
      await supabaseInsert('vat_ledger_entries', insertRow)
    } catch (e) {
      const fallback = await vatLedgerRowForSchemaError(insertRow, e)
      if (!fallback) throw e
      await supabaseInsert('vat_ledger_entries', fallback)
    }
    upserted += 1
    seenBankIds.add(bankId)
  }

  const autoFilter = `${buildTaxMonthPostgrestFilter(validMonths)}&memo=ilike.${encodeURIComponent('%[AUTO:BANK_TX:%')}`
  const existingAuto = (await supabaseSelectFilterAllPages('vat_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status,store_name',
    pageSize: 2000,
    maxRows: 30000,
  })) as { id?: number; memo?: string | null; filing_status?: string | null; store_name?: string | null }[]

  for (const ex of existingAuto || []) {
    const m = String(ex.memo || '').match(/\[AUTO:BANK_TX:(\d+)\]/)
    const bankId = Math.floor(Number(m?.[1] || 0))
    if (bankId <= 0 || seenBankIds.has(bankId)) continue
    if (storeFilter && !storeScope.matches(String(ex.store_name || ''))) continue
    if (String(ex.filing_status || '').trim().toLowerCase() === 'submitted') continue
    const eid = Math.floor(Number(ex.id) || 0)
    if (eid > 0) {
      await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${eid}`)
      deleted += 1
    }
  }

  return { upserted, deleted, skipped }
}

/** 단건 통장 거래의 세금계산서 확인 상태 → 매입 부가세 원장 즉시 반영 */
export async function syncInvoiceBackedBankInputVatLedgerForBankId(
  bankTransactionId: number
): Promise<{ upserted: boolean; deleted: boolean; skipped: boolean }> {
  const bankId = Math.floor(Number(bankTransactionId) || 0)
  if (bankId <= 0) return { upserted: false, deleted: false, skipped: true }

  const rows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankId}`, {
    limit: 1,
    select:
      'id,trans_type,trans_date,amount,memo,note,category,vendor_code,store,store_name,invoice_received,invoice_no',
  })) as BankTxRow[] | null
  const row = rows?.[0]
  if (!row?.id) return { upserted: false, deleted: false, skipped: true }

  if (String(row.trans_type || '').toLowerCase() !== 'withdraw') {
    return { upserted: false, deleted: false, skipped: true }
  }

  if (!row.invoice_received) {
    const deleted = await deleteAutoBankVatLedgerRow(bankId)
    return { upserted: false, deleted, skipped: false }
  }

  const category = resolveBankTxWithdrawCategory(row)
  if (shouldSkipBankTxVatAutoSync(category)) {
    return { upserted: false, deleted: false, skipped: true }
  }
  if (await bankTxHasInboundLink(bankId)) {
    return { upserted: false, deleted: false, skipped: true }
  }
  if ((await bankTxLinkedAccrualVat(bankId)) > 0) {
    return { upserted: false, deleted: false, skipped: true }
  }

  const docDate = String(row.trans_date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
    return { upserted: false, deleted: false, skipped: true }
  }
  const taxMonth = docDate.slice(0, 7)

  const gross = Math.max(0, Math.abs(Number(row.amount) || 0))
  if (gross <= 0) return { upserted: false, deleted: false, skipped: true }
  const { net, vat } = vatSplitFromTaxInvoiceGross(gross)
  if (net <= 0 && vat <= 0) return { upserted: false, deleted: false, skipped: true }

  const vendorCode = String(row.vendor_code || '').trim()
  const payeeName = vendorCode ? await lookupVendorName(vendorCode) : String(row.memo || '지출').trim() || '지출'
  const tin = vendorCode ? await lookupVendorTaxId(vendorCode) : null
  const invoiceNo = String(row.invoice_no || `BT-${bankId}`).trim().slice(0, 128)
  const memoTag = `[AUTO:BANK_TX:${bankId}]`
  const rowStore = String(row.store_name || row.store || '').trim()
  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()

  const ledgerRow = mergeEvidenceIntoVatLedgerRow(
    {
      doc_date: docDate,
      tax_month: taxMonth,
      direction: 'input' as const,
      counterparty_name: payeeName.slice(0, 500),
      counterparty_tax_id: tin,
      invoice_number: invoiceNo,
      net_amount: net,
      vat_amount: vat,
      total_amount: gross,
      vat_status: 'draft_auto',
      memo: `${memoTag} 세금계산서 확인 통장지출`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: rowStore || null,
      updated_at: new Date().toISOString(),
    },
    'received',
    null,
    useEvidenceColumns
  )

  const existing = (await supabaseSelectFilter(
    'vat_ledger_entries',
    `memo=ilike.${encodeURIComponent(`%${memoTag}%`)}`,
    { limit: 5, select: 'id,filing_status' }
  )) as { id?: number; filing_status?: string | null }[] | null
  const existingId = Math.floor(Number(existing?.[0]?.id) || 0)
  const submitted = String(existing?.[0]?.filing_status || '').trim().toLowerCase() === 'submitted'

  if (existingId > 0) {
    if (!submitted) {
      try {
        await supabaseUpdate('vat_ledger_entries', existingId, ledgerRow)
      } catch (e) {
        const fallback = await vatLedgerRowForSchemaError(ledgerRow, e)
        if (fallback) await supabaseUpdate('vat_ledger_entries', existingId, fallback)
      }
    }
    return { upserted: true, deleted: false, skipped: false }
  }

  const insertRow = {
    ...ledgerRow,
    created_by: 'system',
    created_at: new Date().toISOString(),
  }
  try {
    await supabaseInsert('vat_ledger_entries', insertRow)
  } catch (e) {
    const fallback = await vatLedgerRowForSchemaError(insertRow, e)
    if (!fallback) throw e
    await supabaseInsert('vat_ledger_entries', fallback)
  }
  return { upserted: true, deleted: false, skipped: false }
}
