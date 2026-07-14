import 'server-only'

import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdate,
} from './supabase-server'
import {
  buildItemTaxMapFromRows,
  computeInboundBatchAmounts,
  formatStockLogDateBangkokYmd,
  parseInboundDateBangkokYmd,
  type InboundPayableLine,
} from './inbound-payable-amount'

type StockLogRow = {
  item_code?: string
  qty?: number
  unit_cost?: number | null
  log_date?: string
}

/** 입고 배치의 미지급 Inbound 행 전부 삭제 */
export async function deleteInboundPayableTransaction(batchId: number): Promise<void> {
  const id = Number(batchId || 0)
  if (!id) return
  await supabaseDeleteByFilter('payable_transactions', `ref_type=eq.Inbound&ref_id=eq.${id}`)
}

/** inbound_batches + stock_logs 기준으로 미지급 Inbound 금액(VAT 포함)·일자 동기화 */
export async function syncPayableFromInboundBatch(batchId: number): Promise<void> {
  const id = Number(batchId || 0)
  if (!id) return

  const batches = (await supabaseSelectFilter('inbound_batches', `id=eq.${id}`, {
    limit: 1,
    select: 'id,vendor_name,vendor_code,batch_date',
  })) as { id?: number; vendor_name?: string; vendor_code?: string; batch_date?: string }[] | null
  const batch = batches?.[0]
  if (!batch?.id) return

  const logs = (await supabaseSelectFilter('stock_logs', `inbound_batch_id=eq.${id}`, {
    limit: 5000,
    select: 'item_code,qty,unit_cost,log_date',
  })) as StockLogRow[] | null

  const lines: InboundPayableLine[] = []
  for (const row of logs || []) {
    const code = String(row.item_code || '').trim()
    const qty = Number(row.qty) || 0
    if (!code || qty <= 0) continue
    const unitCost = row.unit_cost != null && !isNaN(Number(row.unit_cost)) ? Number(row.unit_cost) : 0
    lines.push({
      code,
      qty,
      unitCost,
      dateYmd: formatStockLogDateBangkokYmd(row.log_date),
    })
  }
  if (!lines.length) {
    await supabaseUpdate('inbound_batches', id, { total_amount: 0 })
    await deleteInboundPayableTransaction(id)
    return
  }

  const codes = [...new Set(lines.map((l) => l.code))]
  const itemRows = (await supabaseSelect('items', {
    limit: 5000,
    select: 'code,tax',
  })) as { code?: string; tax?: string | null }[] | null
  const taxByCode = buildItemTaxMapFromRows(
    (itemRows || []).filter((r) => codes.includes(String(r.code || '').trim()))
  )

  const { grossTotal, batchDateYmd } = computeInboundBatchAmounts(lines, taxByCode)
  if (grossTotal <= 0) {
    await supabaseUpdate('inbound_batches', id, {
      batch_date: batchDateYmd,
      total_amount: 0,
    })
    await deleteInboundPayableTransaction(id)
    return
  }
  const vendorName = String(batch.vendor_name || '').trim()
  const payVendorCode = String(batch.vendor_code || '').trim() || vendorName
  const memo = `입고 ${batchDateYmd} ${vendorName || '-'}`.slice(0, 240)

  await supabaseUpdate('inbound_batches', id, {
    batch_date: batchDateYmd,
    total_amount: grossTotal,
  })

  await upsertInboundPayableTransaction({
    batchId: id,
    vendorCode: payVendorCode,
    amount: grossTotal,
    transDate: batchDateYmd,
    memo,
  })
}

/** 입고 배치당 payable_transactions 1행 유지 — 중복 INSERT·이중 잔액 방지 */
export async function upsertInboundPayableTransaction(params: {
  batchId: number
  vendorCode: string
  amount: number
  transDate: string
  memo: string
}): Promise<void> {
  const batchId = Number(params.batchId || 0)
  if (!batchId || params.amount <= 0) return

  const payables = (await supabaseSelectFilter('payable_transactions', `ref_type=eq.Inbound&ref_id=eq.${batchId}`, {
    limit: 50,
    select: 'id',
    order: 'id.asc',
  })) as { id?: number }[] | null

  const ids = (payables || []).map((p) => p.id).filter((id): id is number => id != null && id > 0)
  const vendorCode = String(params.vendorCode || '').trim()
  const memo = String(params.memo || '').slice(0, 240)

  if (ids.length > 0) {
    await supabaseUpdate('payable_transactions', ids[0], {
      amount: params.amount,
      trans_date: params.transDate,
      memo,
      ...(vendorCode ? { vendor_code: vendorCode } : {}),
    })
    for (let i = 1; i < ids.length; i++) {
      await supabaseDeleteByFilter('payable_transactions', `id=eq.${ids[i]}`)
    }
    return
  }

  await supabaseInsert('payable_transactions', {
    vendor_code: vendorCode,
    amount: params.amount,
    ref_type: 'Inbound',
    ref_id: batchId,
    trans_date: params.transDate,
    memo,
  })
}

/** 등록 직후 payable 행 생성용 (sync와 동일 산식) */
export function computeInboundRegisterTotals(
  list: { date?: string; code?: string; qty?: number | string; cost?: number | string }[],
  taxByCode: ReadonlyMap<string, import('./income-statement-item-vat').ItemTaxType>
): { grossTotal: number; batchDateYmd: string; lines: InboundPayableLine[] } {
  const lines: InboundPayableLine[] = list
    .map((item) => {
      const code = String(item.code || '').trim()
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
      const costVal = item.cost != null && item.cost !== '' ? parseFloat(String(item.cost).replace(/,/g, '')) : null
      const unitCost = costVal != null && !isNaN(costVal) && costVal >= 0 ? costVal : 0
      return {
        code,
        qty,
        unitCost,
        dateYmd: parseInboundDateBangkokYmd(item.date),
      }
    })
    .filter((l) => l.code && l.qty > 0)

  const { grossTotal, batchDateYmd } = computeInboundBatchAmounts(lines, taxByCode)
  return { grossTotal, batchDateYmd, lines }
}
