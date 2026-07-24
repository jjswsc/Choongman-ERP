import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { canonicalLedgerStoreName } from '@/lib/erp-store-identity'
import {
  filterCompletedPosSalesRows,
  type PeriodOrderRow,
} from '@/lib/pos-sales-period-aggregate'
import { buildTaxMonthPostgrestFilter } from '@/lib/thai-tax-period'
import {
  applyEvidenceToVatLedgerRow,
  vatLedgerRowForSchemaError,
} from '@/lib/vat-ledger-invoice-evidence'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { isPosSalesBusinessYmdInInclusiveRange } from '@/lib/pos-sales-business-day-range'
import { splitThaiVatInclusiveGrossForReceipt } from '@/lib/pos-pricing'
import { isPosSalesTestOfficeStoreCode } from '@/lib/pos-sales-test-office'

function toBangkokYmd(inputIso?: string): string {
  const src = String(inputIso || '').trim()
  const base = src ? new Date(src) : new Date()
  if (Number.isNaN(base.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  }
  return base.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/**
 * POS 주문 → 원장 net/vat.
 * vat≈0일 때: 기록된 공급가(subtotal)가 있으면 total−net로 추론(VAT 0%·미적용 매장 보호).
 * subtotal도 없을 때만 포함가 7% 역산(레거시 스냅샷 누락 폴백).
 */
function resolvePosLedgerAmounts(params: {
  total: number
  subtotal?: number | null
  vatAmount?: number | null
}): { net: number; vat: number; total: number } {
  const total = Math.max(0, Number(params.total) || 0)
  let vat = Math.max(0, Number(params.vatAmount) || 0)
  let net = Math.max(0, Number(params.subtotal) || 0)
  if (total <= 0) return { net: 0, vat: 0, total: 0 }
  if (vat < 0.0001) {
    if (net > 0.0001) {
      vat = Math.max(0, total - net)
      if (vat < 0.0001) vat = 0
    } else {
      const split = splitThaiVatInclusiveGrossForReceipt(total, 7)
      if (split) {
        vat = split.vat
        net = split.exclusive
      } else {
        net = total
      }
    }
  } else if (net <= 0) {
    net = Math.max(0, total - vat)
  }
  return { net, vat, total }
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
    // memo 기반 소스 매핑은 store_name 공란 행에만 필요하다. 이미 store_name 이 있는 행은
    // resolveStoreDisplayNameForVatLedger(store_name) 으로 표준화되므로 매핑 조회가 불필요.
    // (조회 때마다 수천 건 POS/입고/지출 id 를 청크 조회하던 비용 제거)
    if (String(row.store_name || '').trim()) continue
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
 * POS 완료·결제·ready 주문 → 매출 부가세 원장 일괄 동기화.
 * 기간·금액은 매출 관리(posSalesByStore)와 동일: **매장 POS 영업일** + completed/paid/ready.
 */
export async function syncPosOrdersOutputVatLedger(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number; skipped: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').trim().slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!validMonths.length) return { upserted: 0, deleted: 0, skipped: 0 }

  const storeFilter = String(params.storeFilter || '').trim()
  const storeCodes =
    storeFilter && storeFilter !== 'All' && storeFilter !== '*' ? [storeFilter] : undefined

  let upserted = 0
  let deleted = 0
  let skipped = 0

  type SyncOrderRow = PeriodOrderRow & {
    id?: number
    order_no?: string | null
    created_by?: string | null
  }

  for (const ym of validMonths) {
    const startYmd = `${ym}-01`
    const endYmd = monthEndYmd(ym)
    const { rows, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      startStr: startYmd,
      endStr: endYmd,
      storeCodes,
      select: 'id,order_no,created_at,store_code,subtotal,vat,total,status,created_by,order_type',
      queryLabel: 'vatLedgerPosSync',
      /** 매출 관리와 동일 — 본사·test POS 제외 */
      excludeTestOfficePos: true,
    })

    const completed = filterCompletedPosSalesRows(rows as PeriodOrderRow[], null) as SyncOrderRow[]
    for (const order of completed) {
      const orderId = Math.floor(Number(order.id) || 0)
      if (orderId <= 0) {
        skipped += 1
        continue
      }
      const storeCode = String(order.store_code || '').trim()
      if (isPosSalesTestOfficeStoreCode(storeCode)) {
        skipped += 1
        continue
      }
      const hours = resolvePosBusinessHoursFromContext(bizCtx, storeCode)
      const created = String(order.created_at || '').trim()
      const createdDate = created ? new Date(created) : new Date()
      if (Number.isNaN(createdDate.getTime())) {
        skipped += 1
        continue
      }
      const bizYmd = getPosBusinessDateStrFromConfig(createdDate, hours)
      if (!isPosSalesBusinessYmdInInclusiveRange(bizYmd, startYmd, endYmd)) {
        skipped += 1
        continue
      }
      const taxMonth = bizYmd.slice(0, 7)
      if (!validMonths.includes(taxMonth)) {
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
        createdAtIso: created,
        businessDateYmd: bizYmd,
        subtotal: Number(order.subtotal ?? 0),
        total,
        vatAmount: Number(order.vat ?? 0),
        createdBy: String(order.created_by || 'system'),
      })
      upserted += 1
    }
  }

  // 취소·환불 건: 신고월 달력 창에서 draft 제거 (영업일 밖 취소도 원장에 남을 수 있음)
  const startYmdAll = monthStartYmd(validMonths[0]!)
  const endYmdAll = monthEndYmd(validMonths[validMonths.length - 1]!)
  const cancelStartIso = `${startYmdAll}T00:00:00+07:00`
  const cancelEndIso = `${addOneDayYmd(endYmdAll)}T08:00:00+07:00`
  try {
    const cancelled = (await supabaseSelectFilterAllPages(
      'pos_orders',
      `created_at=gte.${encodeURIComponent(cancelStartIso)}&created_at=lt.${encodeURIComponent(cancelEndIso)}&status=in.(cancelled,refunded)`,
      {
        select: 'id,store_code',
        order: 'id.asc',
        pageSize: 4000,
        maxRows: 100000,
      }
    )) as { id?: number; store_code?: string | null }[] | null
    const storeScope = storeCodes?.length
      ? await createAccountingStoreScopeMatcher(storeCodes[0])
      : null
    for (const order of cancelled || []) {
      const orderId = Math.floor(Number(order.id) || 0)
      if (orderId <= 0) continue
      if (storeScope) {
        const sc = String(order.store_code || '').trim()
        const sn = sc ? await resolveStoreDisplayNameForVatLedger(sc) : ''
        if (!(storeScope.matches(sc) || storeScope.matches(sn))) continue
      }
      await deletePosVatLedgerDraft(orderId)
      deleted += 1
    }
  } catch (e) {
    console.warn('syncPosOrdersOutputVatLedger cancel cleanup skipped:', e)
  }

  return { upserted, deleted, skipped }
}

function addOneDayYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+07:00`)
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

export async function upsertPosVatLedgerDraft(params: {
  posOrderId: number
  orderNo?: string
  storeCode?: string
  createdAtIso?: string
  /** POS 영업일(YYYY-MM-DD). 없으면 created_at 방콕 달력일 */
  businessDateYmd?: string
  subtotal?: number
  total?: number
  vatAmount?: number
  createdBy?: string
}) {
  const orderId = Math.floor(Number(params.posOrderId) || 0)
  if (orderId <= 0) return
  const total = Math.max(0, Number(params.total) || 0)
  if (total <= 0) return
  if (isPosSalesTestOfficeStoreCode(params.storeCode)) return

  const amounts = resolvePosLedgerAmounts({
    total,
    subtotal: params.subtotal,
    vatAmount: params.vatAmount,
  })
  if (amounts.net <= 0 && amounts.total <= 0) return

  let docDate = String(params.businessDateYmd || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
    // 실시간 저장 경로: 매장 영업일 설정이 있으면 영업일, 없으면 방콕 달력
    try {
      const { loadPosBusinessDaySettingsContext } = await import('@/lib/pos-business-day-server')
      const bizCtx = await loadPosBusinessDaySettingsContext()
      const hours = resolvePosBusinessHoursFromContext(bizCtx, String(params.storeCode || ''))
      const created = String(params.createdAtIso || '').trim()
      const createdDate = created ? new Date(created) : new Date()
      if (!Number.isNaN(createdDate.getTime())) {
        docDate = getPosBusinessDateStrFromConfig(createdDate, hours)
      }
    } catch {
      docDate = ''
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
    docDate = toBangkokYmd(params.createdAtIso)
  }
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
      net_amount: amounts.net,
      vat_amount: amounts.vat,
      total_amount: amounts.total,
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
