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

/** 단일 강제출고(HQ) 로그 기준 미수금 upsert/삭제 */
export async function syncReceivableFromForceOutboundStockLogRow(
  log: ForceOutboundLog,
  options?: { priceByCode?: Record<string, number> }
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

  const datePart = transDate.replace(/\D/g, '').slice(0, 8)
  const invNo = `IVF${datePart}-${stockLogId}`
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
    select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted',
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
      select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted',
    }
  )) as ForceOutboundLog[]
  const priceByCode = await loadItemMasterPrices()
  let processed = 0
  let errors = 0
  for (const r of rows || []) {
    try {
      await syncReceivableFromForceOutboundStockLogRow(r, { priceByCode })
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
  let filter = 'log_type=eq.ForceOutbound&is_deleted=is.false'
  if (params.storeFilter?.trim()) {
    filter += `&vendor_target=ilike.${encodeURIComponent(params.storeFilter.trim())}`
  }
  const rows = (await supabaseSelectFilter('stock_logs', filter, {
    order: 'id.asc',
    limit: 8000,
    select: 'id,log_type,log_date,vendor_target,item_code,item_name,qty,invoice_unit_price,is_deleted',
  })) as ForceOutboundLog[]
  const priceByCode = await loadItemMasterPrices()
  let processed = 0
  let errors = 0
  for (const r of rows || []) {
    try {
      await syncReceivableFromForceOutboundStockLogRow(r, { priceByCode })
      processed++
    } catch {
      errors++
    }
  }
  return { processed, errors }
}
