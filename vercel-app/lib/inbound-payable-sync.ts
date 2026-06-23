import 'server-only'

import { supabaseSelect, supabaseSelectFilter, supabaseUpdate } from './supabase-server'
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
  if (!lines.length) return

  const codes = [...new Set(lines.map((l) => l.code))]
  const itemRows = (await supabaseSelect('items', {
    limit: 5000,
    select: 'code,tax',
  })) as { code?: string; tax?: string | null }[] | null
  const taxByCode = buildItemTaxMapFromRows(
    (itemRows || []).filter((r) => codes.includes(String(r.code || '').trim()))
  )

  const { grossTotal, batchDateYmd } = computeInboundBatchAmounts(lines, taxByCode)
  if (grossTotal <= 0) return

  const vendorName = String(batch.vendor_name || '').trim()
  const payVendorCode = String(batch.vendor_code || '').trim() || vendorName
  const memo = `입고 ${batchDateYmd} ${vendorName || '-'}`.slice(0, 240)

  await supabaseUpdate('inbound_batches', id, {
    batch_date: batchDateYmd,
    total_amount: grossTotal,
  })

  const payables = (await supabaseSelectFilter('payable_transactions', `ref_type=eq.Inbound&ref_id=eq.${id}`, {
    limit: 1,
    select: 'id',
  })) as { id?: number }[] | null

  if (payables?.length && payables[0].id) {
    await supabaseUpdate('payable_transactions', payables[0].id, {
      amount: grossTotal,
      trans_date: batchDateYmd,
      memo,
      ...(payVendorCode ? { vendor_code: payVendorCode } : {}),
    })
  }
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
