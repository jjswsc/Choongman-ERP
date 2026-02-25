import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 입고 내역 조회 - stock_logs log_type=Inbound (From HQ 제외) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    let startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
    let endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
    const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
    const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()

    if (!startStr || !endStr) {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      startStr = first.toISOString().slice(0, 10)
      endStr = last.toISOString().slice(0, 10)
    }

    const itemRows = (await supabaseSelect('items', { order: 'id.asc', limit: 5000, select: 'code,spec,cost,purchase_source' })) as {
      code?: string
      spec?: string
      cost?: number
      purchase_source?: string
    }[] | null
    const itemMap: Record<string, { spec: string; cost: number; purchaseSource: 'hq' | 'store' }> = {}
    for (const row of itemRows || []) {
      const code = String(row.code || '').trim()
      if (code) {
        const ps = String(row.purchase_source || '').trim()
        itemMap[code] = {
          spec: row.spec || '-',
          cost: Number(row.cost) || 0,
          purchaseSource: ps === 'store' ? 'store' : 'hq',
        }
      }
    }

    let locationFilter = 'log_type=eq.Inbound'
    if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체 매장') {
      locationFilter += `&location=eq.${encodeURIComponent(storeFilter)}`
    }
    const logs = (await supabaseSelectFilter(
      'stock_logs',
      locationFilter,
      { order: 'log_date.desc', limit: 400, select: 'log_date,vendor_target,item_code,item_name,qty,unit_cost,inbound_batch_id' }
    )) as {
      log_date?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      unit_cost?: number | null
      inbound_batch_id?: number | null
    }[] | null

    const startD = new Date(startStr)
    const endD = new Date(endStr)
    startD.setHours(0, 0, 0, 0)
    endD.setHours(23, 59, 59, 999)

    const list: { date: string; vendor: string; name: string; spec: string; qty: number; amount: number; code?: string; purchaseSource?: 'hq' | 'store'; inbound_batch_id?: number | null; po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean; po_created_at?: string | null }[] = []
    for (const row of logs || []) {
      if (String(row.vendor_target || '').trim() === 'From HQ') continue
      const rowDate = row.log_date ? new Date(row.log_date) : null
      if (!rowDate || isNaN(rowDate.getTime())) continue
      if (rowDate < startD || rowDate > endD) continue

      const rowVendor = String(row.vendor_target || '').trim()
      if (vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매입처' && rowVendor !== vendorFilter) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', cost: 0, purchaseSource: 'hq' as const }
      const qty = Number(row.qty) || 0
      const unitCost = row.unit_cost != null && !isNaN(Number(row.unit_cost)) ? Number(row.unit_cost) : info.cost
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        vendor: rowVendor,
        name: row.item_name || '-',
        spec: info.spec,
        qty,
        amount: unitCost * qty,
        code: code || undefined,
        purchaseSource: info.purchaseSource,
        inbound_batch_id: row.inbound_batch_id ?? undefined,
      })
      if (list.length >= 300) break
    }

    const batchIds = [...new Set(list.map((r) => r.inbound_batch_id).filter((id): id is number => typeof id === 'number' && id > 0))]
    const batchMap: Record<number, { po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean; po_created_at?: string | null }> = {}
    if (batchIds.length > 0) {
      const batchFilter = `id=in.(${batchIds.join(',')})`
      const batches = (await supabaseSelectFilter('inbound_batches', batchFilter, {
        select: 'id,po_no,invoice_no,invoice_received,purchase_order_id',
      })) as { id?: number; po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean; purchase_order_id?: number | null }[]
      const poIds = [...new Set((batches || []).map((b) => b.purchase_order_id).filter((id): id is number => typeof id === 'number' && id > 0))]
      const poCreatedMap: Record<number, string> = {}
      if (poIds.length > 0) {
        const poFilter = `id=in.(${poIds.join(',')})`
        const pos = (await supabaseSelectFilter('purchase_orders', poFilter, {
          select: 'id,created_at',
        })) as { id?: number; created_at?: string }[]
        for (const p of pos || []) {
          if (p.id && p.created_at) poCreatedMap[p.id] = p.created_at.slice(0, 10)
        }
      }
      for (const b of batches || []) {
        if (b.id) {
          const poDate = b.purchase_order_id ? (poCreatedMap[b.purchase_order_id] ?? null) : null
          batchMap[b.id] = { po_no: b.po_no, invoice_no: b.invoice_no, invoice_received: Boolean(b.invoice_received), po_created_at: poDate }
        }
      }
    }
    for (const item of list) {
      const batch = item.inbound_batch_id ? batchMap[item.inbound_batch_id] : null
      if (batch) {
        item.po_no = batch.po_no
        item.invoice_no = batch.invoice_no
        item.invoice_received = batch.invoice_received
        item.po_created_at = batch.po_created_at
      }
    }

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInboundHistory:', e)
    return NextResponse.json([], { headers })
  }
}
