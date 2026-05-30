import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { createAccountingStoreScopeMatcher } from '@/lib/accounting-store-scope'
import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
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

/** POS store_code·별칭 → erp_stores.display_name (세무 원장 store_name 정합) */
export async function resolveStoreDisplayNameForVatLedger(storeKey: string): Promise<string> {
  const key = String(storeKey || '').trim()
  if (!key) return ''
  const masters = await fetchErpStoresMaster()
  for (const row of masters) {
    const display = String(row.display_name || '').trim()
    const code = String(row.store_code || '').trim()
    if (display && storesMatchForGradeLookup(display, key)) return display
    if (code && storesMatchForGradeLookup(code, key)) return display || code
    for (const alias of row.aliases || []) {
      const a = String(alias || '').trim()
      if (a && storesMatchForGradeLookup(a, key)) return display || code || key
    }
  }
  return key
}

/** 과거 POS 자동 매출 행의 store_name(store_code) → display_name 백필 */
export async function backfillPosVatLedgerStoreNames(validMonths: string[]): Promise<number> {
  const months = (validMonths || []).map((m) => String(m || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!months.length) return 0
  const monthFilter = buildTaxMonthPostgrestFilter(months)
  const rows = (await supabaseSelectFilterAllPages('vat_ledger_entries', `${monthFilter}&direction=eq.output`, {
    select: 'id,store_name,memo',
    order: 'id.asc',
    pageSize: 4000,
    maxRows: 100000,
  })) as { id?: number; store_name?: string | null; memo?: string | null }[]
  let updated = 0
  for (const row of rows || []) {
    if (!/\[AUTO:POS_ORDER:/i.test(String(row.memo || ''))) continue
    const id = Math.floor(Number(row.id) || 0)
    if (id <= 0) continue
    const current = String(row.store_name || '').trim()
    const resolved = await resolveStoreDisplayNameForVatLedger(current)
    if (!resolved || resolved === current) continue
    await supabaseUpdate('vat_ledger_entries', id, {
      store_name: resolved.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    updated += 1
  }
  return updated
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
    if (storeFilter && storeName && !storeScope.matches(storeName)) {
      skipped += 1
      continue
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
