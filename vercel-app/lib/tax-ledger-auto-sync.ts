import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { buildPayrollMonthPostgrestFilter, buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
import { formatDateBangkok, unitPriceFromOutboundLogSnapshot, type OrderCartLine } from '@/lib/outbound-order-line-match'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { backfillVatLedgerStoreNames, resolveStoreDisplayNameForVatLedger, syncPosOrdersOutputVatLedger } from '@/lib/pos-ledger-drafts'
import { syncInboundBatchPurchaseTaxInvoicesForMonths } from '@/lib/purchase-tax-invoice-inbound-sync'
import { CANONICAL_OFFICE_STORE, canonicalOfficeStore } from '@/lib/office-store-canonical'
import { normalizeItemTaxType } from '@/lib/income-statement-item-vat'
import {
  isAccountingPurchaseOrderByCartJson,
  parsePurchaseOrderCart,
  purchaseOrderMetaOrderDate,
} from '@/lib/purchase-order-cart'
import {
  deleteAutoWithholdingTaxLedgerEntries,
  loadAutoWhtLedgerIndex,
  shouldSkipWhtAutoOverwrite,
  upsertAutoWithholdingTaxLedgerEntry,
  type WhtAutoExistingRef,
  type WhtLedgerAutoSaveRow,
} from '@/lib/withholding-tax-ledger-core'
import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'
import { expenseWhtItemsFromTotals } from '@/lib/expense-wht-items'
import {
  mergeEvidenceIntoVatLedgerRow,
  probeVatLedgerEvidenceColumns,
  type InvoiceEvidenceStatus,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'
import {
  buildHqOutboundIndexes,
  findHqOutboundMatchForStoreInbound,
  hqIssuedInvoiceNumberForStoreInput,
  unitPriceForStoreHqInputLog,
} from '@/lib/hq-store-vat-pricing'

type ItemTaxMeta = {
  price: number
  cost: number
  taxType: 'taxable' | 'exempt' | 'zero'
}

type StockLogRow = {
  id?: number
  log_type?: string
  log_date?: string
  location?: string
  vendor_target?: string
  item_code?: string
  item_name?: string
  qty?: number
  order_id?: number | string | null
  invoice_unit_price?: number | string | null
  unit_cost?: number | string | null
  reference_no?: string | null
  inbound_batch_id?: number | null
}

type InboundBatchMeta = {
  id?: number
  invoice_received?: boolean | null
  invoice_no?: string | null
  vendor_code?: string | null
  vendor_name?: string | null
}

type ExistingAutoRow = {
  id?: number
  memo?: string | null
  filing_status?: string | null
  store_name?: string | null
}

type ExpenseAccrualWhtRow = {
  id?: number
  status?: string | null
  payee_code?: string | null
  payee_name?: string | null
  amount?: number | null
  vat_amount?: number | null
  withholding_tax_amount?: number | null
  withholding_tax_items?: unknown
  expense_date?: string | null
  memo?: string | null
  store_name?: string | null
}

type PurchaseOrderWhtRow = {
  id?: number
  po_no?: string | null
  status?: string | null
  vendor_code?: string | null
  vendor_name?: string | null
  total?: number | null
  vat?: number | null
  withholding_tax_amount?: number | null
  withholding_tax_rate?: number | null
  created_at?: string | null
  location_name?: string | null
  cart_json?: unknown
}

type EmployeeTaxRow = {
  id?: number
  name?: string | null
  store?: string | null
  tax_id?: string | null
  id_number?: string | null
}

function isMissingSubmissionColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('filing_status') || msg.includes('submitted_at') || msg.includes('submitted_by')
}

function stripSubmissionAuditFields<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.filing_status
  delete next.submitted_at
  delete next.submitted_by
  return next
}

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

/** stock_logs.log_date(TIMESTAMPTZ) → 방콕 달력 YYYY-MM-DD (세무 월과 입출고 UI 정합) */
function bangkokYmdFromLogDate(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const ms = Date.parse(s)
  if (Number.isFinite(ms)) return formatDateBangkok(new Date(ms))
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : ''
}

function vatRateFromTaxType(taxType: ItemTaxMeta['taxType']): number {
  if (taxType === 'exempt' || taxType === 'zero') return 0
  return 0.07
}

function parseStockLogIdFromMemo(memo: string): number {
  const m = memo.match(/\[AUTO:STOCK_LOG:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

function parseExpenseAccrualWhtMemo(memo: string): { expenseId: number; line: number } | null {
  const m = String(memo || '').match(/\[AUTO:EXPENSE_ACCRUAL_WHT:(\d+)(?::L(\d+))?\]/)
  if (!m) return null
  const expenseId = Math.floor(Number(m[1]) || 0)
  if (expenseId <= 0) return null
  const line = m[2] ? Math.max(1, Math.floor(Number(m[2]) || 1)) : 1
  return { expenseId, line }
}

function parsePayrollRecordIdFromMemo(memo: string): number {
  const m = memo.match(/\[AUTO:PAYROLL_RECORD_WHT:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

function normalizeStoreFilter(storeFilter?: string): string {
  const s = String(storeFilter || '').trim()
  if (!s || s === 'All' || s === '*') return ''
  return s
}

function decodePayeeCode(raw: string | undefined): { payeeCode: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src }
  return { payeeCode: src.slice(0, idx).trim() }
}

/** 세무 원장의 기본 매장키(행 저장용): location 우선, 없으면 vendor_target */
function taxScopeStoreFromStockLog(log: Pick<StockLogRow, 'log_type' | 'location' | 'vendor_target'>): string {
  const logType = String(log.log_type || '').trim()
  const loc = String(log.location || '').trim()
  const target = String(log.vendor_target || '').trim()
  if (logType === 'Outbound' || logType === 'ForceOutbound') return loc || target
  return loc || target
}

async function loadOrderCartByIds(orderIds: number[]): Promise<Record<string, OrderCartLine[]>> {
  const ids = [...new Set(orderIds.map((v) => Math.floor(Number(v) || 0)).filter((v) => v > 0))]
  const out: Record<string, OrderCartLine[]> = {}
  if (!ids.length) return out

  const chunkSize = 200
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const filter = `id=in.(${chunk.join(',')})`
    let rows: { id?: number | null; cart_json?: string | null }[] | null = null
    try {
      rows = (await supabaseSelectFilter('orders', filter, {
        select: 'id,cart_json',
        limit: chunk.length,
      })) as { id?: number | null; cart_json?: string | null }[] | null
    } catch {
      // orders/cart_json 스키마 차이 환경에서는 장바구니 단가 보강을 건너뛰고 진행
      rows = []
    }
    for (const row of rows || []) {
      const id = Math.floor(Number(row.id) || 0)
      if (id <= 0) continue
      let cart: OrderCartLine[] = []
      try {
        const parsed = JSON.parse(String(row.cart_json || '[]'))
        if (Array.isArray(parsed)) cart = parsed as OrderCartLine[]
      } catch {
        cart = []
      }
      out[String(id)] = cart
    }
  }
  return out
}

function digitsOnly(v: unknown): string {
  return String(v || '')
    .replace(/\D/g, '')
    .trim()
}

function normalizeEmployeeName(v: string): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function pickEmployeeTin(row?: EmployeeTaxRow | null): string | null {
  if (!row) return null
  const cands = [row.tax_id, row.id_number]
  for (const c of cands) {
    const d = digitsOnly(c)
    if (d.length === 13) return d
  }
  return null
}

/**
 * PP30 조회 시 경량 동기화 — 입고 배치 ภาษีซื้อ 등록함 + (매출은 지연 전체 동기화).
 * 지출·통장·카드 자동 매입 VAT는 중단.
 */
export async function syncIncrementalVatLedgersFromExpenseAndBank(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ expenseSynced: number; bankInvoiceUpserted: number; cardAllocationSynced: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { expenseSynced: 0, bankInvoiceUpserted: 0, cardAllocationSynced: 0 }

  try {
    const inbound = await syncInboundBatchPurchaseTaxInvoicesForMonths({
      months: validMonths,
      storeFilter: params.storeFilter,
    })
    return {
      expenseSynced: 0,
      bankInvoiceUpserted: inbound.upserted,
      cardAllocationSynced: 0,
    }
  } catch (e) {
    console.warn('syncIncrementalVatLedgersFromExpenseAndBank inbound PTI:', e)
    return { expenseSynced: 0, bankInvoiceUpserted: 0, cardAllocationSynced: 0 }
  }
}

export async function syncTaxVatLedgersFromStockAndExpenses(params: {
  months: string[]
  storeFilter?: string
  /** true면 POS 매출 동기화 생략(이미 별도 수행한 경우) */
  skipPos?: boolean
}): Promise<{
  stockUpserted: number
  stockDeleted: number
  expenseSynced: number
  posUpserted: number
  bankInvoiceUpserted: number
}> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) {
    return { stockUpserted: 0, stockDeleted: 0, expenseSynced: 0, posUpserted: 0, bankInvoiceUpserted: 0 }
  }

  let posUpserted = 0
  let bankInvoiceUpserted = 0

  try {
    await backfillVatLedgerStoreNames(validMonths)
  } catch (e) {
    console.warn('syncTaxVatLedgersFromStockAndExpenses vat store_name backfill:', e)
  }

  if (!params.skipPos) {
    try {
      const posSync = await syncPosOrdersOutputVatLedger({
        months: validMonths,
        storeFilter: params.storeFilter,
      })
      posUpserted = posSync.upserted
    } catch (e) {
      console.warn('syncTaxVatLedgersFromStockAndExpenses pos output sync:', e)
    }
  }

  const monthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
  const useEvidenceColumns = await probeVatLedgerEvidenceColumns()
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])

  const itemRows = (await supabaseSelect('items', {
    order: 'id.asc',
    limit: 12000,
    select: 'code,price,cost,tax',
  })) as { code?: string; price?: number; cost?: number; tax?: string }[] | null
  const itemMap: Record<string, ItemTaxMeta> = {}
  for (const it of itemRows || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    const taxType = normalizeItemTaxType(it.tax)
    itemMap[code] = {
      price: Number(it.price) || 0,
      cost: Number(it.cost) || 0,
      taxType,
    }
  }

  const stockFilter = [
    'log_type=in.(Outbound,ForceOutbound,Inbound,ForcePush)',
    `log_date=gte.${startYmd}`,
    `log_date=lte.${endYmd}T23:59:59.999`,
  ].join('&')
  let stockLogs: StockLogRow[] = []
  try {
    stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
      select:
        'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,order_id,invoice_unit_price,unit_cost,reference_no,inbound_batch_id',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: 200000,
    })) as StockLogRow[]
  } catch {
    try {
      stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
        select: 'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,order_id,invoice_unit_price,reference_no',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 200000,
      })) as StockLogRow[]
    } catch {
      stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
        select: 'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,reference_no',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 200000,
      })) as StockLogRow[]
    }
  }
  const orderIds = (stockLogs || [])
    .map((r) => Math.floor(Number(r.order_id) || 0))
    .filter((n) => n > 0)
  const orderCartById = await loadOrderCartByIds(orderIds)

  const inboundBatchById = new Map<number, InboundBatchMeta>()
  const batchIds = [
    ...new Set(
      (stockLogs || [])
        .map((r) => Math.floor(Number(r.inbound_batch_id) || 0))
        .filter((id) => id > 0)
    ),
  ]
  if (batchIds.length) {
    const chunkSize = 200
    for (let i = 0; i < batchIds.length; i += chunkSize) {
      const chunk = batchIds.slice(i, i + chunkSize)
      try {
        const batches = (await supabaseSelectFilter(
          'inbound_batches',
          `id=in.(${chunk.join(',')})`,
          { select: 'id,invoice_received,invoice_no,vendor_code,vendor_name', limit: chunk.length }
        )) as InboundBatchMeta[] | null
        for (const b of batches || []) {
          const id = Math.floor(Number(b.id) || 0)
          if (id > 0) inboundBatchById.set(id, b)
        }
      } catch {
        /* inbound_batches 미배포 환경 */
      }
    }
  }

  const autoFilter = `${monthFilter}&memo=ilike.${encodeURIComponent('%[AUTO:STOCK_LOG:%')}`
  const existingAutoRows = (await supabaseSelectFilterAllPages('vat_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status,store_name',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByStockId = new Map<number, { id: number; filingStatus: string; storeName: string }>()
  const duplicateDraftIds: number[] = []
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const stockLogId = parseStockLogIdFromMemo(String(row.memo || ''))
    if (id <= 0 || stockLogId <= 0) continue
    const filingStatus = String(row.filing_status || '').trim().toLowerCase()
    const prev = existingByStockId.get(stockLogId)
    if (!prev) {
      existingByStockId.set(stockLogId, {
        id,
        filingStatus,
        storeName: String(row.store_name || '').trim(),
      })
      continue
    }
    const prevSubmitted = prev.filingStatus === 'submitted'
    const nextSubmitted = filingStatus === 'submitted'
    if (!prevSubmitted && nextSubmitted) {
      duplicateDraftIds.push(prev.id)
      existingByStockId.set(stockLogId, {
        id,
        filingStatus,
        storeName: String(row.store_name || '').trim(),
      })
      continue
    }
    if (!prevSubmitted && !nextSubmitted) duplicateDraftIds.push(id)
  }
  for (const dupId of duplicateDraftIds) {
    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${dupId}`)
  }

  const hqOutboundIndexes = buildHqOutboundIndexes(stockLogs || [])

  const seenStockIds = new Set<number>()
  let stockUpserted = 0
  const vatStoreNameCache = new Map<string, string>()
  const resolveVatStoreName = async (raw: string): Promise<string> => {
    const key = String(raw || '').trim()
    if (!key) return ''
    const cached = vatStoreNameCache.get(key)
    if (cached !== undefined) return cached
    const resolved = await resolveStoreDisplayNameForVatLedger(key)
    vatStoreNameCache.set(key, resolved)
    return resolved
  }

  for (const log of stockLogs || []) {
    const stockLogId = Math.floor(Number(log.id) || 0)
    if (stockLogId <= 0) continue
    const logType = String(log.log_type || '').trim()
    const scopedStoreRaw = taxScopeStoreFromStockLog(log)
    const loc = String(log.location || '').trim()
    const target = String(log.vendor_target || '').trim()
    const scopedStore = scopedStoreRaw ? await resolveVatStoreName(scopedStoreRaw) : ''
    const inScope =
      !storeFilter ||
      storeScope.matches(scopedStore) ||
      (scopedStoreRaw ? storeScope.matches(scopedStoreRaw) : false) ||
      (loc ? storeScope.matches(loc) : false) ||
      (target ? storeScope.matches(target) : false)
    if (!inScope) continue
    const vendor = target || '-'

    const docDate = bangkokYmdFromLogDate(log.log_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) continue
    const taxMonth = docDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const qty = Math.abs(Number(log.qty) || 0)
    if (qty <= 0) continue

    const code = String(log.item_code || '').trim()
    if (!code) continue
    const itemName = String(log.item_name || '').trim()
    const item = itemMap[code] || { price: 0, cost: 0, taxType: 'taxable' as const }
    const orderId = Math.floor(Number(log.order_id) || 0)
    const cartForPrice = orderId > 0 ? orderCartById[String(orderId)] : undefined
    const isInputLog = logType === 'Inbound' || logType === 'ForcePush'
    // 매입 VAT는 입고 라인 단위가 아니라 purchase_tax_invoices(배치 1행)만.
    if (isInputLog) continue
    const isInternalHqMove = isInputLog && (vendor === 'From HQ' || vendor === 'HQ')
    const hqMatch = isInternalHqMove ? findHqOutboundMatchForStoreInbound(log, hqOutboundIndexes) : null
    const issuedRef = isInternalHqMove
      ? hqIssuedInvoiceNumberForStoreInput({ inbound: log, logType, hqMatch })
      : ''
    // 본사→매장 출고와 짝이 없으면 PP30 매입 자동 반영 제외(출고 관리 목록과 정합)
    if (isInternalHqMove && !issuedRef) continue
    const unit =
      !isInputLog
        ? (() => {
            const derived = unitPriceFromOutboundLogSnapshot(log, cartForPrice, code, itemName, Number(item.price) || 0)
            if (Number(derived) > 0) return Number(derived)
            const unitCost = Number(log.unit_cost) || 0
            return unitCost > 0 ? unitCost : 0
          })()
        : isInternalHqMove
          ? unitPriceForStoreHqInputLog({
              inbound: log,
              logType,
              hqMatch,
              orderCartById,
              masterPrice: Number(item.price) || 0,
              masterCost: Number(item.cost) || 0,
            })
          : Number(log.unit_cost) > 0
            ? Number(log.unit_cost)
            : Number(item.cost) || 0
    const net = round2(qty * unit)
    if (net <= 0) continue
    const vat = round2(net * vatRateFromTaxType(item.taxType))
    const total = round2(net + vat)

    const memoTag = `[AUTO:STOCK_LOG:${stockLogId}]`
    const batchId = Math.floor(Number(log.inbound_batch_id) || 0)
    const batchMeta = batchId > 0 ? inboundBatchById.get(batchId) : undefined
    const batchInvoiceReceived = Boolean(batchMeta?.invoice_received)
    const batchInvoiceNo = String(batchMeta?.invoice_no || '').trim()
    const evidenceStatus: InvoiceEvidenceStatus =
      isInputLog && isInternalHqMove
        ? 'received'
        : issuedRef
          ? 'received'
          : batchInvoiceReceived
            ? 'received'
            : 'required_pending'
    const invoiceNumber = (issuedRef || batchInvoiceNo || `SL-${stockLogId}`).slice(0, 128)
    const row = mergeEvidenceIntoVatLedgerRow(
      {
        doc_date: docDate,
        tax_month: taxMonth,
        direction: isInputLog ? ('input' as const) : ('output' as const),
        counterparty_name: vendor.slice(0, 500),
        counterparty_tax_id: null,
        invoice_number: invoiceNumber,
        net_amount: net,
        vat_amount: vat,
        total_amount: total,
        vat_status: 'draft_auto',
        memo: `${memoTag} stock_logs 자동 반영`.slice(0, 2000),
        filing_status: 'draft',
        submitted_at: null,
        submitted_by: null,
        store_name: (() => {
          const raw = String(scopedStore || scopedStoreRaw || '').trim()
          if (!raw) return null
          const office = canonicalOfficeStore(raw)
          return office === CANONICAL_OFFICE_STORE ? CANONICAL_OFFICE_STORE : raw
        })(),
        updated_at: new Date().toISOString(),
      },
      evidenceStatus,
      null,
      useEvidenceColumns
    )

    const existing = existingByStockId.get(stockLogId)
    if (existing?.id && existing.filingStatus === 'submitted') {
      seenStockIds.add(stockLogId)
      continue
    }
    if (existing?.id) {
      try {
        await supabaseUpdate('vat_ledger_entries', existing.id, row)
      } catch (e) {
        const fallback = await vatLedgerRowForSchemaError(row, e, {
          submissionStrip: stripSubmissionAuditFields,
        })
        if (!fallback) throw e
        await supabaseUpdate('vat_ledger_entries', existing.id, fallback)
      }
      seenStockIds.add(stockLogId)
      stockUpserted += 1
      continue
    }

    const insertRow = {
      ...row,
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
    seenStockIds.add(stockLogId)
    stockUpserted += 1
  }

  let stockDeleted = 0
  for (const [stockLogId, ex] of existingByStockId.entries()) {
    if (storeFilter && !storeScope.matches(ex.storeName)) continue
    if (seenStockIds.has(stockLogId)) continue
    if (ex.filingStatus === 'submitted') continue
    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${ex.id}`)
    stockDeleted += 1
  }

  let expenseSynced = 0
  try {
    const inboundSync = await syncInboundBatchPurchaseTaxInvoicesForMonths({
      months: validMonths,
      storeFilter: params.storeFilter,
    })
    expenseSynced = inboundSync.upserted
    bankInvoiceUpserted = inboundSync.upserted
  } catch (e) {
    console.warn('syncTaxVatLedgersFromStockAndExpenses inbound PTI (post-stock):', e)
  }

  return { stockUpserted, stockDeleted, expenseSynced, posUpserted, bankInvoiceUpserted }
}

export async function syncTaxWithholdingLedgersFromExpenses(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { upserted: 0, deleted: 0 }

  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter || undefined)
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])
  const expParts = [
    `expense_date=gte.${encodeURIComponent(startYmd)}`,
    `expense_date=lte.${encodeURIComponent(endYmd)}`,
    'withholding_tax_amount=gt.0',
  ]
  // exact store_name=eq 는 표기 차이로 0건 → 별칭 in.() 후 JS matches
  if (storeFilter && storeScope.dbStoreNameValues.length > 0) {
    const inList = storeScope.dbStoreNameValues.map((v) => encodeURIComponent(v)).join(',')
    expParts.push(`store_name=in.(${inList})`)
  }
  let expenseRows: ExpenseAccrualWhtRow[] = []
  try {
    expenseRows = (await supabaseSelectFilterAllPages('expense_accruals', expParts.join('&'), {
      select:
        'id,status,payee_code,payee_name,amount,vat_amount,withholding_tax_amount,withholding_tax_items,expense_date,memo,store_name',
      order: 'id.asc',
      pageSize: 4000,
      maxRows: 40000,
    })) as ExpenseAccrualWhtRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('withholding_tax_items')) throw e
    expenseRows = (await supabaseSelectFilterAllPages('expense_accruals', expParts.join('&'), {
      select: 'id,status,payee_code,payee_name,amount,vat_amount,withholding_tax_amount,expense_date,memo,store_name',
      order: 'id.asc',
      pageSize: 4000,
      maxRows: 40000,
    })) as ExpenseAccrualWhtRow[]
  }

  const vendorRows = (await supabaseSelect('vendors', {
    select: 'code,tax_id',
    order: 'id.asc',
    limit: 15000,
  })) as { code?: string | null; tax_id?: string | null }[] | null
  const vendorTinByCode = new Map<string, string>()
  for (const v of vendorRows || []) {
    const code = String(v.code || '').trim()
    if (!code) continue
    const tin = String(v.tax_id || '')
      .trim()
      .replace(/\D/g, '')
    if (tin) vendorTinByCode.set(code, tin)
  }

  const monthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const autoBase = `${monthFilter}&memo=ilike.${encodeURIComponent('%[AUTO:EXPENSE_ACCRUAL_WHT:%')}`
  let autoFilter = autoBase
  if (storeFilter && storeScope.dbStoreNameValues.length > 0) {
    const inList = storeScope.dbStoreNameValues.map((v) => encodeURIComponent(v)).join(',')
    autoFilter = `${autoBase}&store_name=in.(${inList})`
  }
  const existingAutoRows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status,store_name',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByLine = new Map<string, WhtAutoExistingRef>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const memo = String(row.memo || '')
    const parsed = parseExpenseAccrualWhtMemo(memo)
    if (id <= 0 || !parsed) continue
    if (storeFilter && !storeScope.matches(String(row.store_name || ''))) continue
    existingByLine.set(`${parsed.expenseId}:${parsed.line}`, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
      memo,
    })
  }

  let upserted = 0
  const seenLineKeys = new Set<string>()
  for (const row of expenseRows || []) {
    const expenseId = Math.floor(Number(row.id) || 0)
    if (expenseId <= 0) continue
    const status = String(row.status || '').trim().toLowerCase()
    const wht = round2(Math.max(0, Math.abs(Number(row.withholding_tax_amount) || 0)))
    if (status === 'rejected' || wht <= 0) continue

    const rowStore = String(row.store_name || '').trim()
    if (storeFilter && !storeScope.matches(rowStore)) continue

    const expenseDate = String(row.expense_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) continue
    const taxMonth = expenseDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const rawAmount = Math.max(0, Math.abs(Number(row.amount) || 0))
    const vatAmount = Math.max(0, Math.abs(Number(row.vat_amount) || 0))
    const grossBase = round2(Math.max(0, rawAmount - vatAmount))
    const { payeeCode } = decodePayeeCode(String(row.payee_code || ''))
    const payeeName = String(row.payee_name || payeeCode || `지출-${expenseId}`).trim()
    const payeeTaxId = payeeCode ? vendorTinByCode.get(payeeCode) || null : null
    const lines = expenseWhtItemsFromTotals({
      items: row.withholding_tax_items,
      taxAmount: wht,
      baseAmount: grossBase > 0 ? grossBase : rawAmount,
      incomeType: 'ค่าบริการ',
    })
    if (lines.length === 0) continue

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineNo = i + 1
      const lineKey = `${expenseId}:${lineNo}`
      const memoTag =
        lines.length === 1
          ? `[AUTO:EXPENSE_ACCRUAL_WHT:${expenseId}]`
          : `[AUTO:EXPENSE_ACCRUAL_WHT:${expenseId}:L${lineNo}]`
      const incomeType = line.incomeType || 'ค่าบริการ'
      const saveRow = {
        payment_date: expenseDate,
        tax_month: taxMonth,
        payee_name: payeeName.slice(0, 500),
        payee_tax_id: payeeTaxId,
        income_type: incomeType,
        gross_amount: line.baseAmount > 0 ? line.baseAmount : grossBase > 0 ? grossBase : rawAmount,
        wht_rate: line.rate > 0 ? line.rate : null,
        wht_amount: line.taxAmount,
        form_hint: resolveWhtPndFormHint({
          incomeType,
          payeeName,
          payeeTaxId,
        }),
        certificate_no: `EAW-${expenseId}`.slice(0, 128),
        memo: `${memoTag} 지출 원천세 자동`.slice(0, 2000),
        filing_status: 'draft' as const,
        submitted_at: null,
        submitted_by: null,
        store_name: rowStore || null,
        updated_at: new Date().toISOString(),
      }

      const existing = existingByLine.get(lineKey)
      if (shouldSkipWhtAutoOverwrite(existing)) {
        seenLineKeys.add(lineKey)
        continue
      }
      if (existing?.id) {
        try {
          await supabaseUpdate('withholding_tax_ledger_entries', existing.id, saveRow)
        } catch (e) {
          if (!isMissingSubmissionColumnError(e)) throw e
          await supabaseUpdate(
            'withholding_tax_ledger_entries',
            existing.id,
            stripSubmissionAuditFields(saveRow)
          )
        }
        upserted += 1
        seenLineKeys.add(lineKey)
        continue
      }

      const insertRow = {
        ...saveRow,
        created_by: 'system',
        created_at: new Date().toISOString(),
      }
      try {
        await supabaseInsert('withholding_tax_ledger_entries', insertRow)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseInsert('withholding_tax_ledger_entries', stripSubmissionAuditFields(insertRow))
      }
      upserted += 1
      seenLineKeys.add(lineKey)
    }
  }

  let deleted = 0
  for (const [lineKey, ex] of existingByLine.entries()) {
    if (seenLineKeys.has(lineKey)) continue
    if (shouldSkipWhtAutoOverwrite(ex)) continue
    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${ex.id}`)
    deleted += 1
  }

  return { upserted, deleted }
}

export async function syncTaxWithholdingLedgersFromPurchaseOrders(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { upserted: 0, deleted: 0 }

  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])
  const poFilter = [
    `created_at=gte.${encodeURIComponent(`${startYmd}T00:00:00`)}`,
    `created_at=lte.${encodeURIComponent(`${endYmd}T23:59:59.999`)}`,
    'withholding_tax_amount=gt.0',
  ]
  const poRows = (await supabaseSelectFilterAllPages('purchase_orders', poFilter.join('&'), {
    select:
      'id,po_no,status,vendor_code,vendor_name,total,vat,withholding_tax_amount,withholding_tax_rate,created_at,location_name,cart_json',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 50000,
  })) as PurchaseOrderWhtRow[]

  const vendorRows = (await supabaseSelect('vendors', {
    select: 'code,tax_id',
    order: 'id.asc',
    limit: 20000,
  })) as { code?: string | null; tax_id?: string | null }[] | null
  const vendorTinByCode = new Map<string, string>()
  for (const v of vendorRows || []) {
    const code = String(v.code || '').trim()
    if (!code) continue
    const tin = String(v.tax_id || '')
      .trim()
      .replace(/\D/g, '')
    if (tin) vendorTinByCode.set(code, tin)
  }

  const existingByPoId = await loadAutoWhtLedgerIndex({
    months: validMonths,
    memoTagPrefix: 'PURCHASE_ORDER_WHT',
    storeFilter,
    appendStoreFilter: appendStoreNameFilter,
  })

  let upserted = 0
  const seenPoIds = new Set<number>()
  for (const po of poRows || []) {
    const poId = Math.floor(Number(po.id) || 0)
    if (poId <= 0) continue
    const status = String(po.status || '').trim().toLowerCase()
    if (status === 'cancelled' || status === 'rejected' || status === 'cancel') continue
    const whtAmount = round2(Math.max(0, Math.abs(Number(po.withholding_tax_amount) || 0)))
    if (whtAmount <= 0) continue

    const { items, meta } = parsePurchaseOrderCart(po.cart_json)
    const relatedStore = String(meta?.relatedStore || '').trim()
    const issuerStore = String(meta?.issuerStore || '').trim()
    const itemStore = items.map((it) => String(it.store || '').trim()).find(Boolean) || ''
    const taxStoreName = issuerStore || relatedStore || itemStore || String(po.location_name || '').trim() || null
    if (storeFilter && !storesMatchForGradeLookup(String(taxStoreName || ''), storeFilter)) continue

    const docDate = purchaseOrderMetaOrderDate(po.cart_json)
      ? String(purchaseOrderMetaOrderDate(po.cart_json))
      : formatDateBangkok(new Date(String(po.created_at || new Date().toISOString())))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) continue
    const taxMonth = docDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const total = Math.max(0, Number(po.total) || 0)
    const vat = Math.max(0, Number(po.vat) || 0)
    const grossBase = round2(Math.max(0, total - vat))
    const rawRate = Number(po.withholding_tax_rate)
    const whtRate =
      Number.isFinite(rawRate) && rawRate > 0
        ? round2(rawRate)
        : grossBase > 0
          ? round2((whtAmount / grossBase) * 100)
          : null

    const isAccountingPo = isAccountingPurchaseOrderByCartJson(po.cart_json)
    const vendorCode = String(po.vendor_code || '').trim()
    const payeeTaxId = vendorCode ? vendorTinByCode.get(vendorCode) || null : null
    const payeeName = String(po.vendor_name || vendorCode || `PO-${poId}`).trim()
    const poNo = String(po.po_no || '').trim()
    const memoTag = `[AUTO:PURCHASE_ORDER_WHT:${poId}]`
    const saveRow: WhtLedgerAutoSaveRow = {
      payment_date: docDate,
      tax_month: taxMonth,
      payee_name: payeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: isAccountingPo ? '로열티·용역 수입' : '서비스',
      gross_amount: grossBase > 0 ? grossBase : total,
      wht_rate: whtRate,
      wht_amount: whtAmount,
      form_hint: resolveWhtPndFormHint({
        incomeType: isAccountingPo ? '로열티' : '서비스',
        payeeName,
        payeeTaxId,
      }),
      certificate_no: (poNo ? `PO-${poNo}` : `PO-${poId}`).slice(0, 128),
      memo: `${memoTag} ${isAccountingPo ? '발주(수입) 원천세 자동' : '발주(매입) 원천세 자동'}`.slice(
        0,
        2000
      ),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: taxStoreName,
      updated_at: new Date().toISOString(),
      // 발주 WHT(회계·물류) 모두 당사 원천징수 → 50 ทวิ 인쇄 시 본사(S&J)가 상단
      direction: 'outbound',
      source_type: 'purchase_order',
      source_id: poId,
    }

    const did = await upsertAutoWithholdingTaxLedgerEntry({
      sourceKey: poId,
      existingBySource: existingByPoId,
      saveRow,
    })
    if (did) upserted += 1
    seenPoIds.add(poId)
  }

  const deleted = await deleteAutoWithholdingTaxLedgerEntries({
    existingBySource: existingByPoId,
    seenSourceKeys: seenPoIds,
  })

  return { upserted, deleted }
}

export async function syncTaxWithholdingLedgerForPurchaseOrder(poId: number): Promise<void> {
  const id = Math.floor(Number(poId) || 0)
  if (id <= 0) return
  const rows = (await supabaseSelectFilter('purchase_orders', `id=eq.${id}`, {
    select: 'id,created_at,cart_json',
    limit: 1,
  })) as { id?: number; created_at?: string | null; cart_json?: unknown }[] | null
  const po = rows?.[0]
  if (!po?.id) return

  const docDate = purchaseOrderMetaOrderDate(po.cart_json)
    ? String(purchaseOrderMetaOrderDate(po.cart_json))
    : formatDateBangkok(new Date(String(po.created_at || new Date().toISOString())))
  const month = /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate.slice(0, 7) : ''
  if (!/^\d{4}-\d{2}$/.test(month)) return

  await syncTaxWithholdingLedgersFromPurchaseOrders({ months: [month] })
}

export async function syncTaxWithholdingLedgersFromPayroll(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { upserted: 0, deleted: 0 }

  const payrollMonthFilter = buildPayrollMonthPostgrestFilter(validMonths)
  const taxMonthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter || undefined)
  // exact store=eq 만 쓰면 표기 차이(True Digital vs CM True Digital)로 0건 → 별칭 in.() + JS matches
  let payrollFilter = payrollMonthFilter
  if (storeFilter && storeScope.dbStoreNameValues.length > 0) {
    const inList = storeScope.dbStoreNameValues
      .map((v) => encodeURIComponent(v))
      .join(',')
    payrollFilter = `${payrollMonthFilter}&store=in.(${inList})`
  }
  const payrollRows = (await supabaseSelectFilterAllPages('payroll_records', payrollFilter, {
    select:
      'id,month,store,name,employee_id,status,salary,pos_allow,haz_allow,diligence_allow,birth_bonus,holiday_pay,spl_bonus,ot_amt,sso,tax,other_ded,net_pay',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 80000,
  })) as {
    id?: number
    month?: string
    store?: string
    name?: string
    employee_id?: number
    status?: string
    salary?: number
    pos_allow?: number
    haz_allow?: number
    diligence_allow?: number
    birth_bonus?: number
    holiday_pay?: number
    spl_bonus?: number
    ot_amt?: number
    sso?: number
    tax?: number
    other_ded?: number
    net_pay?: number
  }[]

  const empRows = (await supabaseSelect('employees', {
    select: 'id,name,store,tax_id,id_number',
    order: 'id.asc',
    limit: 15000,
  })) as EmployeeTaxRow[] | null
  const employeeTinById = new Map<number, string>()
  const employeeTinByStoreName = new Map<string, string>()
  for (const e of empRows || []) {
    const tin = pickEmployeeTin(e)
    if (!tin) continue
    const eid = Math.floor(Number(e.id) || 0)
    if (eid > 0 && !employeeTinById.has(eid)) employeeTinById.set(eid, tin)
    const key = `${String(e.store || '').trim().toLowerCase()}|${normalizeEmployeeName(String(e.name || ''))}`
    if (key !== '|' && !employeeTinByStoreName.has(key)) employeeTinByStoreName.set(key, tin)
  }

  // withholding_tax_ledger_entries uses tax_month (not payroll_records.month)
  const autoBase = `${taxMonthFilter}&memo=ilike.${encodeURIComponent('%[AUTO:PAYROLL_RECORD_WHT:%')}`
  let autoFilter = autoBase
  if (storeFilter && storeScope.dbStoreNameValues.length > 0) {
    const inList = storeScope.dbStoreNameValues
      .map((v) => encodeURIComponent(v))
      .join(',')
    autoFilter = `${autoBase}&store_name=in.(${inList})`
  }
  const existingAutoRows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status,store_name',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByPayrollId = new Map<number, WhtAutoExistingRef>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const memo = String(row.memo || '')
    const payrollId = parsePayrollRecordIdFromMemo(memo)
    if (id <= 0 || payrollId <= 0) continue
    if (storeFilter && !storeScope.matches(String(row.store_name || ''))) continue
    existingByPayrollId.set(payrollId, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
      memo,
    })
  }

  let upserted = 0
  const seenPayrollIds = new Set<number>()
  for (const p of payrollRows || []) {
    const payrollId = Math.floor(Number(p.id) || 0)
    if (payrollId <= 0) continue
    const taxMonth = String(p.month || '').slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue
    const store = String(p.store || '').trim()
    if (storeFilter && !storeScope.matches(store)) continue
    const employeeName = String(p.name || '').trim()
    if (!employeeName) continue
    const employeeId = Math.floor(Number(p.employee_id) || 0)
    const tinById = employeeId > 0 ? employeeTinById.get(employeeId) || null : null
    const tinByStoreName =
      employeeTinByStoreName.get(`${store.toLowerCase()}|${normalizeEmployeeName(employeeName)}`) || null
    const payeeTaxId = tinById || tinByStoreName || null

    const st = String(p.status || '').trim().toLowerCase()
    if (st === 'cancel' || st === 'cancelled' || st === 'canceled' || st === 'rejected' || st === '반려') continue

    const whtAmount = round2(Math.max(0, Number(p.tax) || 0))

    const ssoAmount = round2(Math.max(0, Number(p.sso) || 0))
    // SSO 미적용(3% 원천) 직원도 급여 지급 → ภ.ง.ด.1. 개인 용역(지출 EAW)만 PND3.
    const usePaidGrossForSsoExempt = ssoAmount <= 0
    const grossFromPayroll =
      Number(p.salary || 0) +
      Number(p.pos_allow || 0) +
      Number(p.haz_allow || 0) +
      Number(p.diligence_allow || 0) +
      Number(p.birth_bonus || 0) +
      Number(p.holiday_pay || 0) +
      Number(p.spl_bonus || 0) +
      Number(p.ot_amt || 0)
    const grossPaidBeforeWithholding = Number(p.net_pay || 0) + Number(p.tax || 0) + ssoAmount
    const grossFallback =
      Number(p.net_pay || 0) + Number(p.tax || 0) + Number(p.sso || 0) + Number(p.other_ded || 0)
    const grossAmount = round2(
      Math.max(
        0,
        usePaidGrossForSsoExempt
          ? grossPaidBeforeWithholding > 0
            ? grossPaidBeforeWithholding
            : grossFromPayroll > 0
              ? grossFromPayroll
              : grossFallback
          : grossFromPayroll > 0
            ? grossFromPayroll
            : grossFallback
      )
    )
    // PND1 신고 목록: 원천세 0이어도 지급(총액)>0 이면 포함
    if (grossAmount <= 0 && whtAmount <= 0) continue

    const rate = grossAmount > 0 ? round2((whtAmount / grossAmount) * 100) : null
    const paymentDate = monthEndYmd(taxMonth)
    const memoTag = `[AUTO:PAYROLL_RECORD_WHT:${payrollId}]`
    const formHint = 'PND1'
    const saveRow = {
      payment_date: paymentDate,
      tax_month: taxMonth,
      payee_name: employeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: '급여',
      gross_amount: grossAmount,
      wht_rate: rate,
      wht_amount: whtAmount,
      form_hint: formHint,
      certificate_no: `PR1-${taxMonth.replace('-', '')}-${payrollId}`.slice(0, 128),
      memo: `${memoTag} ${formHint} 급여 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: store || null,
      updated_at: new Date().toISOString(),
    }

    const existing = existingByPayrollId.get(payrollId)
    if (shouldSkipWhtAutoOverwrite(existing)) {
      seenPayrollIds.add(payrollId)
      continue
    }
    if (existing?.id) {
      try {
        await supabaseUpdate('withholding_tax_ledger_entries', existing.id, saveRow)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate(
          'withholding_tax_ledger_entries',
          existing.id,
          stripSubmissionAuditFields(saveRow)
        )
      }
      upserted += 1
      seenPayrollIds.add(payrollId)
      continue
    }

    const insertRow = {
      ...saveRow,
      created_by: 'system',
      created_at: new Date().toISOString(),
    }
    try {
      await supabaseInsert('withholding_tax_ledger_entries', insertRow)
    } catch (e) {
      if (!isMissingSubmissionColumnError(e)) throw e
      await supabaseInsert('withholding_tax_ledger_entries', stripSubmissionAuditFields(insertRow))
    }
    upserted += 1
    seenPayrollIds.add(payrollId)
  }

  let deleted = 0
  for (const [payrollId, ex] of existingByPayrollId.entries()) {
    if (seenPayrollIds.has(payrollId)) continue
    if (shouldSkipWhtAutoOverwrite(ex)) continue
    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${ex.id}`)
    deleted += 1
  }

  return { upserted, deleted }
}

type BankDepositWhtRow = {
  id?: number
  trans_type?: string | null
  trans_date?: string | null
  amount?: number | null
  category?: string | null
  store_name?: string | null
  memo?: string | null
  ref_type?: string | null
  ref_id?: number | null
  withholding_tax_amount?: number | null
  withholding_tax_rate?: number | null
}

/** 통장 입금: 상대가 원천징수한 금액 → inbound 원장 (AccountingPO 연동 입금은 PO 원장 우선) */
export async function syncTaxWithholdingLedgersFromBankDeposits(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { upserted: 0, deleted: 0 }

  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])
  const btFilter = [
    `trans_type=eq.deposit`,
    `trans_date=gte.${encodeURIComponent(startYmd)}`,
    `trans_date=lte.${encodeURIComponent(endYmd)}`,
    'withholding_tax_amount=gt.0',
  ]
  if (storeFilter) btFilter.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)

  let bankRows: BankDepositWhtRow[] = []
  try {
    bankRows = (await supabaseSelectFilterAllPages('bank_transactions', btFilter.join('&'), {
      select:
        'id,trans_type,trans_date,amount,category,store_name,memo,ref_type,ref_id,withholding_tax_amount,withholding_tax_rate',
      order: 'id.asc',
      pageSize: 3000,
      maxRows: 50000,
    })) as BankDepositWhtRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('withholding_tax_amount')) return { upserted: 0, deleted: 0 }
    throw e
  }

  const existingByBankId = await loadAutoWhtLedgerIndex({
    months: validMonths,
    memoTagPrefix: 'BANK_DEPOSIT_WHT',
    storeFilter,
    appendStoreFilter: appendStoreNameFilter,
  })

  let upserted = 0
  const seenBankIds = new Set<number>()
  for (const bt of bankRows || []) {
    const bankId = Math.floor(Number(bt.id) || 0)
    if (bankId <= 0) continue

    const refType = String(bt.ref_type || '').trim()
    const refId = Math.floor(Number(bt.ref_id) || 0)
    if (refType === 'AccountingPO' && refId > 0) {
      seenBankIds.add(bankId)
      continue
    }

    const whtAmount = round2(Math.max(0, Math.abs(Number(bt.withholding_tax_amount) || 0)))
    if (whtAmount <= 0) continue

    const transDate = String(bt.trans_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) continue
    const taxMonth = transDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const netDeposit = round2(Math.max(0, Math.abs(Number(bt.amount) || 0)))
    const gross = round2(netDeposit + whtAmount)
    const rawRate = Number(bt.withholding_tax_rate)
    const whtRate =
      Number.isFinite(rawRate) && rawRate > 0
        ? round2(rawRate)
        : gross > 0
          ? round2((whtAmount / gross) * 100)
          : null

    const storeName = String(bt.store_name || '').trim() || null
    if (storeFilter && storeName && !storesMatchForGradeLookup(storeName, storeFilter)) continue

    const payeeName = storeName || '입금'
    const memoTag = `[AUTO:BANK_DEPOSIT_WHT:${bankId}]`
    const saveRow: WhtLedgerAutoSaveRow = {
      payment_date: transDate,
      tax_month: taxMonth,
      payee_name: payeeName.slice(0, 500),
      payee_tax_id: null,
      income_type: '서비스 수입',
      gross_amount: gross > 0 ? gross : netDeposit,
      wht_rate: whtRate,
      wht_amount: whtAmount,
      form_hint: resolveWhtPndFormHint({ incomeType: '서비스', payeeName }),
      certificate_no: `BT-${bankId}`.slice(0, 128),
      memo: `${memoTag} 통장 입금(수입) 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: storeName,
      updated_at: new Date().toISOString(),
      direction: 'inbound',
      source_type: 'bank_transaction',
      source_id: bankId,
    }

    const did = await upsertAutoWithholdingTaxLedgerEntry({
      sourceKey: bankId,
      existingBySource: existingByBankId,
      saveRow,
    })
    if (did) upserted += 1
    seenBankIds.add(bankId)
  }

  const deleted = await deleteAutoWithholdingTaxLedgerEntries({
    existingBySource: existingByBankId,
    seenSourceKeys: seenBankIds,
  })

  return { upserted, deleted }
}

export async function syncTaxWithholdingLedgerForBankTransaction(bankTransactionId: number): Promise<void> {
  const id = Math.floor(Number(bankTransactionId) || 0)
  if (id <= 0) return
  let rows: BankDepositWhtRow[] = []
  try {
    rows = (await supabaseSelectFilter('bank_transactions', `id=eq.${id}`, {
      select: 'id,trans_type,trans_date,withholding_tax_amount',
      limit: 1,
    })) as BankDepositWhtRow[]
  } catch {
    return
  }
  const bt = rows?.[0]
  if (!bt?.id) return
  const transDate = String(bt.trans_date || '').slice(0, 10)
  const month = /^\d{4}-\d{2}-\d{2}$/.test(transDate) ? transDate.slice(0, 7) : ''
  if (!month) return
  const wht = Math.max(0, Number(bt.withholding_tax_amount) || 0)
  if (wht <= 0) {
    const { deleteAutoWhtBySource } = await import('@/lib/withholding-tax-ledger-core')
    await deleteAutoWhtBySource('bank_transaction', id)
    return
  }
  const transType = String(bt.trans_type || '').toLowerCase()
  if (transType === 'withdraw') {
    await syncTaxWithholdingLedgersFromBankWithdrawals({ months: [month] })
    return
  }
  await syncTaxWithholdingLedgersFromBankDeposits({ months: [month] })
}

/** 지출 발생 저장 직후 — 해당 월 원장 eager sync */
export async function syncTaxWithholdingLedgerForExpenseAccrual(expenseAccrualId: number): Promise<void> {
  const id = Math.floor(Number(expenseAccrualId) || 0)
  if (id <= 0) return
  const rows = (await supabaseSelectFilter('expense_accruals', `id=eq.${id}`, {
    select: 'id,expense_date,withholding_tax_amount',
    limit: 1,
  })) as ExpenseAccrualWhtRow[]
  const row = rows?.[0]
  if (!row?.id) return
  const expenseDate = String(row.expense_date || '').slice(0, 10)
  const month = /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) ? expenseDate.slice(0, 7) : ''
  if (!month) return
  const wht = Math.max(0, Number(row.withholding_tax_amount) || 0)
  if (wht <= 0) return
  await syncTaxWithholdingLedgersFromExpenses({ months: [month] })
}

type BankWithdrawWhtRow = {
  id?: number
  trans_type?: string | null
  trans_date?: string | null
  amount?: number | null
  category?: string | null
  store_name?: string | null
  store?: string | null
  memo?: string | null
  vendor_code?: string | null
  vat_amount?: number | null
  withholding_tax_amount?: number | null
  withholding_tax_rate?: number | null
}

/** 통장 출금(즉시 지급) 시 당사 원천징수 → outbound 원장 */
export async function syncTaxWithholdingLedgersFromBankWithdrawals(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { upserted: 0, deleted: 0 }

  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])
  const btFilter = [
    `trans_type=eq.withdraw`,
    `trans_date=gte.${encodeURIComponent(startYmd)}`,
    `trans_date=lte.${encodeURIComponent(endYmd)}`,
    'withholding_tax_amount=gt.0',
  ]
  if (storeFilter) btFilter.push(`store=eq.${encodeURIComponent(storeFilter)}`)

  let bankRows: BankWithdrawWhtRow[] = []
  try {
    bankRows = (await supabaseSelectFilterAllPages('bank_transactions', btFilter.join('&'), {
      select:
        'id,trans_type,trans_date,amount,category,store,memo,vendor_code,vat_amount,withholding_tax_amount,withholding_tax_rate',
      order: 'id.asc',
      pageSize: 3000,
      maxRows: 50000,
    })) as BankWithdrawWhtRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (!msg.includes('withholding_tax_amount') && !msg.includes('vat_amount')) return { upserted: 0, deleted: 0 }
    throw e
  }

  const vendorRows = (await supabaseSelect('vendors', {
    select: 'code,tax_id',
    order: 'id.asc',
    limit: 15000,
  })) as { code?: string | null; tax_id?: string | null }[] | null
  const vendorTinByCode = new Map<string, string>()
  for (const v of vendorRows || []) {
    const code = String(v.code || '').trim()
    if (!code) continue
    const tin = String(v.tax_id || '')
      .trim()
      .replace(/\D/g, '')
    if (tin) vendorTinByCode.set(code, tin)
  }

  const existingByBankId = await loadAutoWhtLedgerIndex({
    months: validMonths,
    memoTagPrefix: 'BANK_WITHDRAW_WHT',
    storeFilter,
    appendStoreFilter: appendStoreNameFilter,
  })

  let upserted = 0
  const seenBankIds = new Set<number>()
  for (const bt of bankRows || []) {
    const bankId = Math.floor(Number(bt.id) || 0)
    if (bankId <= 0) continue

    const whtAmount = round2(Math.max(0, Math.abs(Number(bt.withholding_tax_amount) || 0)))
    if (whtAmount <= 0) continue

    const transDate = String(bt.trans_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) continue
    const taxMonth = transDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const netPaid = round2(Math.max(0, Math.abs(Number(bt.amount) || 0)))
    const vatAmount = round2(Math.max(0, Math.abs(Number(bt.vat_amount) || 0)))
    const grossIncl = round2(netPaid + whtAmount)
    const grossBase = round2(Math.max(0, grossIncl - vatAmount))
    const rawRate = Number(bt.withholding_tax_rate)
    const whtRate =
      Number.isFinite(rawRate) && rawRate > 0
        ? round2(rawRate)
        : grossBase > 0
          ? round2((whtAmount / grossBase) * 100)
          : null

    const storeName = String(bt.store || bt.store_name || '').trim() || null
    if (storeFilter && storeName && !storesMatchForGradeLookup(storeName, storeFilter)) continue

    const vendorCode = String(bt.vendor_code || '').trim()
    const payeeName = vendorCode || String(bt.memo || '').trim() || `출금-${bankId}`
    const payeeTaxId = vendorCode ? vendorTinByCode.get(vendorCode) || null : null
    const memoTag = `[AUTO:BANK_WITHDRAW_WHT:${bankId}]`
    const saveRow: WhtLedgerAutoSaveRow = {
      payment_date: transDate,
      tax_month: taxMonth,
      payee_name: payeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: '서비스',
      gross_amount: grossBase > 0 ? grossBase : grossIncl,
      wht_rate: whtRate,
      wht_amount: whtAmount,
      form_hint: resolveWhtPndFormHint({
        incomeType: 'ค่าบริการ',
        payeeName,
        payeeTaxId,
      }),
      certificate_no: `BTW-${bankId}`.slice(0, 128),
      memo: `${memoTag} 통장 출금 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: storeName,
      updated_at: new Date().toISOString(),
      direction: 'outbound',
      source_type: 'bank_transaction',
      source_id: bankId,
    }

    const did = await upsertAutoWithholdingTaxLedgerEntry({
      sourceKey: bankId,
      existingBySource: existingByBankId,
      saveRow,
    })
    if (did) upserted += 1
    seenBankIds.add(bankId)
  }

  const deleted = await deleteAutoWithholdingTaxLedgerEntries({
    existingBySource: existingByBankId,
    seenSourceKeys: seenBankIds,
  })

  return { upserted, deleted }
}

