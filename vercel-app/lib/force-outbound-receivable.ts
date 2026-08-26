/**
 * 강제출고(stock_logs.log_type=ForceOutbound) → 미수금(ref ForceOutbound, ref_id=stock_logs.id)
 * 출고 관리 화면 금액과 동일 규칙: 단가×수량(직접정산 제외) 후 태국 VAT 합계(thaiInvoiceTotalsFromRawSubtotal)
 */
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
  supabaseDeleteByFilter,
} from './supabase-server'
import { getDirectSettlementMap } from './direct-settlement-server'
import { thaiInvoiceTotalsFromRawSubtotal } from './invoice-vat-total'
import { unitPriceFromOutboundLogSnapshot } from './outbound-order-line-match'
import { isInternalForceOutboundTarget } from './internal-outbound'
import { forceOutboundInvoiceAnchorId, forceOutboundInvoiceGroupKey } from './force-outbound-invoice'
import { formatForceOutboundInvoiceNo } from './receivable-invoice-format'

const TZ = 'Asia/Bangkok'

type ForceOutboundLog = {
  id?: number
  log_type?: string
  log_date?: string
  vendor_target?: string
  item_code?: string
  item_name?: string
  qty?: number
  invoice_unit_price?: number | string | null
  is_deleted?: boolean | null
  reference_no?: string | null
}

function normalizeStoreKey(v: string): string {
  const raw = String(v || '').trim().toLowerCase()
  if (!raw) return ''
  const noSpace = raw.replace(/\s+/g, ' ')
  return noSpace.startsWith('cm ') ? noSpace.slice(3).trim() : noSpace
}

function normalizeVendorCode(v: string): string {
  return String(v || '').trim().toLowerCase()
}

async function getReceivableStoreAliasSetByVendorCode(vendorCodeFilter: string): Promise<Set<string>> {
  const code = normalizeVendorCode(vendorCodeFilter)
  if (!code) return new Set<string>()
  const vendors = (await supabaseSelectFilter(
    'vendors',
    `code=eq.${encodeURIComponent(code)}`,
    { select: 'code,name,gps_name', limit: 1 }
  )) as { code?: string; name?: string; gps_name?: string }[] | null
  const v = vendors?.[0]
  if (!v) return new Set<string>()
  const aliases = new Set<string>()
  const name = normalizeStoreKey(String(v.name || ''))
  const gps = normalizeStoreKey(String(v.gps_name || ''))
  if (name) aliases.add(name)
  if (gps) aliases.add(gps)
  return aliases
}

async function loadItemMasterPrices(): Promise<Record<string, number>> {
  const items = (await supabaseSelect('items', {
    select: 'code,price',
    limit: 10000,
    order: 'id.asc',
  })) as { code?: string; price?: number }[]
  const priceByCode: Record<string, number> = {}
  for (const it of items || []) {
    const c = String(it.code || '').trim()
    if (c) priceByCode[c] = Number(it.price) || 0
  }
  return priceByCode
}

function bangkokYmdFromLogDate(logDate?: string): string {
  const d = logDate ? new Date(logDate) : new Date()
  return !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-CA', { timeZone: TZ })
    : new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

function forceOutboundGroupKeyFromLog(log: ForceOutboundLog): string | null {
  return forceOutboundInvoiceGroupKey({
    date: bangkokYmdFromLogDate(log.log_date),
    target: String(log.vendor_target || ''),
    referenceNo: log.reference_no,
  })
}

async function loadForceOutboundInvoiceSiblings(log: ForceOutboundLog): Promise<ForceOutboundLog[]> {
  const store = String(log.vendor_target || '').trim()
  const ref = String(log.reference_no || '').trim()
  if (!store || !ref) return [log]
  const rows = (await supabaseSelectFilter(
    'stock_logs',
    `log_type=eq.ForceOutbound&is_deleted=is.false&vendor_target=eq.${encodeURIComponent(store)}&reference_no=eq.${encodeURIComponent(ref)}`,
    { select: 'id,log_date,vendor_target,reference_no', limit: 500, order: 'id.asc' }
  )) as ForceOutboundLog[]
  const key = forceOutboundGroupKeyFromLog(log)
  if (!key) return [log]
  const sameGroup = (rows || []).filter((r) => forceOutboundGroupKeyFromLog(r) === key)
  return sameGroup.length ? sameGroup : [log]
}

function invoiceAnchorIdForForceLog(log: ForceOutboundLog, siblings: ForceOutboundLog[]): number {
  const selfId = Number(log.id) || 0
  const key = forceOutboundGroupKeyFromLog(log)
  if (!key) return selfId
  const ids = siblings
    .filter((r) => forceOutboundGroupKeyFromLog(r) === key)
    .map((r) => Number(r.id) || 0)
  return forceOutboundInvoiceAnchorId(ids.length ? ids : [selfId])
}

/** 단일 강제출고(HQ) 로그 기준 미수금 upsert/삭제 */
export async function syncReceivableFromForceOutboundStockLogRow(
  log: ForceOutboundLog,
  options?: { priceByCode?: Record<string, number>; siblingLogs?: ForceOutboundLog[] }
): Promise<void> {
  const stockLogId = Number(log.id)
  if (!stockLogId || Number.isNaN(stockLogId)) return
  if (String(log.log_type || '') !== 'ForceOutbound' || Boolean(log.is_deleted)) {
    await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.ForceOutbound&ref_id=eq.${stockLogId}`)
    return
  }

  const storeName = String(log.vendor_target || '').trim()
  const code = String(log.item_code || '').trim()
  const qtyAbs = Math.abs(Number(log.qty) || 0)
  const priceByCode = options?.priceByCode ?? (await loadItemMasterPrices())
  const master = priceByCode[code] ?? 0
  const unitPrice = unitPriceFromOutboundLogSnapshot(
    log,
    undefined,
    code,
    String(log.item_name || '').trim(),
    master
  )
  let rawSubtotal = qtyAbs * unitPrice
  if (isInternalForceOutboundTarget(storeName)) rawSubtotal = 0
  const directMap = code ? await getDirectSettlementMap([code]) : {}
  if (code && directMap[code]) rawSubtotal = 0

  if (rawSubtotal <= 0 || !storeName) {
    await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.ForceOutbound&ref_id=eq.${stockLogId}`)
    return
  }

  const { grandTotal } = thaiInvoiceTotalsFromRawSubtotal(rawSubtotal)
  if (grandTotal <= 0) {
    await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.ForceOutbound&ref_id=eq.${stockLogId}`)
    return
  }

  const d = log.log_date ? new Date(log.log_date) : new Date()
  const transDate = !isNaN(d.getTime())
    ? d.toLocaleDateString('en-CA', { timeZone: TZ })
    : new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const siblings = options?.siblingLogs?.length ? options.siblingLogs : await loadForceOutboundInvoiceSiblings(log)
  const anchorId = invoiceAnchorIdForForceLog(log, siblings)
  const invNo =
    formatForceOutboundInvoiceNo(anchorId || stockLogId, transDate) ||
    formatForceOutboundInvoiceNo(stockLogId, transDate)
  const memo = `강제출고 ${invNo}`

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.ForceOutbound&ref_id=eq.${stockLogId}`,
    { limit: 1 }
  )) as { id?: number }[]
  const row = {
    store_name: storeName,
    amount: grandTotal,
    ref_type: 'ForceOutbound',
    ref_id: stockLogId,
    trans_date: transDate.slice(0, 10),
    memo,
    invoice_no: invNo,
  }
  if (existing?.length) {
    await supabaseUpdate('receivable_transactions', existing[0].id!, {
      store_name: storeName,
      amount: grandTotal,
      trans_date: row.trans_date,
      memo,
      invoice_no: invNo,
    })
  } else {
    await supabaseInsert('receivable_transactions', row)
  }
}

export async function syncReceivableFromForceOutboundStockLogById(stockLogId: number): Promise<void> {
  if (!stockLogId || Number.isNaN(stockLogId)) return
  const rows = (await supabaseSelectFilter('stock_logs', `id=eq.${stockLogId}`, {
    limit: 1,
    select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted,reference_no',
  })) as ForceOutboundLog[]
  const log = rows?.[0]
  if (!log || String(log.log_type || '') !== 'ForceOutbound' || Boolean(log.is_deleted)) {
    await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.ForceOutbound&ref_id=eq.${stockLogId}`)
    return
  }
  await syncReceivableFromForceOutboundStockLogRow(log)
}

/** 기존 강제출고 건 일괄 미수금 반영(운영 복구용). 최근 N일(방콕 달력) HQ ForceOutbound 로그만 처리 */
export async function repairForceOutboundReceivablesRecentDays(days: number): Promise<{
  processed: number
  errors: number
}> {
  const d = Math.min(400, Math.max(1, Math.floor(days)))
  const startStr = new Date(Date.now() - d * 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
  const rows = (await supabaseSelectFilter(
    'stock_logs',
    `log_type=eq.ForceOutbound&is_deleted=is.false&log_date=gte.${startStr}`,
    {
      order: 'id.asc',
      limit: 8000,
      select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted,reference_no',
    }
  )) as ForceOutboundLog[]
  const priceByCode = await loadItemMasterPrices()
  let processed = 0
  let errors = 0
  for (const r of rows || []) {
    try {
      await syncReceivableFromForceOutboundStockLogRow(r, { priceByCode, siblingLogs: rows || [] })
      processed++
    } catch {
      errors++
    }
  }
  return { processed, errors }
}

/**
 * 출고 기준 일괄 맞춤 마지막 단계용 — HQ ForceOutbound 전건을 출고와 동일 규칙으로 미수금에 반영.
 * (기간 제한 없음, 최대 8000행 — 매출처 필터는 출고지 vendor_target)
 */
export async function reconcileAllForceOutboundReceivables(params: {
  storeFilter?: string
}): Promise<{ processed: number; errors: number }> {
  const filter = 'log_type=eq.ForceOutbound&is_deleted=is.false'
  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    order: 'id.asc',
    limit: 8000,
    select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted,reference_no',
  })) as ForceOutboundLog[]
  let scopedRows = rows || []
  const normalizedStoreFilter = String(params.storeFilter || '').trim()
  if (normalizedStoreFilter) {
    const aliasSetByVendorCode = await getReceivableStoreAliasSetByVendorCode(normalizedStoreFilter)
    if (aliasSetByVendorCode.size > 0) {
      scopedRows = scopedRows.filter((r) => aliasSetByVendorCode.has(normalizeStoreKey(String(r.vendor_target || ''))))
    } else {
      const fallbackNorm = normalizeStoreKey(normalizedStoreFilter)
      scopedRows = scopedRows.filter((r) => normalizeStoreKey(String(r.vendor_target || '')) === fallbackNorm)
    }
  }
  const priceByCode = await loadItemMasterPrices()
  let processed = 0
  let errors = 0
  for (const r of scopedRows) {
    try {
      await syncReceivableFromForceOutboundStockLogRow(r, { priceByCode, siblingLogs: rows || [] })
      processed++
    } catch {
      errors++
    }
  }
  return { processed, errors }
}
