import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { canonicalLedgerStoreName } from '@/lib/erp-store-identity'
import { POS_SALES_COMPLETED_STATUSES } from '@/lib/pos-sales-period-aggregate'
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
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

/** POS·입고·직원 등任意 키 → erp_stores.display_name (VAT 원장 store_name 단일 표기) */
export async function resolveStoreDisplayNameForVatLedger(storeKey: string): Promise<string> {
  return canonicalLedgerStoreName(storeKey)
}

/** POS 주문 id → store_code (VAT 원장 store_name 공란 행 해석용) */
export async function buildPosOrderStoreCodeMap(orderIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const idList = Array.from(new Set(orderIds.map((id) => Math.floor(Number(id) || 0)).filter((id) => id > 0)))
  const chunkSize = 200
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize)
    const orderRows = (await supabaseSelectFilter('pos_orders', `id=in.(${chunk.join(',')})`, {
      select: 'id,store_code',
      limit: chunk.length,
    })) as { id?: number; store_code?: string | null }[] | null
    for (const o of orderRows || []) {
      const oid = Math.floor(Number(o.id) || 0)
      const sc = String(o.store_code || '').trim()
      if (oid > 0 && sc) out.set(oid, sc)
    }
  }
  return out
}

/** stock_logs id → location (매입 자동 원장 store_name 공란 행 해석용) */
export async function buildStockLogLocationMap(stockLogIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const idList = Array.from(new Set(stockLogIds.map((id) => Math.floor(Number(id) || 0)).filter((id) => id > 0)))
  const chunkSize = 200
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize)
    const rows = (await supabaseSelectFilter('stock_logs', `id=in.(${chunk.join(',')})`, {
      select: 'id,location,vendor_target',
      limit: chunk.length,
    })) as { id?: number; location?: string | null; vendor_target?: string | null }[] | null
    for (const row of rows || []) {
      const sid = Math.floor(Number(row.id) || 0)
      const loc = String(row.location || '').trim() || String(row.vendor_target || '').trim()
      if (sid > 0 && loc) out.set(sid, loc)
    }
  }
  return out
}

/** expense_accruals id → store_name (지출 매입 VAT 원장 store_name 공란 행 해석용) */
export async function buildExpenseAccrualStoreMap(expenseIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  const idList = Array.from(new Set(expenseIds.map((id) => Math.floor(Number(id) || 0)).filter((id) => id > 0)))
  const chunkSize = 200
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize)
    const rows = (await supabaseSelectFilter('expense_accruals', `id=in.(${chunk.join(',')})`, {
      select: 'id,store_name',
      limit: chunk.length,
    })) as { id?: number; store_name?: string | null }[] | null
    for (const row of rows || []) {
      const eid = Math.floor(Number(row.id) || 0)
      const store = String(row.store_name || '').trim()
      if (eid > 0 && store) out.set(eid, store)
    }
  }
  return out
}

type VatLedgerStoreResolveMaps = {
  posStoreByOrderId: Map<number, string>
  stockLocationByLogId: Map<number, string>
  expenseStoreById: Map<number, string>
}

function parseAutoMemoSourceKey(
  memo: string,
  maps: VatLedgerStoreResolveMaps
): string {
  const text = String(memo || '')
  const posM = text.match(/\[AUTO:POS_ORDER:(\d+)\]/i)
  if (posM) {
    const oid = Math.floor(Number(posM[1]) || 0)
    return (oid > 0 ? maps.posStoreByOrderId.get(oid) : '') || ''
  }
  const stockM = text.match(/\[AUTO:STOCK_LOG:(\d+)\]/i)
  if (stockM) {
    const sid = Math.floor(Number(stockM[1]) || 0)
    return (sid > 0 ? maps.stockLocationByLogId.get(sid) : '') || ''
  }
  const expM = text.match(/\[AUTO:EXPENSE_ACCRUAL:(\d+)\]/i)
  if (expM) {
    const eid = Math.floor(Number(expM[1]) || 0)
    return (eid > 0 ? maps.expenseStoreById.get(eid) : '') || ''
  }
  return ''
}

/** store_name 공란 VAT 원장 — memo의 POS·입고·지출 자동 태그로 매장 표시명 추론 */
export async function resolveVatLedgerEntryStoreNameForScope(
  row: { store_name?: string | null; memo?: string | null },
  maps: VatLedgerStoreResolveMaps
): Promise<string> {
  const current = String(row.store_name || '').trim()
  if (current) {
    const normalized = await resolveStoreDisplayNameForVatLedger(current)
    return normalized || current
  }
  const sourceKey = parseAutoMemoSourceKey(String(row.memo || ''), maps)
  if (!sourceKey) return ''
  return resolveStoreDisplayNameForVatLedger(sourceKey)
}

/** 조회·백필 전 memo에서 자동 원장 소스 id 수집 */
function collectVatLedgerAutoMemoIds(rows: { store_name?: string | null; memo?: string | null }[]): {
  posOrderIds: number[]
  stockLogIds: number[]
  expenseIds: number[]
} {
  const posOrderIds: number[] = []
  const stockLogIds: number[] = []
  const expenseIds: number[] = []
  for (const row of rows || []) {
    const memo = String(row.memo || '')
    const posM = memo.match(/\[AUTO:POS_ORDER:(\d+)\]/i)
    if (posM) {
      const oid = Math.floor(Number(posM[1]) || 0)
      if (oid > 0) posOrderIds.push(oid)
    }
    const stockM = memo.match(/\[AUTO:STOCK_LOG:(\d+)\]/i)
    if (stockM) {
      const sid = Math.floor(Number(stockM[1]) || 0)
      if (sid > 0) stockLogIds.push(sid)
    }
    const expM = memo.match(/\[AUTO:EXPENSE_ACCRUAL:(\d+)\]/i)
    if (expM) {
      const eid = Math.floor(Number(expM[1]) || 0)
      if (eid > 0) expenseIds.push(eid)
    }
  }
  return { posOrderIds, stockLogIds, expenseIds }
}

/** 조회 직전 store_name 보강 — backfill 후에도 공란·레거시 표기인 자동 행 */
export async function enrichVatLedgerRowsStoreNames(
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  const { posOrderIds, stockLogIds, expenseIds } = collectVatLedgerAutoMemoIds(rows || [])
  if (!posOrderIds.length && !stockLogIds.length && !expenseIds.length) {
    const out: Record<string, unknown>[] = []
    for (const row of rows || []) {
      const current = String(row.store_name || '').trim()
      if (!current) {
        out.push(row)
        continue
      }
      const normalized = await resolveStoreDisplayNameForVatLedger(current)
      if (normalized && normalized !== current) out.push({ ...row, store_name: normalized })
      else out.push(row)
    }
    return out
  }
  const [posStoreByOrderId, stockLocationByLogId, expenseStoreById] = await Promise.all([
    buildPosOrderStoreCodeMap(posOrderIds),
    buildStockLogLocationMap(stockLogIds),
    buildExpenseAccrualStoreMap(expenseIds),
  ])
  const maps: VatLedgerStoreResolveMaps = { posStoreByOrderId, stockLocationByLogId, expenseStoreById }
  const out: Record<string, unknown>[] = []
  for (const row of rows || []) {
    const resolved = await resolveVatLedgerEntryStoreNameForScope(row, maps)
    if (resolved) out.push({ ...row, store_name: resolved })
    else out.push(row)
  }
  return out
}

/** 과거·자동 VAT 원장 store_name → erp_stores.display_name 백필 (POS·입고·지출 공통) */
export async function backfillVatLedgerStoreNames(validMonths: string[]): Promise<number> {
  const months = (validMonths || []).map((m) => String(m || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!months.length) return 0
  const monthFilter = buildTaxMonthPostgrestFilter(months)
  const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', monthFilter, {
    select: 'id,store_name,memo',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 100000,
  })) as { id?: number; store_name?: string | null; memo?: string | null }[]

  const { posOrderIds, stockLogIds, expenseIds } = collectVatLedgerAutoMemoIds(rows || [])
  const [posStoreByOrderId, stockLocationByLogId, expenseStoreById] = await Promise.all([
    buildPosOrderStoreCodeMap(posOrderIds),
    buildStockLogLocationMap(stockLogIds),
    buildExpenseAccrualStoreMap(expenseIds),
  ])
  const maps: VatLedgerStoreResolveMaps = { posStoreByOrderId, stockLocationByLogId, expenseStoreById }

  let updated = 0
  for (const row of rows || []) {
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue
    const current = String(row.store_name || '').trim()
    const resolved = await resolveVatLedgerEntryStoreNameForScope(row, maps)
    if (!resolved || resolved === current) continue
    await supabaseUpdate('vat_ledger_entries', id, {
      store_name: resolved.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    updated += 1
  }
  return updated
}

/** @deprecated backfillVatLedgerStoreNames 사용 */
export async function backfillPosVatLedgerStoreNames(validMonths: string[]): Promise<number> {
  return backfillVatLedgerStoreNames(validMonths)
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

async function deletePosVatLedgerDraft(posOrderId: number): Promise<void> {
  const orderId = Math.floor(Number(posOrderId) || 0)
  if (orderId <= 0) return
  const memoTag = `[AUTO:POS_ORDER:${orderId}]`
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
 * POS 완료·결제·ready 주문 → 매출 부가세 원장 일괄 동기화 (매출 관리 posSalesByStore와 동일 상태 기준).
 * 과거 누락·paid/ready만 있는 주문을 세무 신고월 기준으로 백필한다.
 */
export async function syncPosOrdersOutputVatLedger(params: {
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

  const orders = (await supabaseSelectFilterAllPages(
    'pos_orders',
    `created_at=gte.${encodeURIComponent(`${startYmd}T00:00:00`)}&created_at=lte.${encodeURIComponent(`${endYmd}T23:59:59.999`)}`,
    {
      select: 'id,order_no,store_code,created_at,subtotal,vat,total,status,created_by',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: 500000,
    }
  )) as {
    id?: number
    order_no?: string | null
    store_code?: string | null
    created_at?: string | null
    subtotal?: number | null
    vat?: number | null
    total?: number | null
    status?: string | null
    created_by?: string | null
  }[]

  let upserted = 0
  let deleted = 0
  let skipped = 0

  for (const order of orders || []) {
    const orderId = Math.floor(Number(order.id) || 0)
    if (orderId <= 0) continue
    const status = String(order.status || '').trim().toLowerCase()
    const storeCode = String(order.store_code || '').trim()
    const storeName = storeCode ? await resolveStoreDisplayNameForVatLedger(storeCode) : ''
    if (storeFilter) {
      const inScope =
        (storeCode && storeScope.matches(storeCode)) || (storeName && storeScope.matches(storeName))
      if (!inScope) {
        skipped += 1
        continue
      }
    }

    const docDate = toBangkokYmd(String(order.created_at || ''))
    const taxMonth = docDate.slice(0, 7)
    if (!validMonths.includes(taxMonth)) {
      skipped += 1
      continue
    }

    if (status === 'cancelled' || status === 'refunded') {
      await deletePosVatLedgerDraft(orderId)
      deleted += 1
      continue
    }

    if (!POS_SALES_COMPLETED_STATUSES.includes(status as (typeof POS_SALES_COMPLETED_STATUSES)[number])) {
      skipped += 1
      continue
    }

    const total = Math.max(0, Number(order.total) || 0)
    if (total <= 0) {
      skipped += 1
      continue
    }

    await upsertPosVatLedgerDraft({
      posOrderId: orderId,
      orderNo: String(order.order_no || `POS-${orderId}`),
      storeCode,
      createdAtIso: String(order.created_at || ''),
      subtotal: Number(order.subtotal ?? 0),
      total,
      vatAmount: Number(order.vat ?? 0),
      createdBy: String(order.created_by || 'system'),
    })
    upserted += 1
  }

  return { upserted, deleted, skipped }
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
  if (total <= 0) return
  const vatAmount = Math.max(0, Number(params.vatAmount) || 0)
  const netAmount = Math.max(0, Number(params.subtotal ?? total - vatAmount) || 0)
  if (netAmount <= 0 && total <= 0) return

  const docDate = toBangkokYmd(params.createdAtIso)
  const taxMonth = docDate.slice(0, 7)
  const invoiceNo = String(params.orderNo || `POS-${orderId}`).trim() || `POS-${orderId}`
  const memoTag = `[AUTO:POS_ORDER:${orderId}]`
  const storeName = await resolveStoreDisplayNameForVatLedger(String(params.storeCode || '').trim())
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
      store_name: storeName || null,
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
