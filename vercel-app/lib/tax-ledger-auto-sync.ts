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
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
import { formatDateBangkok, unitPriceFromOutboundLogSnapshot, type OrderCartLine } from '@/lib/outbound-order-line-match'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { parsePurchaseOrderCart, purchaseOrderMetaOrderDate } from '@/lib/purchase-order-cart'

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

function parseExpenseAccrualWhtIdFromMemo(memo: string): number {
  const m = memo.match(/\[AUTO:EXPENSE_ACCRUAL_WHT:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

function parsePayrollRecordIdFromMemo(memo: string): number {
  const m = memo.match(/\[AUTO:PAYROLL_RECORD_WHT:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

function parsePurchaseOrderIdFromMemo(memo: string): number {
  const m = memo.match(/\[AUTO:PURCHASE_ORDER_WHT:(\d+)\]/)
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

export async function syncTaxVatLedgersFromStockAndExpenses(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ stockUpserted: number; stockDeleted: number; expenseSynced: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (validMonths.length === 0) return { stockUpserted: 0, stockDeleted: 0, expenseSynced: 0 }

  const monthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const storeScope = await createAccountingStoreScopeMatcher(storeFilter)
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])

  let itemRows: { code?: string; price?: number; cost?: number; tax_type?: string }[] | null = null
  try {
    itemRows = (await supabaseSelect('items', {
      order: 'id.asc',
      limit: 12000,
      select: 'code,price,cost,tax_type',
    })) as { code?: string; price?: number; cost?: number; tax_type?: string }[] | null
  } catch {
    // 일부 로컬/레거시 스키마에는 tax_type 컬럼이 없다.
    itemRows = (await supabaseSelect('items', {
      order: 'id.asc',
      limit: 12000,
      select: 'code,price,cost',
    })) as { code?: string; price?: number; cost?: number; tax_type?: string }[] | null
  }
  const itemMap: Record<string, ItemTaxMeta> = {}
  for (const it of itemRows || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    const taxRaw = String(it.tax_type || '').trim().toLowerCase()
    const taxType: ItemTaxMeta['taxType'] =
      taxRaw === 'exempt' || taxRaw === 'zero' ? (taxRaw as 'exempt' | 'zero') : 'taxable'
    itemMap[code] = {
      price: Number(it.price) || 0,
      cost: Number(it.cost) || 0,
      taxType,
    }
  }

  const stockFilter = [
    'log_type=in.(Outbound,ForceOutbound,Inbound)',
    `log_date=gte.${startYmd}`,
    `log_date=lte.${endYmd}T23:59:59.999`,
  ].join('&')
  let stockLogs: StockLogRow[] = []
  try {
    stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
      select:
        'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,order_id,invoice_unit_price,unit_cost',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: 200000,
    })) as StockLogRow[]
  } catch {
    try {
      stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
        select: 'id,log_type,log_date,location,vendor_target,item_code,item_name,qty,order_id,invoice_unit_price',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 200000,
      })) as StockLogRow[]
    } catch {
      stockLogs = (await supabaseSelectFilterAllPages('stock_logs', stockFilter, {
        select: 'id,log_type,log_date,location,vendor_target,item_code,item_name,qty',
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

  const seenStockIds = new Set<number>()
  let stockUpserted = 0

  for (const log of stockLogs || []) {
    const stockLogId = Math.floor(Number(log.id) || 0)
    if (stockLogId <= 0) continue
    const logType = String(log.log_type || '').trim()
    const scopedStore = taxScopeStoreFromStockLog(log)
    const loc = String(log.location || '').trim()
    const target = String(log.vendor_target || '').trim()
    const inScope =
      !storeFilter ||
      storeScope.matches(scopedStore) ||
      (loc ? storeScope.matches(loc) : false) ||
      (target ? storeScope.matches(target) : false)
    if (!inScope) continue
    const vendor = target || '-'
    if (logType === 'Inbound' && (vendor === 'From HQ' || vendor === 'HQ')) {
      // 내부 재고 이동은 매입세금계산서 대상에서 제외
      continue
    }

    const docDate = bangkokYmdFromLogDate(log.log_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) continue
    const taxMonth = docDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) continue

    const qty = Math.abs(Number(log.qty) || 0)
    if (qty <= 0) continue

    const code = String(log.item_code || '').trim()
    const itemName = String(log.item_name || '').trim()
    const item = itemMap[code] || { price: 0, cost: 0, taxType: 'taxable' as const }
    const orderId = Math.floor(Number(log.order_id) || 0)
    const cartForPrice = orderId > 0 ? orderCartById[String(orderId)] : undefined
    const unit =
      logType === 'Outbound' || logType === 'ForceOutbound'
        ? (() => {
            const derived = unitPriceFromOutboundLogSnapshot(log, cartForPrice, code, itemName, Number(item.price) || 0)
            if (Number(derived) > 0) return Number(derived)
            const unitCost = Number(log.unit_cost) || 0
            return unitCost > 0 ? unitCost : 0
          })()
        : Number(log.unit_cost) > 0
          ? Number(log.unit_cost)
          : Number(item.cost) || 0
    const net = round2(qty * unit)
    if (net <= 0) continue
    const vat = round2(net * vatRateFromTaxType(item.taxType))
    const total = round2(net + vat)

    const memoTag = `[AUTO:STOCK_LOG:${stockLogId}]`
    const row = {
      doc_date: docDate,
      tax_month: taxMonth,
      direction: logType === 'Inbound' ? ('input' as const) : ('output' as const),
      counterparty_name: vendor.slice(0, 500),
      counterparty_tax_id: null,
      invoice_number: `SL-${stockLogId}`.slice(0, 128),
      net_amount: net,
      vat_amount: vat,
      total_amount: total,
      vat_status: 'draft_auto',
      memo: `${memoTag} stock_logs 자동 반영`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: scopedStore || null,
      updated_at: new Date().toISOString(),
    }

    const existing = existingByStockId.get(stockLogId)
    if (existing?.id && existing.filingStatus === 'submitted') {
      seenStockIds.add(stockLogId)
      continue
    }
    if (existing?.id) {
      try {
        await supabaseUpdate('vat_ledger_entries', existing.id, row)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate('vat_ledger_entries', existing.id, stripSubmissionAuditFields(row))
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
      if (!isMissingSubmissionColumnError(e)) throw e
      await supabaseInsert('vat_ledger_entries', stripSubmissionAuditFields(insertRow))
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

  const expParts = [
    `expense_date=gte.${encodeURIComponent(startYmd)}`,
    `expense_date=lte.${encodeURIComponent(endYmd)}`,
    'vat_amount=gt.0',
    'status=neq.rejected',
  ]
  const expenseRows = (await supabaseSelectFilterAllPages('expense_accruals', expParts.join('&'), {
    select: 'id,store_name',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 30000,
  })) as { id?: number; store_name?: string | null }[]
  const officeScope = !!storeFilter && isHeadOfficeLikeStoreName(storeFilter)
  let expenseSynced = 0
  for (const row of expenseRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue
    const rowStore = String(row.store_name || '').trim()
    if (storeFilter && !storeScope.matches(rowStore) && !(officeScope && !rowStore)) continue
    await syncExpenseAccrualInputVatLedger(
      id,
      officeScope && !rowStore ? { fallbackStoreName: storeFilter } : undefined
    )
    expenseSynced += 1
  }

  return { stockUpserted, stockDeleted, expenseSynced }
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
  const startYmd = monthStartYmd(validMonths[0])
  const endYmd = monthEndYmd(validMonths[validMonths.length - 1])
  const expParts = [
    `expense_date=gte.${encodeURIComponent(startYmd)}`,
    `expense_date=lte.${encodeURIComponent(endYmd)}`,
    'withholding_tax_amount=gt.0',
  ]
  if (storeFilter) expParts.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  const expenseRows = (await supabaseSelectFilterAllPages('expense_accruals', expParts.join('&'), {
    select: 'id,status,payee_code,payee_name,amount,vat_amount,withholding_tax_amount,expense_date,memo,store_name',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 40000,
  })) as ExpenseAccrualWhtRow[]

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
  const autoFilter = appendStoreNameFilter(autoBase, storeFilter)
  const existingAutoRows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByExpenseId = new Map<number, { id: number; filingStatus: string }>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const expId = parseExpenseAccrualWhtIdFromMemo(String(row.memo || ''))
    if (id <= 0 || expId <= 0) continue
    existingByExpenseId.set(expId, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
    })
  }

  let upserted = 0
  const seenExpenseIds = new Set<number>()
  for (const row of expenseRows || []) {
    const expenseId = Math.floor(Number(row.id) || 0)
    if (expenseId <= 0) continue
    const status = String(row.status || '').trim().toLowerCase()
    const wht = round2(Math.max(0, Math.abs(Number(row.withholding_tax_amount) || 0)))
    if (status === 'rejected' || wht <= 0) continue

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
    const whtRate = grossBase > 0 ? round2((wht / grossBase) * 100) : null
    const memoTag = `[AUTO:EXPENSE_ACCRUAL_WHT:${expenseId}]`
    const saveRow = {
      payment_date: expenseDate,
      tax_month: taxMonth,
      payee_name: payeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: '서비스',
      gross_amount: grossBase > 0 ? grossBase : rawAmount,
      wht_rate: whtRate,
      wht_amount: wht,
      form_hint: 'PND53',
      certificate_no: `EAW-${expenseId}`.slice(0, 128),
      memo: `${memoTag} 지출 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: String(row.store_name || '').trim() || null,
      updated_at: new Date().toISOString(),
    }

    const existing = existingByExpenseId.get(expenseId)
    if (existing?.id && existing.filingStatus === 'submitted') {
      seenExpenseIds.add(expenseId)
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
      seenExpenseIds.add(expenseId)
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
    seenExpenseIds.add(expenseId)
  }

  let deleted = 0
  for (const [expenseId, ex] of existingByExpenseId.entries()) {
    if (seenExpenseIds.has(expenseId)) continue
    if (ex.filingStatus === 'submitted') continue
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

  const monthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const autoBase = `${monthFilter}&memo=ilike.${encodeURIComponent('%[AUTO:PURCHASE_ORDER_WHT:%')}`
  const autoFilter = appendStoreNameFilter(autoBase, storeFilter)
  const existingAutoRows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByPoId = new Map<number, { id: number; filingStatus: string }>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const poId = parsePurchaseOrderIdFromMemo(String(row.memo || ''))
    if (id <= 0 || poId <= 0) continue
    existingByPoId.set(poId, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
    })
  }

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
    const itemStore = items.map((it) => String(it.store || '').trim()).find(Boolean) || ''
    const taxStoreName = relatedStore || itemStore || String(po.location_name || '').trim() || null
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

    const vendorCode = String(po.vendor_code || '').trim()
    const payeeTaxId = vendorCode ? vendorTinByCode.get(vendorCode) || null : null
    const payeeName = String(po.vendor_name || vendorCode || `PO-${poId}`).trim()
    const poNo = String(po.po_no || '').trim()
    const memoTag = `[AUTO:PURCHASE_ORDER_WHT:${poId}]`
    const saveRow = {
      payment_date: docDate,
      tax_month: taxMonth,
      payee_name: payeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: '서비스',
      gross_amount: grossBase > 0 ? grossBase : total,
      wht_rate: whtRate,
      wht_amount: whtAmount,
      form_hint: 'PND53',
      certificate_no: (poNo ? `PO-${poNo}` : `PO-${poId}`).slice(0, 128),
      memo: `${memoTag} 발주 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: taxStoreName,
      updated_at: new Date().toISOString(),
    }

    const existing = existingByPoId.get(poId)
    if (existing?.id && existing.filingStatus === 'submitted') {
      seenPoIds.add(poId)
      continue
    }
    if (existing?.id) {
      try {
        await supabaseUpdate('withholding_tax_ledger_entries', existing.id, saveRow)
      } catch (e) {
        if (!isMissingSubmissionColumnError(e)) throw e
        await supabaseUpdate('withholding_tax_ledger_entries', existing.id, stripSubmissionAuditFields(saveRow))
      }
      upserted += 1
      seenPoIds.add(poId)
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
    seenPoIds.add(poId)
  }

  let deleted = 0
  for (const [poId, ex] of existingByPoId.entries()) {
    if (seenPoIds.has(poId)) continue
    if (ex.filingStatus === 'submitted') continue
    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${ex.id}`)
    deleted += 1
  }

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

  const monthFilter = buildTaxMonthPostgrestFilter(validMonths)
  const storeFilter = normalizeStoreFilter(params.storeFilter)
  const payrollFilter = appendStoreNameFilter(monthFilter, storeFilter).replace(/store_name=eq\./g, 'store=eq.')
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

  const autoBase = `${monthFilter}&memo=ilike.${encodeURIComponent('%[AUTO:PAYROLL_RECORD_WHT:%')}`
  const autoFilter = appendStoreNameFilter(autoBase, storeFilter)
  const existingAutoRows = (await supabaseSelectFilterAllPages('withholding_tax_ledger_entries', autoFilter, {
    select: 'id,memo,filing_status',
    order: 'id.asc',
    pageSize: 3000,
    maxRows: 30000,
  })) as ExistingAutoRow[]
  const existingByPayrollId = new Map<number, { id: number; filingStatus: string }>()
  for (const row of existingAutoRows || []) {
    const id = Math.floor(Number(row.id) || 0)
    const payrollId = parsePayrollRecordIdFromMemo(String(row.memo || ''))
    if (id <= 0 || payrollId <= 0) continue
    existingByPayrollId.set(payrollId, {
      id,
      filingStatus: String(row.filing_status || '').trim().toLowerCase(),
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
    if (storeFilter && !storesMatchForGradeLookup(store, storeFilter)) continue
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
    if (whtAmount <= 0) continue

    const grossFromPayroll =
      Number(p.salary || 0) +
      Number(p.pos_allow || 0) +
      Number(p.haz_allow || 0) +
      Number(p.diligence_allow || 0) +
      Number(p.birth_bonus || 0) +
      Number(p.holiday_pay || 0) +
      Number(p.spl_bonus || 0) +
      Number(p.ot_amt || 0)
    const grossFallback =
      Number(p.net_pay || 0) + Number(p.tax || 0) + Number(p.sso || 0) + Number(p.other_ded || 0)
    const grossAmount = round2(Math.max(0, grossFromPayroll > 0 ? grossFromPayroll : grossFallback))
    const rate = grossAmount > 0 ? round2((whtAmount / grossAmount) * 100) : null
    const paymentDate = monthEndYmd(taxMonth)
    const memoTag = `[AUTO:PAYROLL_RECORD_WHT:${payrollId}]`
    const saveRow = {
      payment_date: paymentDate,
      tax_month: taxMonth,
      payee_name: employeeName.slice(0, 500),
      payee_tax_id: payeeTaxId,
      income_type: '급여',
      gross_amount: grossAmount,
      wht_rate: rate,
      wht_amount: whtAmount,
      form_hint: 'PND1',
      certificate_no: `PR-${taxMonth.replace('-', '')}-${payrollId}`.slice(0, 128),
      memo: `${memoTag} 급여 원천세 자동`.slice(0, 2000),
      filing_status: 'draft',
      submitted_at: null,
      submitted_by: null,
      store_name: store || null,
      updated_at: new Date().toISOString(),
    }

    const existing = existingByPayrollId.get(payrollId)
    if (existing?.id && existing.filingStatus === 'submitted') {
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
    if (ex.filingStatus === 'submitted') continue
    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${ex.id}`)
    deleted += 1
  }

  return { upserted, deleted }
}

